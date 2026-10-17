import { Response } from 'express';
import mongoose from 'mongoose';
import Employee from '../models/Employee';
import { PayrollDayClaim } from '../models/Payroll';
import { audit } from '../services/payrollService';
import Attendance, { type IAttendance } from '../models/Attendance';
import EmployeeLeave, { type IEmployeeLeave } from '../models/EmployeeLeave';
import type { AuthRequest } from '../middleware/auth';
import { buildTenantFilter, getAppSettingsForTenant, getTenantObjectId } from '../utils/tenancy';
import { findBestFaceMatch } from '../utils/faceMatch';
import {
    daysBetweenInclusive,
    isDateKey,
    listDateKeys,
    resolveTimeZone,
    toDateKey,
    weekdayOf,
} from '../utils/attendanceDates';

/** A second scan sooner than this is treated as a repeat of the check-in, not a check-out. */
const MIN_SHIFT_MS = 5 * 60 * 1000;
/** An open check-in younger than this is closed by the next scan, even after midnight. */
const MAX_SHIFT_MS = 14 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 93;
const DEFAULT_WEEKLY_OFF_DAYS = [0];

const EMPLOYEE_SUMMARY_FIELDS = 'fullName employeeCode designation photo status joiningDate faceRegisteredAt createdAt';

type DayStatus = 'present' | 'leave' | 'off' | 'absent' | 'upcoming' | 'not_joined';
type LeanAttendance = Omit<IAttendance, keyof mongoose.Document> & { _id: mongoose.Types.ObjectId };
type LeanLeave = Omit<IEmployeeLeave, keyof mongoose.Document> & { _id: mongoose.Types.ObjectId };
interface EmployeeSummarySource {
    _id: mongoose.Types.ObjectId;
    fullName: string;
    employeeCode: string;
    designation: string;
    photo: string;
    status: string;
    joiningDate: string;
    faceRegisteredAt?: Date | null;
    createdAt: Date;
}

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

const isValidId = (id: unknown): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

const summarizeEmployee = (employee: EmployeeSummarySource) => ({
    _id: String(employee._id),
    fullName: employee.fullName,
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    photo: employee.photo,
    status: employee.status,
    joiningDate: employee.joiningDate,
    hasFace: Boolean(employee.faceRegisteredAt),
});

const workedMinutes = (record?: Pick<IAttendance, 'checkIn' | 'checkOut'> | null) =>
    record?.checkIn && record.checkOut
        ? Math.max(0, Math.round((new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000))
        : 0;

const serializeRecord = (record: Pick<LeanAttendance, '_id' | 'dateKey' | 'checkIn' | 'checkOut' | 'checkInMethod' | 'checkOutMethod' | 'note'>) => ({
    _id: String(record._id),
    dateKey: record.dateKey,
    checkIn: record.checkIn || null,
    checkOut: record.checkOut || null,
    checkInMethod: record.checkInMethod || null,
    checkOutMethod: record.checkOutMethod || null,
    note: record.note || '',
    workedMinutes: workedMinutes(record),
});

const getWeeklyOffDays = async (req: AuthRequest) => {
    const settings = await getAppSettingsForTenant(req.user!);
    return Array.isArray(settings.attendanceWeeklyOffDays) ? settings.attendanceWeeklyOffDays : DEFAULT_WEEKLY_OFF_DAYS;
};

const resolveDayStatus = ({ day, today, record, leave, weeklyOffDays, joiningDate }: {
    day: string;
    today: string;
    record?: LeanAttendance;
    leave?: LeanLeave;
    weeklyOffDays: number[];
    joiningDate?: string;
}): DayStatus => {
    if (record && (record.checkIn || record.checkOut)) return 'present';
    if (joiningDate && day < joiningDate) return 'not_joined';
    if (weeklyOffDays.includes(weekdayOf(day))) return 'off';
    if (leave) return 'leave';
    if (day > today) return 'upcoming';
    return 'absent';
};

/** Without a joining date, days before the profile existed are not counted as absences. */
const effectiveStartDate = (employee: EmployeeSummarySource, timeZone: string) =>
    employee.joiningDate || (employee.createdAt ? toDateKey(new Date(employee.createdAt), timeZone) : '');

const findLeaveFor = (leaves: LeanLeave[], employeeId: string, day: string) =>
    leaves.find((leave) => String(leave.employeeId) === employeeId && leave.startDate <= day && leave.endDate >= day);

export const punchAttendance = async (req: AuthRequest, res: Response) => {
    try {
        const { descriptor, photo = '' } = req.body as { descriptor: number[]; photo?: string };
        const timeZone = resolveTimeZone(req.body.timeZone);
        const tenantFilter = buildTenantFilter(req.user!);

        const employees = await Employee.find({ ...tenantFilter, status: 'active', faceRegisteredAt: { $ne: null } })
            .select(`+faceDescriptors ${EMPLOYEE_SUMMARY_FIELDS}`)
            .lean();
        if (employees.length === 0) {
            return res.status(404).json({ message: 'No active employee has a registered face yet.', code: 'NO_ENROLLED_FACES' });
        }

        const match = findBestFaceMatch(descriptor, employees.map((employee) => ({ value: employee, descriptors: employee.faceDescriptors || [] })));
        if (match.status === 'no_match') {
            return res.status(404).json({ message: 'Face not recognized. Please look straight at the camera and try again.', code: 'FACE_NOT_RECOGNIZED' });
        }
        if (match.status === 'ambiguous') {
            return res.status(409).json({ message: 'Face matched more than one employee. Please try again or ask a manager to mark attendance.', code: 'FACE_AMBIGUOUS' });
        }

        const employee = summarizeEmployee(match.value);
        const employeeId = match.value._id;
        const now = new Date();

        // The second scan closes the latest open shift, including one that started before midnight.
        const openRecord = await Attendance.findOne({
            ...tenantFilter,
            employeeId,
            checkIn: { $gte: new Date(now.getTime() - MAX_SHIFT_MS) },
            checkOut: null,
        }).sort({ checkIn: -1 }).lean<LeanAttendance>();

        if (openRecord) {
            if (await PayrollDayClaim.exists({ ...tenantFilter, employeeId, dateKey: openRecord.dateKey })) return res.status(409).json({ message: 'This attendance date belongs to approved payroll. Use a payroll adjustment for corrections.' });
            if (now.getTime() - new Date(openRecord.checkIn!).getTime() < MIN_SHIFT_MS) {
                return res.json({ action: 'already_checked_in', employee, record: serializeRecord(openRecord) });
            }

            const closed = await Attendance.findOneAndUpdate(
                { _id: openRecord._id, checkOut: null },
                { $set: { checkOut: now, checkOutMethod: 'face', checkOutPhoto: photo, updatedBy: req.user?.id } },
                { new: true }
            ).lean<LeanAttendance>();

            if (!closed) {
                const current = await Attendance.findById(openRecord._id).lean<LeanAttendance>();
                return res.json({ action: 'already_checked_out', employee, record: current ? serializeRecord(current) : null });
            }
            return res.json({ action: 'check_out', employee, record: serializeRecord(closed) });
        }

        const dateKey = toDateKey(now, timeZone);
        const todayRecord = await Attendance.findOne({ ...tenantFilter, employeeId, dateKey }).lean<LeanAttendance>();

        if (todayRecord?.checkIn && todayRecord.checkOut) {
            return res.json({ action: 'already_checked_out', employee, record: serializeRecord(todayRecord) });
        }

        if (todayRecord) {
            // Reached for a manual entry with no check-in, a same-day check-in older than MAX_SHIFT_MS,
            // or a check-in a concurrent scan created after the open-shift lookup above.
            if (!todayRecord.checkIn) {
                const updated = await Attendance.findOneAndUpdate(
                    { _id: todayRecord._id, checkIn: null },
                    { $set: { checkIn: now, checkInMethod: 'face', checkInPhoto: photo, updatedBy: req.user?.id } },
                    { new: true }
                ).lean<LeanAttendance>();
                if (updated) return res.json({ action: 'check_in', employee, record: serializeRecord(updated) });
            } else if (now.getTime() - new Date(todayRecord.checkIn).getTime() >= MIN_SHIFT_MS) {
                const updated = await Attendance.findOneAndUpdate(
                    { _id: todayRecord._id, checkOut: null },
                    { $set: { checkOut: now, checkOutMethod: 'face', checkOutPhoto: photo, updatedBy: req.user?.id } },
                    { new: true }
                ).lean<LeanAttendance>();
                if (updated) return res.json({ action: 'check_out', employee, record: serializeRecord(updated) });
            }

            // Too soon after check-in, or another scan changed the record first.
            const current = await Attendance.findById(todayRecord._id).lean<LeanAttendance>();
            return res.json({
                action: current?.checkOut ? 'already_checked_out' : 'already_checked_in',
                employee,
                record: current ? serializeRecord(current) : null,
            });
        }

        try {
            const record = await Attendance.create({
                employeeId,
                dateKey,
                checkIn: now,
                checkInMethod: 'face',
                checkInPhoto: photo,
                timeZone,
                updatedBy: req.user?.id,
                businessId: getTenantObjectId(req.user!),
            });
            return res.status(201).json({ action: 'check_in', employee, record: serializeRecord(record.toObject() as LeanAttendance) });
        } catch (error: unknown) {
            // A simultaneous scan from another camera already created today's record.
            if ((error as { code?: number })?.code !== 11000) throw error;
            const current = await Attendance.findOne({ ...tenantFilter, employeeId, dateKey }).lean<LeanAttendance>();
            return res.json({ action: 'already_checked_in', employee, record: current ? serializeRecord(current) : null });
        }
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to record attendance') });
    }
};

export const getAttendanceEmployees = async (req: AuthRequest, res: Response) => {
    try {
        const employees = await Employee.find(buildTenantFilter(req.user!))
            .select(EMPLOYEE_SUMMARY_FIELDS)
            .sort({ fullName: 1 })
            .lean<EmployeeSummarySource[]>();
        return res.json(employees.map(summarizeEmployee));
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch employees') });
    }
};

export const getDailyAttendance = async (req: AuthRequest, res: Response) => {
    try {
        const timeZone = resolveTimeZone(req.query.timeZone);
        const today = toDateKey(new Date(), timeZone);
        const date = isDateKey(req.query.date) ? req.query.date : today;
        const tenantFilter = buildTenantFilter(req.user!);

        const [employees, records, leaves, weeklyOffDays] = await Promise.all([
            Employee.find(tenantFilter).select(EMPLOYEE_SUMMARY_FIELDS).sort({ fullName: 1 }).lean<EmployeeSummarySource[]>(),
            Attendance.find({ ...tenantFilter, dateKey: date }).lean<LeanAttendance[]>(),
            EmployeeLeave.find({ ...tenantFilter, startDate: { $lte: date }, endDate: { $gte: date } }).lean<LeanLeave[]>(),
            getWeeklyOffDays(req),
        ]);

        const recordByEmployee = new Map(records.map((record) => [String(record.employeeId), record]));
        const rows = employees
            .filter((employee) => employee.status === 'active' || recordByEmployee.has(String(employee._id)))
            .map((employee) => {
                const id = String(employee._id);
                const record = recordByEmployee.get(id);
                const leave = findLeaveFor(leaves, id, date);
                return {
                    employee: summarizeEmployee(employee),
                    record: record ? serializeRecord(record) : null,
                    leave: leave ? { _id: String(leave._id), leaveType: leave.leaveType, reason: leave.reason, startDate: leave.startDate, endDate: leave.endDate } : null,
                    status: resolveDayStatus({ day: date, today, record, leave, weeklyOffDays, joiningDate: effectiveStartDate(employee, timeZone) }),
                };
            });

        return res.json({ date, today, weeklyOffDays, rows });
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch attendance') });
    }
};

const sameTime = (a?: Date | null, b?: Date | null) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

export const upsertAttendanceRecord = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    try {
        const { employeeId, dateKey, note = '' } = req.body;
        const checkIn: Date | null = req.body.checkIn || null;
        const checkOut: Date | null = req.body.checkOut || null;
        if (!checkIn && !checkOut) return res.status(400).json({ message: 'Enter a check-in or check-out time.' });
        if (checkIn && checkOut && checkOut <= checkIn) return res.status(400).json({ message: 'Check-out must be after check-in.' });
        let record: LeanAttendance | null = null;
        await session.withTransaction(async () => {
            const tenantFilter = buildTenantFilter(req.user!);
            const employee = await Employee.findOneAndUpdate({ _id: employeeId, ...tenantFilter }, { $inc: { payrollRevision: 1 } }, { new: true, session });
            if (!employee) throw new Error('Employee not found');
            if (await PayrollDayClaim.exists({ ...tenantFilter, employeeId, dateKey }).session(session)) throw new Error('Approved payroll attendance is locked. Use a payroll adjustment for corrections.');
            const existing = await Attendance.findOne({ ...tenantFilter, employeeId, dateKey }).session(session).lean<LeanAttendance>();
            const update = { checkIn, checkOut, checkInMethod: checkIn ? (existing && sameTime(existing.checkIn, checkIn) ? existing.checkInMethod : 'manual') : null, checkOutMethod: checkOut ? (existing && sameTime(existing.checkOut, checkOut) ? existing.checkOutMethod : 'manual') : null, note, updatedBy: req.user!.id };
            record = existing
                ? await Attendance.findOneAndUpdate({ _id: existing._id, ...tenantFilter }, { $set: update }, { new: true, session }).lean<LeanAttendance>()
                : (await Attendance.create([{ ...update, employeeId, dateKey, timeZone: resolveTimeZone(req.body.timeZone), businessId: getTenantObjectId(req.user!) }], { session }))[0].toObject() as LeanAttendance;
            await audit(req.user!.businessId, req.user!.id, 'attendance.correct', String(record!._id), note || 'Manual attendance correction', existing ? { checkIn: existing.checkIn, checkOut: existing.checkOut, dateKey } : null, { checkIn, checkOut, dateKey }, session);
        });
        return res.json(serializeRecord(record!));
    } catch (error) { return res.status(409).json({ message: getErrorMessage(error, 'Failed to save attendance') }); }
    finally { await session.endSession(); }
};
export const getAttendanceRecordPhotos = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Attendance record not found' });

        const record = await Attendance.findOne({ _id: id, ...buildTenantFilter(req.user!) })
            .select('+checkInPhoto +checkOutPhoto')
            .lean();
        if (!record) return res.status(404).json({ message: 'Attendance record not found' });

        return res.json({ checkInPhoto: record.checkInPhoto || '', checkOutPhoto: record.checkOutPhoto || '' });
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch photos') });
    }
};

export const deleteAttendanceRecord = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Attendance record not found' });
        await session.withTransaction(async () => {
            const tenantFilter = buildTenantFilter(req.user!);
            const record = await Attendance.findOne({ _id: id, ...tenantFilter }).session(session);
            if (!record) throw new Error('Attendance record not found');
            await Employee.updateOne({ _id: record.employeeId, ...tenantFilter }, { $inc: { payrollRevision: 1 } }, { session });
            if (await PayrollDayClaim.exists({ ...tenantFilter, employeeId: record.employeeId, dateKey: record.dateKey }).session(session)) throw new Error('Approved payroll attendance cannot be deleted.');
            await Attendance.deleteOne({ _id: id, ...tenantFilter }, { session });
            await audit(req.user!.businessId, req.user!.id, 'attendance.delete', id, 'Manual attendance deletion', { dateKey: record.dateKey, checkIn: record.checkIn, checkOut: record.checkOut }, null, session);
        });
        return res.json({ message: 'Attendance record deleted' });
    } catch (error) { return res.status(409).json({ message: getErrorMessage(error, 'Failed to delete attendance') }); }
    finally { await session.endSession(); }
};
export const getLeaves = async (req: AuthRequest, res: Response) => {
    try {
        const tenantFilter = buildTenantFilter(req.user!);
        const filter: Record<string, unknown> = { ...tenantFilter };
        if (isDateKey(req.query.to)) filter.startDate = { $lte: req.query.to };
        if (isDateKey(req.query.from)) filter.endDate = { $gte: req.query.from };
        if (isValidId(req.query.employeeId)) filter.employeeId = req.query.employeeId;

        const [leaves, employees] = await Promise.all([
            EmployeeLeave.find(filter).sort({ startDate: -1 }).lean<LeanLeave[]>(),
            Employee.find(tenantFilter).select(EMPLOYEE_SUMMARY_FIELDS).lean<EmployeeSummarySource[]>(),
        ]);
        const employeeById = new Map(employees.map((employee) => [String(employee._id), summarizeEmployee(employee)]));

        return res.json(leaves
            .filter((leave) => employeeById.has(String(leave.employeeId)))
            .map((leave) => ({
                _id: String(leave._id),
                employee: employeeById.get(String(leave.employeeId)),
                startDate: leave.startDate,
                endDate: leave.endDate,
                leaveType: leave.leaveType,
                reason: leave.reason,
                days: daysBetweenInclusive(leave.startDate, leave.endDate),
                createdAt: leave.createdAt,
            })));
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch leaves') });
    }
};

export const createLeave = async (req: AuthRequest, res: Response) => {
    try {
        const { employeeId, startDate, endDate, leaveType, reason = '' } = req.body;
        if (!isDateKey(startDate) || !isDateKey(endDate)) {
            return res.status(400).json({ message: 'Enter valid leave dates.' });
        }
        if (endDate < startDate) {
            return res.status(400).json({ message: 'Leave end date cannot be before the start date.' });
        }
        if (daysBetweenInclusive(startDate, endDate) > 366) {
            return res.status(400).json({ message: 'A single leave cannot be longer than a year.' });
        }

        const tenantFilter = buildTenantFilter(req.user!);
        const employee = await Employee.findOne({ _id: employeeId, ...tenantFilter }).select('_id payrollEnrolled');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        if (employee.payrollEnrolled) return res.status(409).json({ message: 'Create leave for enrolled employees through Payroll Requests so approval and balances are enforced.' });

        const overlapping = await EmployeeLeave.findOne({
            ...tenantFilter,
            employeeId: employee._id,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
        }).lean();
        if (overlapping) {
            return res.status(409).json({ message: `This overlaps an existing leave (${overlapping.startDate} to ${overlapping.endDate}).` });
        }

        const leave = await EmployeeLeave.create({
            employeeId: employee._id,
            startDate,
            endDate,
            leaveType,
            reason,
            createdBy: req.user?.id,
            businessId: getTenantObjectId(req.user!),
        });

        return res.status(201).json({ _id: String(leave._id) });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to save leave') });
    }
};

export const deleteLeave = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Leave not found' });

        const existing = await EmployeeLeave.findOne({ _id: id, ...buildTenantFilter(req.user!) });
        if (existing && (existing.payrollRequestId || await PayrollDayClaim.exists({ ...buildTenantFilter(req.user!), employeeId: existing.employeeId, dateKey: { $gte: existing.startDate, $lte: existing.endDate } }))) return res.status(409).json({ message: 'Payroll leave must be cancelled through its request; approved payroll dates are locked.' });
        const leave = await EmployeeLeave.findOneAndDelete({ _id: id, ...buildTenantFilter(req.user!) });
        if (!leave) return res.status(404).json({ message: 'Leave not found' });

        return res.json({ message: 'Leave deleted' });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to delete leave') });
    }
};

export const getAttendanceReport = async (req: AuthRequest, res: Response) => {
    try {
        const { from, to } = req.query;
        if (!isDateKey(from) || !isDateKey(to)) {
            return res.status(400).json({ message: 'Choose a valid date range.' });
        }
        if (to < from) {
            return res.status(400).json({ message: 'The end date cannot be before the start date.' });
        }
        if (daysBetweenInclusive(from, to) > MAX_REPORT_DAYS) {
            return res.status(400).json({ message: `Reports can cover at most ${MAX_REPORT_DAYS} days.` });
        }

        const timeZone = resolveTimeZone(req.query.timeZone);
        const today = toDateKey(new Date(), timeZone);
        const employeeId = isValidId(req.query.employeeId) ? req.query.employeeId : '';
        const tenantFilter = buildTenantFilter(req.user!);

        const [employees, records, leaves, weeklyOffDays] = await Promise.all([
            Employee.find({ ...tenantFilter, ...(employeeId ? { _id: employeeId } : {}) })
                .select(EMPLOYEE_SUMMARY_FIELDS)
                .sort({ fullName: 1 })
                .lean<EmployeeSummarySource[]>(),
            Attendance.find({ ...tenantFilter, dateKey: { $gte: from, $lte: to }, ...(employeeId ? { employeeId } : {}) }).lean<LeanAttendance[]>(),
            EmployeeLeave.find({ ...tenantFilter, startDate: { $lte: to }, endDate: { $gte: from }, ...(employeeId ? { employeeId } : {}) }).lean<LeanLeave[]>(),
            getWeeklyOffDays(req),
        ]);

        const days = listDateKeys(from, to);
        const recordByKey = new Map(records.map((record) => [`${record.employeeId}:${record.dateKey}`, record]));
        const employeesWithRecords = new Set(records.map((record) => String(record.employeeId)));

        const rows = employees
            // Former employees stay in reports only for periods they actually worked.
            .filter((employee) => employee.status === 'active' || employeesWithRecords.has(String(employee._id)))
            .map((employee) => {
                const id = String(employee._id);
                const startDate = effectiveStartDate(employee, timeZone);
                const summary = { present: 0, absent: 0, leave: 0, off: 0, missingCheckOut: 0, workedMinutes: 0 };
                const entries = days.map((day) => {
                    const record = recordByKey.get(`${id}:${day}`);
                    const leave = findLeaveFor(leaves, id, day);
                    const status = resolveDayStatus({ day, today, record, leave, weeklyOffDays, joiningDate: startDate });
                    const minutes = workedMinutes(record);
                    const missingCheckOut = Boolean(record?.checkIn && !record.checkOut && day < today);

                    if (status === 'present') summary.present += 1;
                    if (status === 'absent') summary.absent += 1;
                    if (status === 'leave') summary.leave += 1;
                    if (status === 'off') summary.off += 1;
                    if (missingCheckOut) summary.missingCheckOut += 1;
                    summary.workedMinutes += minutes;

                    return {
                        date: day,
                        status,
                        checkIn: record?.checkIn || null,
                        checkOut: record?.checkOut || null,
                        workedMinutes: minutes,
                        missingCheckOut,
                        leaveType: status === 'leave' ? leave?.leaveType : undefined,
                    };
                });

                return { employee: summarizeEmployee(employee), summary, days: entries };
            });

        return res.json({ from, to, today, weeklyOffDays, days, rows });
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to build attendance report') });
    }
};

export const getAttendanceSettings = async (req: AuthRequest, res: Response) => {
    try {
        return res.json({ weeklyOffDays: await getWeeklyOffDays(req) });
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch attendance settings') });
    }
};

export const updateAttendanceSettings = async (req: AuthRequest, res: Response) => {
    try {
        const settings = await getAppSettingsForTenant(req.user!);
        settings.attendanceWeeklyOffDays = [...req.body.weeklyOffDays].sort();
        await settings.save();
        return res.json({ weeklyOffDays: settings.attendanceWeeklyOffDays });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to save attendance settings') });
    }
};
