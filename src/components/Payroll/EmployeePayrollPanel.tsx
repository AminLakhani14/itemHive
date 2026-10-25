import React from "react";
import { ChevronDown } from 'lucide-react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
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
export default function EmployeePayrollPanel({
  employeeId,
  view = "profile",
}: {
  employeeId: string;
  view?: "profile" | "loans" | "history";
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
    context.current++; setBusy(false); setProfile(undefined); setSavedEnrollment(undefined); setLoans([]); setRuns([]); setSlip(undefined); setNotice(''); setEditingSalary(false); setProfileReason(''); void load();
    const changed = () => { context.current++; generation.current++; salaryInitialized.current = ''; setBusy(false); setProfile(undefined); setSavedEnrollment(undefined); setLoans([]); setRuns([]); setSlip(undefined); setNotice(''); setEditingSalary(false); setProfileReason(''); void load(); };
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
      setNotice(!refreshed ? 'Saved. Refresh to check the status.' : structure ? 'Salary updated.' : profile!.profile.payrollEnrolled ? 'Employee enrolled in payroll.' : 'Payroll details saved.');
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
  const blocked = !profile || !ready ? 'Employee data is not ready. Wait or retry loading.' :
    profile.profile.payrollEnrolled && !profile.profile.joiningDate ? 'Add the joining date in the employee profile first.' :
    salaryError ? salaryError :
    !editingSalary && profile.profile.employmentEndDate && profile.profile.employmentEndDate < profile.profile.joiningDate ? 'Last working day cannot be before the joining date.' :
    !editingSalary && (profile.profile.department || '').length > 80 ? 'Keep the department within 80 characters.' :
    !editingSalary && profile.profile.paymentMethod === 'bank' && (!profile.profile.bankName?.trim() || !profile.profile.bankAccount?.trim()) ? 'Enter the bank name and account number.' :
    !profileReason.trim() ? 'Enter a reason to save.' : profileReason.trim().length > 500 ? 'Keep the reason within 500 characters.' : '';
  return (
    <Stack gap={2.5} sx={{ minWidth: 0, '& .MuiTextField-root': { minWidth: 0, width: '100%' }, '& .MuiAccordion-root': { m: 0 }, '& .MuiAccordionDetails-root': { minWidth: 0 } }}>
      {error && <Alert severity="error" action={!ready ? <Button color="inherit" onClick={() => void load(true)}>Retry</Button> : undefined}>{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {profile && <>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
          <Box><Typography variant="h6">{profile.profile.fullName}</Typography><Typography variant="body2" color="text.secondary">Joined: {profile.profile.joiningDate || 'Not set'} | {currency}</Typography></Box>
          <Chip size="small" color={profileDirty ? 'warning' : savedEnrollment ? 'success' : 'default'} label={profileDirty ? 'Unsaved changes' : savedEnrollment ? 'Enrolled' : 'Not enrolled'} />
        </Stack>
        {!editingSalary && <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
          <Typography variant="body2">Current basic salary: {currentSalary ? `${money(currentSalary.baseMinor, currency)} / ${currentSalary.salaryType} (from ${currentSalary.effectiveDate})` : 'No salary is active yet.'}</Typography>
          {nextSalary && <Typography variant="caption" color="text.secondary">Next scheduled salary: {money(nextSalary.baseMinor, currency)} / {nextSalary.salaryType} from {nextSalary.effectiveDate}</Typography>}
        </Box>}
        {editingSalary ? <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={700}>Change salary</Typography><Button disabled={busy} onClick={() => setEditingSalary(false)}>Back to enrollment</Button></Stack> : <>
          <FormControlLabel label="Include in payroll" control={<Checkbox disabled={!canEdit || busy} checked={profile.profile.payrollEnrolled} onChange={(_, checked) => setProfile({ ...profile, profile: { ...profile.profile, payrollEnrolled: checked } })} />}/>
          {profile.profile.payrollEnrolled && !hasOpeningSalary && <Typography color="text.secondary" variant="body2">Enter the opening salary below. Salary and enrollment will be saved together.</Typography>}
          {!needsSalary && hasOpeningSalary && !savedEnrollment && canEdit && <Typography variant="body2">Opening salary is already saved. You can enroll this employee now.</Typography>}
        </>}
        {needsSalary && canEdit && <Stack gap={2}>
          <Typography fontWeight={700}>{editingSalary ? 'New salary' : 'Opening salary'}</Typography>
          <Stack sx={fieldGrid} gap={2}>
            <TextField
              size="small"
              type="date"
              label="Salary start date"
              value={salary.effectiveDate}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) =>
                setSalary({ ...salary, effectiveDate: e.target.value })
              }
            />
            <TextField
              size="small"
              type="number"
              label={`Basic salary (${currency})`}
              value={salary.base}
              onChange={(e) =>
                setSalary({ ...salary, base: Number(e.target.value) })
              }
            />
            <TextField
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

        </Stack>}
        {!editingSalary && <Stack gap={2}>
          <Typography fontWeight={700}>Payment details</Typography>
          <Box sx={{ ...fieldGrid, gap: 2 }}>
            <TextField size="small" label="Department" disabled={!canEdit || busy} value={profile.profile.department || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, department: e.target.value } })}/>
            <TextField size="small" select label="Payment method" disabled={!canEdit || busy} value={profile.profile.paymentMethod || 'cash'} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, paymentMethod: e.target.value as 'cash' | 'bank' } })}><MenuItem value="cash">Cash</MenuItem><MenuItem value="bank">Bank</MenuItem></TextField>
            {profile.profile.paymentMethod === 'bank' && <><TextField size="small" required label="Bank name" disabled={!canEdit || busy} value={profile.profile.bankName || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, bankName: e.target.value } })}/><TextField size="small" required label="Account number" disabled={!canEdit || busy} value={profile.profile.bankAccount || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, bankAccount: e.target.value } })}/></>}
          </Box>
        </Stack>}
        {needsSalary && canEdit && <>
          <Accordion disableGutters variant="outlined"><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={600}>Work hours & leave rules</Typography></AccordionSummary><AccordionDetails><Stack gap={2}>
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
          <TextField
              size="small"
            label="Leave policy"
            value={salary.leavePolicyName}
            onChange={(e) =>
              setSalary({ ...salary, leavePolicyName: e.target.value })
            }
          />
          <Typography variant="body2">
            Business leave rules apply. Change them below only for this employee.
          </Typography>
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
              <Box key={type}>
                <FormControlLabel
                  label={`Override ${type} policy`}
                  control={
                    <Checkbox
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
                {rule && (
                  <Stack sx={fieldGrid} gap={2}>
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

          </Stack></AccordionDetails></Accordion>
          <Accordion disableGutters variant="outlined"><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={600}>Allowances & deductions ({salary.components.length})</Typography></AccordionSummary><AccordionDetails><Stack gap={2}>
<TextField
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
              size="small"
                  label="Name"
                  value={c.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                <TextField
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

          </Stack></AccordionDetails></Accordion>
        </>}
        {!editingSalary && <Accordion disableGutters variant="outlined"><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={600}>Employment details & leave balance</Typography></AccordionSummary><AccordionDetails><Stack gap={2}><TextField size="small" type="date" label="Last working day (optional)" helperText="Leave blank for current employees." slotProps={{ inputLabel: { shrink: true } }} disabled={!canEdit || busy} value={profile.profile.employmentEndDate || ''} onChange={e => setProfile({ ...profile, profile: { ...profile.profile, employmentEndDate: e.target.value } })}/><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{Object.entries(profile.balances).map(([name, days]) => <Chip size="small" key={name} label={name + ': ' + days + ' days'}/>)}</Box></Stack></AccordionDetails></Accordion>}
        {canEdit && <Box sx={{ position: 'sticky', bottom: 0, zIndex: 2, bgcolor: 'background.paper', py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' }, gap: 2, alignItems: 'start' }}>
            <TextField size="small" required label="Reason for change" placeholder="e.g. Initial enrollment" disabled={busy} value={profileReason} onChange={e => setProfileReason(e.target.value)}/>
            <Button variant="contained" size="large" disabled={busy || !!blocked} onClick={() => void save(editingSalary)}>{busy ? 'Saving...' : editingSalary ? 'Save salary change' : profile.profile.payrollEnrolled && !savedEnrollment ? 'Save & enroll' : 'Save changes'}</Button>
          </Box>
          {blocked && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{blocked}</Typography>}
          {(profileDirty || editingSalary || profileReason) && <Button size="small" disabled={busy} onClick={() => { salaryInitialized.current = ''; setEditingSalary(false); setProfileReason(''); setNotice(''); void load(); }}>Reset changes</Button>}
        </Box>}
        <Accordion disableGutters variant="outlined"><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={600}>Salary history ({profile.structures.length})</Typography></AccordionSummary><AccordionDetails sx={{ overflowX: 'auto' }}>
          {profileDirty && <Typography variant="caption">Save or reset profile changes before changing salary.</Typography>}
          {canEdit && !editingSalary && <Button sx={{ mb: 2 }} disabled={busy || profileDirty || !ready} onClick={() => { setEditingSalary(true); setProfileReason(''); setSalary(s => ({ ...s, effectiveDate: dateToday() })); }}>Change salary</Button>}
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
                  onClick={() => { setEditingSalary(true);
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
        </AccordionDetails></Accordion>
      </>}
    </Stack>
  );
}
