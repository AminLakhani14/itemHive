import WorkflowHistory from './WorkflowHistory';
import React from "react";
import { Wallet, CalendarDays, Clock3, CircleDollarSign, CreditCard, History, Pencil, Check, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Box,
  Chip,
  Tabs,
  Tab,
  Avatar,
  alpha,
} from "@mui/material";
import { useSelector } from "react-redux";
import type { RootState } from "../../store";
import api from "../../api/axios";
import { hasScreenAccess } from "../../lib/screenPermissions";
import { salaryAt, salaryDraftError } from '../../lib/payrollProfile';
import type {
  PayrollComponent,
  PayrollProfile,
  PayrollSchedule,
  SalaryStructure,
  PayrollLoan,
  PayrollRun,
} from "../../types/payroll";
import {
  dateToday,
  money,
  Payslip,
  PayrollTable,
  requestError,
} from "./PayrollShared";

const defaultSchedule: PayrollSchedule = {
  workingDays: [1, 2, 3, 4, 5, 6],
  startTime: "09:00",
  endTime: "17:00",
  breakMinutes: 0,
  graceMinutes: 0,
};
const profileValues = (p: PayrollProfile['profile']) => ({
  payrollEnrolled: p.payrollEnrolled,
  department: p.department || '', employmentEndDate: p.employmentEndDate || '',
  paymentMethod: p.paymentMethod || 'cash', bankName: p.bankName || '', bankAccount: p.bankAccount || '',
});
export type EmployeePayrollSection = 'salary' | 'leaves' | 'schedule' | 'allowances' | 'payment' | 'history';
export default function EmployeePayrollPanel({
  employeeId,
  view = "profile",
  section,
  onSectionChange,
}: {
  employeeId: string;
  view?: "profile" | "loans" | "history";
  section?: EmployeePayrollSection;
  onSectionChange?: (section: EmployeePayrollSection) => void;
}) {
  const user = useSelector((s: RootState) => s.auth.user);
  const canEdit = hasScreenAccess(user, "payroll_settings");
  const canView = hasScreenAccess(user, 'payroll_view') || (view === 'profile' && canEdit);
  const [profile, setProfile] = React.useState<PayrollProfile>();
  const [loans, setLoans] = React.useState<PayrollLoan[]>([]);
  const [runs, setRuns] = React.useState<PayrollRun[]>([]);
  const [currency, setCurrency] = React.useState("PKR");
  const [slip, setSlip] = React.useState<PayrollRun>();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editingSalary, setEditingSalary] = React.useState(false);
  const [localSection, setLocalSection] = React.useState<EmployeePayrollSection>('salary');
  const activeTab = section ?? localSection;
  const setActiveTab = (next: EmployeePayrollSection) => {
    setLocalSection(next);
    onSectionChange?.(next);
  };
  const [profileReason, setProfileReason] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [savedEnrollment, setSavedEnrollment] = React.useState<boolean>();
  const [ready, setReady] = React.useState(false);
  const [allowZeroPay, setAllowZeroPay] = React.useState(false);
  const salaryInitialized = React.useRef('');
  const generation = React.useRef(0);
  const context = React.useRef(0);
  const savedProfile = React.useRef('');

  const hasOpeningSalary = !!profile?.profile.joiningDate && !!profile.structures.some(s => s.effectiveDate <= profile.profile.joiningDate);
  const [salary, setSalary] = React.useState({
    effectiveDate: dateToday(),
    base: 0,
    salaryType: "monthly" as SalaryStructure["salaryType"],
    commissionPercent: 0,
    schedule: defaultSchedule,
    components: [] as PayrollComponent[],
    leavePolicyName: "Business default",
    leaveRules: {} as NonNullable<SalaryStructure["leaveRules"]>,
  });
  const load = React.useCallback(async (keepDraft = false) => {
    if (!canView) return false;
    const current = ++generation.current;
    setReady(false);
    try {
      setError("");
      const [response, settings] = await Promise.all([
        api.get<PayrollProfile>(`/payroll/employees/${employeeId}`),
        api.get('/payroll/settings'),
      ]);
      const p = response.data;
      if (current !== generation.current) return false;
      savedProfile.current = JSON.stringify(profileValues(p.profile));
      setProfile(previous => keepDraft && previous ? {
        ...p,
        profile: {
          ...p.profile,
          payrollEnrolled: previous.profile.payrollEnrolled,
          department: previous.profile.department,
          employmentEndDate: previous.profile.employmentEndDate,
          paymentMethod: previous.profile.paymentMethod,
          bankName: previous.profile.bankName,
          bankAccount: previous.profile.bankAccount,
        },
      } : p);
      setSavedEnrollment(p.profile.payrollEnrolled);
      if (salaryInitialized.current !== employeeId) {
        salaryInitialized.current = employeeId;
        const latest = salaryAt(p.structures, dateToday());
        const needsOpening = !p.structures.some(s => s.effectiveDate <= p.profile.joiningDate);
        setSalary({ effectiveDate: needsOpening ? p.profile.joiningDate || dateToday() : dateToday(), base: latest ? latest.baseMinor / 100 : p.profile.salary || 0, salaryType: latest?.salaryType || p.profile.salaryType || 'monthly', commissionPercent: latest?.commissionPercent || 0, schedule: latest?.schedule || defaultSchedule, components: latest?.components || [], leavePolicyName: latest?.leavePolicyName || 'Business default', leaveRules: latest?.leaveRules || {} });
      }
      setCurrency(settings.data.currency);
      setAllowZeroPay(settings.data.allowZeroPay);
      if (view === "loans") {
        const result = await api.get<{ loans: PayrollLoan[] }>("/payroll/loans");
        if (current !== generation.current) return false;
        setLoans(result.data.loans.filter(l => l.employeeId === employeeId));
      }
      if (view === "history") {
        const result = await api.get<PayrollRun[]>("/payroll/runs");
        if (current !== generation.current) return false;
        setRuns(result.data.filter(r => r.status === "approved" && r.employeeIds.includes(employeeId)));
      }
      setReady(true);
      return true;
    } catch (e) {
      if (current === generation.current) setError(requestError(e));
      return false;
    }
  }, [employeeId, view, canView, canEdit]);
  React.useEffect(() => {
    context.current++; setLocalSection('salary'); setBusy(false); setProfile(undefined); setSavedEnrollment(undefined); setLoans([]); setRuns([]); setSlip(undefined); setNotice(''); setEditingSalary(false); setProfileReason(''); void load();
    const changed = () => { setLocalSection('salary'); context.current++; generation.current++; salaryInitialized.current = ''; setBusy(false); setProfile(undefined); setSavedEnrollment(undefined); setLoans([]); setRuns([]); setSlip(undefined); setNotice(''); setEditingSalary(false); setProfileReason(''); void load(); };
    window.addEventListener('itemhive-workspace-changed', changed);
    return () => { context.current++; generation.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
  }, [load]);
  const save = async (structure: boolean) => {
    if (busy || !ready || !profile || !canEdit) return;
    const epoch = context.current;
    setBusy(true);
    setError(''); setNotice('');
    try {
      if (structure)
        await api.post(`/payroll/employees/${employeeId}/structures`, {
          ...salary,
          reason: profileReason,
          payrollRevision: profile.profile.payrollRevision,
        });
      else
        await api.put(`/payroll/employees/${employeeId}`, {
          payrollEnrolled: profile!.profile.payrollEnrolled,
          payrollRevision: profile!.profile.payrollRevision,
          department: profile!.profile.department || '',
          employmentEndDate: profile!.profile.employmentEndDate || '',
          paymentMethod: profile!.profile.paymentMethod || 'cash',
          bankName: profile!.profile.bankName || '',
          bankAccount: profile!.profile.bankAccount || '',
          reason: profileReason,
          ...(!hasOpeningSalary && profile!.profile.payrollEnrolled ? { openingSalary: salary } : {}),
        });
      if (epoch !== context.current) return;
      setProfileReason('');
      salaryInitialized.current = '';
      if (structure) setEditingSalary(false);
      const refreshed = await load(structure);
      if (epoch !== context.current) return;
      setNotice(!refreshed ? 'Saved. Refresh to check the status.' : structure ? 'Employee payroll settings updated.' : profile!.profile.payrollEnrolled ? 'Employee enrolled in payroll.' : 'Payroll details saved.');
      window.dispatchEvent(
        new CustomEvent("itemhive-payroll-profile-updated", {
          detail: employeeId,
        }),
      );
    } catch (e) {
      if (epoch === context.current) setError(requestError(e));
    } finally {
      if (epoch === context.current) setBusy(false);
    }
  };
  if (!canView)
    return (
      <Alert severity="info">
        Ask your admin for access to salary details.
      </Alert>
    );
  if (view === "loans")
    return (
      <Stack gap={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography>
          Request, approve, and disburse loans from Payroll → Requests / Loans &
          Advances.
        </Typography>
        <PayrollTable
          rows={loans}
          columns={[
            { label: "Type", value: (l) => l.kind },
            {
              label: "Principal",
              value: (l) => money(l.principalMinor, currency),
            },
            {
              label: "Installment",
              value: (l) => money(l.installmentMinor, currency),
            },
            { label: "Balance", value: (l) => money(l.balanceMinor, currency) },
            { label: "Status", value: (l) => l.status },
          ]}
        />
      </Stack>
    );
  if (view === "history")
    return (
      <Stack gap={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <PayrollTable
          rows={runs}
          columns={[
            { label: "Month", value: (r) => r.month },
            { label: "Type", value: (r) => r.kind },
            {
              label: "Net salary",
              value: (r) =>
                money(
                  r.items.find((i) => i.employeeId === employeeId)?.netMinor ||
                    0,
                  r.policy?.currency || currency,
                ),
            },
          ]}
          actions={(r) => (
            <Button
              onClick={async () => {
                const epoch = context.current;
                try {
                  const result = await api.get<PayrollRun>(`/payroll/payslips/${r._id}/${employeeId}`);
                  if (epoch === context.current) setSlip(result.data);
                } catch (e) {
                  if (epoch === context.current) setError(requestError(e));
                }
              }}
            >
              Payslip
            </Button>
          )}
        />
        {slip && (
          <Payslip
            item={{ ...slip.items[0], month: slip.month, runId: slip._id }}
            currency={slip.policy?.currency || currency}
          />
        )}
      </Stack>
    );
  const fieldGrid = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } };
  const profileDirty = !!profile && savedProfile.current !== JSON.stringify(profileValues(profile.profile));
  const needsSalary = editingSalary || (!hasOpeningSalary && !!profile?.profile.payrollEnrolled);
  const currentSalary = profile && salaryAt(profile.structures, dateToday());
  const nextSalary = profile?.structures.filter(s => s.effectiveDate > dateToday()).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
  const salaryError = needsSalary && profile ? salaryDraftError(salary, allowZeroPay, profile.structures, editingSalary ? undefined : profile.profile.joiningDate) : '';
  const originalProfile = savedProfile.current ? JSON.parse(savedProfile.current) : undefined;
  const reasonRequired = editingSalary || (needsSalary && !!profile?.structures.length) || (!!savedEnrollment && !!profile && (!profile.profile.payrollEnrolled || ['employmentEndDate', 'paymentMethod', 'bankName', 'bankAccount'].some(key => (originalProfile?.[key] || '') !== (profile.profile[key as keyof typeof profile.profile] || ''))));
  const blocked = !profile || !ready ? 'Employee data is not ready. Wait or retry loading.' :
    profile.profile.payrollEnrolled && !profile.profile.joiningDate ? 'Add the joining date in the employee profile first.' :
    salaryError ? salaryError :
    !editingSalary && profile.profile.employmentEndDate && profile.profile.employmentEndDate < profile.profile.joiningDate ? 'Last working day cannot be before the joining date.' :
    !editingSalary && (profile.profile.department || '').length > 80 ? 'Keep the department within 80 characters.' :
    !editingSalary && profile.profile.paymentMethod === 'bank' && (!profile.profile.bankName?.trim() || !profile.profile.bankAccount?.trim()) ? 'Enter the bank name and account number.' :
    reasonRequired && !profileReason.trim() ? 'Enter a reason for the payroll changes.' : profileReason.trim().length > 500 ? 'Keep the reason within 500 characters.' : '';
  const structureTab = ['salary', 'leaves', 'schedule', 'allowances'].includes(activeTab);
  const editLabel = activeTab === 'leaves' ? 'Edit leave rules' : activeTab === 'schedule' ? 'Edit work hours' : activeTab === 'allowances' ? 'Edit allowances' : 'Change salary';
  const beginEdit = () => {
    setEditingSalary(true);
    setProfileReason('');
    setSalary(s => ({ ...s, effectiveDate: dateToday() }));
  };
  return (
    <Stack gap={2} sx={theme => ({
      minWidth: 0, color: 'text.primary', colorScheme: theme.palette.mode,
      '& .MuiTextField-root': { minWidth: 0, width: '100%' },
      '& .payroll-fields': { m: 0, p: 0, border: 0, minWidth: 0 },
      '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 1.5 },
      '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: theme.palette.text.secondary },
      '& .MuiFormControlLabel-label': { fontSize: '0.875rem' },
      '& .MuiButton-root': { flexShrink: 0 },
    })}>
      {error && <Alert severity="error" action={!ready ? <Button color="inherit" onClick={() => void load(true)}>Retry</Button> : undefined}>{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {profile && <>
        <Box sx={theme => ({ p: { xs: 1.5, sm: 2 }, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.04) })}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1.5} flexWrap="wrap">
            <Stack direction="row" gap={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 44, height: 44, fontSize: 16, fontWeight: 800 }}>{profile.profile.fullName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</Avatar>
              <Box sx={{ minWidth: 0 }}><Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{profile.profile.fullName}</Typography><Typography variant="caption" color="text.secondary">Joined {profile.profile.joiningDate || 'Not set'} | {currency}</Typography></Box>
            </Stack>
            <Chip size="small" variant="outlined" icon={savedEnrollment && !profileDirty ? <Check size={14} /> : undefined} color={profileDirty ? 'warning' : savedEnrollment ? 'success' : 'default'} label={profileDirty ? 'Unsaved changes' : savedEnrollment ? 'Enrolled' : 'Not enrolled'} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Current basic salary</Typography>
            <Typography fontWeight={800}>{currentSalary ? money(currentSalary.baseMinor, currency) : 'No active salary'}{currentSalary && <Typography component="span" variant="body2" color="text.secondary"> / {currentSalary.salaryType}</Typography>}</Typography>
          </Stack>
          {nextSalary && <Typography variant="caption" color="text.secondary">Next salary: {money(nextSalary.baseMinor, currency)} / {nextSalary.salaryType} from {nextSalary.effectiveDate}</Typography>}
        </Box>
        <Tabs value={activeTab} onChange={(_, tab: EmployeePayrollSection) => setActiveTab(tab)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Employee payroll sections" sx={theme => ({ minHeight: 44, p: 0.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 40, minWidth: 'auto', px: 1.5, py: 1, mr: 0.5, borderRadius: 1.5, color: 'text.secondary', textTransform: 'none', fontSize: 13, '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1), color: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } } })}>
          <Tab value="salary" label="Salary" icon={<Wallet size={16} />} iconPosition="start" />
          <Tab value="leaves" label="Leaves" icon={<CalendarDays size={16} />} iconPosition="start" />
          <Tab value="schedule" label="Work hours" icon={<Clock3 size={16} />} iconPosition="start" />
          <Tab value="allowances" label="Allowances" icon={<CircleDollarSign size={16} />} iconPosition="start" />
          <Tab value="payment" label="Payment details" icon={<CreditCard size={16} />} iconPosition="start" />
          <Tab value="history" label="History" icon={<History size={16} />} iconPosition="start" />
        </Tabs>
        {structureTab && canEdit && !needsSalary && <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="body2" color="text.secondary">{profileDirty ? 'Save or reset payment details before editing payroll rules.' : 'Changes apply from the effective date you choose.'}</Typography>
          <Button variant="outlined" size="small" startIcon={<Pencil size={15} />} disabled={busy || profileDirty || !ready} onClick={beginEdit}>{editLabel}</Button>
        </Stack>}
        {activeTab === 'salary' && !editingSalary && <>
          <FormControlLabel label="Include in payroll" control={<Checkbox disabled={!canEdit || busy} checked={profile.profile.payrollEnrolled} onChange={(_, checked) => setProfile({ ...profile, profile: { ...profile.profile, payrollEnrolled: checked } })} />}/>
          {profile.profile.payrollEnrolled && !hasOpeningSalary && <Typography color="text.secondary" variant="body2">Enter the opening salary. Check Leaves, Work hours and Allowances before saving.</Typography>}
          {!needsSalary && hasOpeningSalary && !savedEnrollment && canEdit && <Typography variant="body2">Opening salary is already saved. You can enroll this employee now.</Typography>}
        </>}
        {structureTab && needsSalary && canEdit && <TextField size="small" type="date" label="Effective from" value={salary.effectiveDate} disabled={busy} slotProps={{ inputLabel: { shrink: true } }} onChange={e => setSalary({ ...salary, effectiveDate: e.target.value })} helperText="Salary, leave rules, work hours and allowances are saved together for this date." />}
        {activeTab === 'salary' && <Box component="fieldset" className="payroll-fields" disabled={!canEdit || !needsSalary || busy}><Stack gap={2}>
          <Typography fontWeight={700}>{needsSalary ? editingSalary ? 'New salary' : 'Opening salary' : 'Salary details'}</Typography>
          <Stack sx={fieldGrid} gap={2}>
            <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
              type="number"
              label={`Basic salary (${currency})`}
              value={salary.base}
              onChange={(e) =>
                setSalary({ ...salary, base: Number(e.target.value) })
              }
            />
            <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
              select
              label="Salary type"
              value={salary.salaryType}
              onChange={(e) =>
                setSalary({
                  ...salary,
                  salaryType: e.target.value as SalaryStructure["salaryType"],
                })
              }
            >
              {["monthly", "daily", "hourly"].map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>

          </Stack>

        </Stack></Box>}
        {activeTab === 'payment' && <Box component="fieldset" className="payroll-fields" disabled={editingSalary || busy}><Stack gap={2}>
          <Typography fontWeight={700}>Payment details</Typography>
          <Box sx={{ ...fieldGrid, gap: 2 }}>
            <TextField size="small" label="Department" disabled={!canEdit || editingSalary || busy} value={profile.profile.department || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, department: e.target.value } })}/>
            <TextField size="small" select label="Payment method" disabled={!canEdit || editingSalary || busy} value={profile.profile.paymentMethod || 'cash'} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, paymentMethod: e.target.value as 'cash' | 'bank' } })}><MenuItem value="cash">Cash</MenuItem><MenuItem value="bank">Bank</MenuItem></TextField>
            {profile.profile.paymentMethod === 'bank' && <><TextField size="small" required label="Bank name" disabled={!canEdit || editingSalary || busy} value={profile.profile.bankName || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, bankName: e.target.value } })}/><TextField size="small" required label="Account number" disabled={!canEdit || editingSalary || busy} value={profile.profile.bankAccount || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, bankAccount: e.target.value } })}/></>}
          </Box>
        <TextField size="small" type="date" label="Last working day (optional)" helperText="Leave blank for current employees." slotProps={{ inputLabel: { shrink: true } }} disabled={!canEdit || editingSalary || busy} value={profile.profile.employmentEndDate || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, employmentEndDate: e.target.value } })}/>
        </Stack></Box>}
        {activeTab === 'payment' && editingSalary && <Alert severity="info">Save or reset the payroll rule changes before editing payment details.</Alert>}
        {activeTab === 'schedule' && <Box component="fieldset" className="payroll-fields" disabled={!canEdit || !needsSalary || busy}><Stack gap={2}>
          <Typography fontWeight={700}>Work schedule</Typography>
          <Box>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <FormControlLabel
                key={d}
                label={d}
                control={
                  <Checkbox
                    checked={salary.schedule.workingDays.includes(i)}
                    onChange={(_, v) =>
                      setSalary({
                        ...salary,
                        schedule: {
                          ...salary.schedule,
                          workingDays: v
                            ? [...salary.schedule.workingDays, i].sort()
                            : salary.schedule.workingDays.filter(
                                (x) => x !== i,
                              ),
                        },
                      })
                    }
                  />
                }
              />
            ))}
          </Box>
          <Stack sx={fieldGrid} gap={2}>
            {(
              ["startTime", "endTime", "breakMinutes", "graceMinutes"] as const
            ).map((k) => (
              <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                key={k}
                label={
                  {
                    startTime: "Shift start",
                    endTime: "Shift end",
                    breakMinutes: "Unpaid break minutes",
                    graceMinutes: "Grace minutes",
                  }[k]
                }
                type={k.endsWith("Time") ? "time" : "number"}
                value={salary.schedule[k]}
                onChange={(e) =>
                  setSalary({
                    ...salary,
                    schedule: {
                      ...salary.schedule,
                      [k]: k.endsWith("Time")
                        ? e.target.value
                        : Number(e.target.value),
                    },
                  })
                }
              />
            ))}
          </Stack>
          </Stack></Box>}
        {activeTab === 'leaves' && <Stack gap={1.5}>
          <Typography fontWeight={700}>Current leave balances</Typography>
          <Typography variant="body2" color="text.secondary">Full yearly allowance plus opening and carried leave, minus leave taken.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}>
            {Object.entries(profile.balances).map(([name, days]) => <Box key={name} sx={theme => ({ px: 1.5, py: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.035) })}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{name}</Typography>
              <Typography variant="h6" sx={{ lineHeight: 1.5 }}>{days}<Typography component="span" variant="caption" color="text.secondary"> days</Typography></Typography>
            </Box>)}
          </Box>
          {!Object.keys(profile.balances).length && <Typography variant="body2" color="text.secondary">No leave balances available yet.</Typography>}
          <Box component="fieldset" className="payroll-fields" disabled={!canEdit || !needsSalary || busy}><Stack gap={2}>
          <Typography variant="body2" color="text.secondary">Use business defaults or set a custom allowance below.</Typography>
          <Box sx={{ ...fieldGrid, gap: 1.5, alignItems: 'start' }}>
          {["casual", "sick", "annual", "unpaid", "other"].map((type) => {
            const rule = salary.leaveRules[type];
            const update = (
              patch: Partial<
                NonNullable<SalaryStructure["leaveRules"]>[string]
              >,
            ) =>
              setSalary({
                ...salary,
                leaveRules: {
                  ...salary.leaveRules,
                  [type]: { ...rule!, ...patch },
                },
              });
            return (
              <Box key={type} sx={theme => ({ p: 1.5, border: 1, borderColor: rule ? 'primary.main' : 'divider', borderRadius: 1.5, bgcolor: rule ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.035) : 'background.paper' })}>
                <FormControlLabel
                  sx={{ m: 0, alignItems: 'center', '& .MuiCheckbox-root': { p: 0.5, mr: 0.75 }, '& .MuiFormControlLabel-label': { fontWeight: 700 } }}
                  label={type.charAt(0).toUpperCase() + type.slice(1) + ' leave'}
                  control={
                    <Checkbox
                      slotProps={{ input: { 'aria-label': 'Set custom ' + type + ' allowance' } }}
                      checked={!!rule}
                      onChange={(_, checked) => {
                        const rules = { ...salary.leaveRules };
                        if (checked)
                          rules[type] = {
                            paid: ["casual", "sick", "annual"].includes(type),
                            annualDays: 0,
                            openingDays: 0,
                            carryLimit: 0,
                          };
                        else delete rules[type];
                        setSalary({ ...salary, leaveRules: rules });
                      }}
                    />
                  }
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4.25, mb: rule ? 1.5 : 0 }}>{rule ? 'Custom allowance' : 'Using business defaults'}</Typography>
                {rule && (
                  <Stack sx={fieldGrid} gap={1.5}>
                    <FormControlLabel
                      label="Paid leave"
                      control={
                        <Checkbox
                          checked={rule.paid}
                          onChange={(_, paid) => update({ paid })}
                        />
                      }
                    />
                    {(["annualDays", "openingDays", "carryLimit"] as const).map(
                      (k) => (
                        <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                          key={k}
                          type="number"
                          label={
                            k === "annualDays"
                              ? "Days per year"
                              : k === "openingDays"
                                ? "Starting leave balance"
                                : "Days carried to next year"
                          }
                          value={rule[k]}
                          onChange={(e) =>
                            update({ [k]: Number(e.target.value) })
                          }
                        />
                      ),
                    )}
                  </Stack>
                )}
              </Box>
            );
          })}
          </Box>
          </Stack></Box>
        </Stack>}
        {activeTab === 'allowances' && <Box component="fieldset" className="payroll-fields" disabled={!canEdit || !needsSalary || busy}><Stack gap={2}>
          <Typography fontWeight={700}>Allowances & deductions ({salary.components.length})</Typography>
<TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
              type="number"
              label="Sales commission %"
              value={salary.commissionPercent}
              onChange={(e) =>
                setSalary({
                  ...salary,
                  commissionPercent: Number(e.target.value),
                })
              }
            />
          <Typography fontWeight={700}>
            Allowances, deductions and employer contributions
          </Typography>
          {salary.components.map((c, i) => {
            const update = (patch: Partial<PayrollComponent>) =>
              setSalary({
                ...salary,
                components: salary.components.map((x, n) =>
                  n === i ? { ...x, ...patch } : x,
                ),
              });
            return (
              <Stack key={i} sx={fieldGrid} gap={2}>
                <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                  label="Name"
                  value={c.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                  select
                  label="Kind"
                  value={c.kind}
                  onChange={(e) =>
                    update({ kind: e.target.value as PayrollComponent["kind"] })
                  }
                >
                  {["allowance", "deduction", "employer"].map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                  select
                  label="Mode"
                  value={c.mode}
                  onChange={(e) =>
                    update({ mode: e.target.value as PayrollComponent["mode"] })
                  }
                >
                  <MenuItem value="fixed">Fixed amount</MenuItem>
                  <MenuItem value="percent">% of earned base</MenuItem>
                </TextField>
                <TextField
              disabled={!canEdit || !needsSalary || busy}
              size="small"
                  label="Value"
                  type="number"
                  value={c.value}
                  onChange={(e) => update({ value: Number(e.target.value) })}
                />
                <FormControlLabel
                  label="Adjust for days paid"
                  control={
                    <Checkbox
                      checked={c.prorate}
                      onChange={(_, v) => update({ prorate: v })}
                    />
                  }
                />
                <Button
                  onClick={() =>
                    setSalary({
                      ...salary,
                      components: salary.components.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove
                </Button>
              </Stack>
            );
          })}
          <Button
            onClick={() =>
              setSalary({
                ...salary,
                components: [
                  ...salary.components,
                  {
                    name: "",
                    kind: "allowance",
                    mode: "fixed",
                    value: 0,
                    prorate: true,
                  },
                ],
              })
            }
          >
            Add allowance or deduction
          </Button>

          </Stack></Box>}
        {canEdit && activeTab !== 'history' && (needsSalary || activeTab === 'salary' || activeTab === 'payment') && <Box sx={{ position: 'sticky', bottom: 0, zIndex: 2, bgcolor: 'background.paper', py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: reasonRequired ? 'minmax(0, 1fr) auto' : '1fr' }, gap: 2, alignItems: 'start' }}>
            {reasonRequired && <TextField size="small" required label="Reason for change" disabled={busy} value={profileReason} onChange={e => setProfileReason(e.target.value)}/>}
            <Button variant="contained" startIcon={<Save size={16} />} disabled={busy || !!blocked} onClick={() => void save(editingSalary)}>{busy ? 'Saving...' : editingSalary ? 'Save payroll changes' : profile.profile.payrollEnrolled && !savedEnrollment ? 'Save & enroll' : 'Save changes'}</Button>
          </Box>
          {blocked && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{blocked}</Typography>}
          {(profileDirty || editingSalary || profileReason) && <Button size="small" disabled={busy} onClick={() => { salaryInitialized.current = ''; setEditingSalary(false); setProfileReason(''); setNotice(''); void load(); }}>Reset changes</Button>}
        </Box>}
        {activeTab === 'history' && <Stack gap={3}>
          <Typography fontWeight={700}>Activity history ({profile.audit?.length || 0})</Typography>
          <WorkflowHistory rows={profile.audit || []} />
          <Typography fontWeight={700}>Salary history ({profile.structures.length})</Typography>
          <Box sx={{ overflowX: 'auto' }}>
          <PayrollTable
            rows={profile.structures}
            columns={[
              { label: "Effective", value: (s) => s.effectiveDate },
              {
                label: "Base",
                value: (s) =>
                  `${money(s.baseMinor, currency)} / ${s.salaryType}`,
              },
              { label: "Commission", value: (s) => `${s.commissionPercent}%` },
              {
                label: "Components",
                value: (s) =>
                  s.components
                    .map(
                      (c) =>
                        `${c.name}: ${c.value}${c.mode === "percent" ? "%" : ""}`,
                    )
                    .join(", "),
              },
              { label: "Reason", value: (s) => s.reason },
            ]}
            actions={(s) =>
              canEdit && (
                <Button
                  disabled={busy || profileDirty || !ready}
                  onClick={() => { setActiveTab('salary'); setEditingSalary(true);
                    setProfileReason('');
                    setSalary({
                      effectiveDate: dateToday(),
                      base: s.baseMinor / 100,
                      salaryType: s.salaryType,
                      commissionPercent: s.commissionPercent,
                      schedule: s.schedule,
                      components: s.components,
                      leavePolicyName: s.leavePolicyName || "Business default",
                      leaveRules: s.leaveRules || {},
                    }); }
                  }
                >
                  Copy salary
                </Button>
              )
            }
          />
          </Box>
        </Stack>}
      </>}
    </Stack>
  );
}
