import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export const ATTENDANCE_METHODS = ['face', 'manual'] as const;
export type AttendanceMethod = typeof ATTENDANCE_METHODS[number];

/** One record per employee per working day: the first face scan starts the day, the second ends it. */
export interface IAttendance extends Document {
    employeeId: mongoose.Types.ObjectId;
    /** Business-local calendar day (YYYY-MM-DD) the shift started on. */
    dateKey: string;
    checkIn?: Date | null;
    checkOut?: Date | null;
    checkInMethod?: AttendanceMethod | null;
    checkOutMethod?: AttendanceMethod | null;
    /** Small snapshots taken at the scanner, kept for audit. */
    checkInPhoto: string;
    checkOutPhoto: string;
    timeZone: string;
    note: string;
    updatedBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceSchema: Schema<IAttendance> = new Schema(
    {
        employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
        dateKey: { type: String, required: true },
        checkIn: { type: Date, default: null },
        checkOut: { type: Date, default: null },
        checkInMethod: { type: String, enum: [...ATTENDANCE_METHODS, null], default: null },
        checkOutMethod: { type: String, enum: [...ATTENDANCE_METHODS, null], default: null },
        checkInPhoto: { type: String, default: '', select: false },
        checkOutPhoto: { type: String, default: '', select: false },
        timeZone: { type: String, default: 'UTC' },
        note: { type: String, default: '', trim: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    },
    { timestamps: true }
);

AttendanceSchema.index({ businessId: 1, employeeId: 1, dateKey: 1 }, { unique: true });
AttendanceSchema.index({ businessId: 1, dateKey: 1 });

AttendanceSchema.plugin(branchScopedPlugin);
export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
