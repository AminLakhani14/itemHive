import React from "react";
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
} from "@mui/material";
import { useSelector } from "react-redux";
import type { RootState } from "../../store";
import api from "../../api/axios";
import { hasScreenAccess } from "../../lib/screenPermissions";
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
  const [reason, setReason] = React.useState("");
  const [profileReason, setProfileReason] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [savedEnrollment, setSavedEnrollment] = React.useState<boolean>();
  const salaryInitialized = React.useRef('');
  const generation = React.useRef(0);
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
  const load = React.useCallback(async () => {
    if (!canView) return false;
    const current = ++generation.current;
    try {
      setError("");
      const p = (
        await api.get<PayrollProfile>(`/payroll/employees/${employeeId}`)
      ).data;
      if (current !== generation.current) return false;
      setProfile(p);
      setSavedEnrollment(p.profile.payrollEnrolled);
      if (salaryInitialized.current !== employeeId) {
        salaryInitialized.current = employeeId;
        const latest = p.structures[0];
        setSalary({ effectiveDate: latest ? dateToday() : p.profile.joiningDate || dateToday(), base: latest ? latest.baseMinor / 100 : p.profile.salary || 0, salaryType: latest?.salaryType || p.profile.salaryType || 'monthly', commissionPercent: latest?.commissionPercent || 0, schedule: latest?.schedule || defaultSchedule, components: latest?.components || [], leavePolicyName: latest?.leavePolicyName || 'Business default', leaveRules: latest?.leaveRules || {} });
      }
      const settings = (await api.get("/payroll/settings")).data;
      if (current !== generation.current) return false;
      setCurrency(settings.currency);
      if (view === "loans")
        setLoans(
          (
            await api.get<{ loans: PayrollLoan[] }>("/payroll/loans")
          ).data.loans.filter((l) => l.employeeId === employeeId),
        );
      if (view === "history")
        setRuns(
          (await api.get<PayrollRun[]>("/payroll/runs")).data.filter(
            (r) =>
              r.status === "approved" && r.employeeIds.includes(employeeId),
          ),
        );
      return true;
    } catch (e) {
      if (current === generation.current) setError(requestError(e));
      return false;
    }
  }, [employeeId, view, canView]);
  React.useEffect(() => {
    setProfile(undefined); setSavedEnrollment(undefined); setNotice(''); void load();
    const changed = () => { generation.current++; salaryInitialized.current = ''; setProfile(undefined); setSavedEnrollment(undefined); setLoans([]); setRuns([]); setNotice(''); void load(); };
    window.addEventListener('itemhive-workspace-changed', changed);
    return () => { generation.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
  }, [load]);
  const save = async (structure: boolean) => {
    setBusy(true);
    setError(''); setNotice('');
    try {
      if (structure)
        await api.post(`/payroll/employees/${employeeId}/structures`, {
          ...salary,
          reason,
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
        });
      if (structure) setReason(''); else setProfileReason('');
      const refreshed = await load();
      setNotice(!refreshed ? 'Saved, but the refreshed profile could not be loaded. Refresh before continuing.' : structure ? 'Salary version saved. Save payroll enrollment separately when ready.' : 'Payroll profile and enrollment saved.');
      window.dispatchEvent(
        new CustomEvent("itemhive-payroll-profile-updated", {
          detail: employeeId,
        }),
      );
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!canView)
    return (
      <Alert severity="info">
        Explicit payroll permission is required to view compensation records.
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
                try {
                  setSlip(
                    (
                      await api.get<PayrollRun>(
                        `/payroll/payslips/${r._id}/${employeeId}`,
                      )
                    ).data,
                  );
                } catch (e) {
                  setError(requestError(e));
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
  return (
    <Stack gap={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {profile && (
        <>
          <Typography variant="h6">Payroll enrollment</Typography>
          <Chip sx={{ alignSelf: 'flex-start' }} color={savedEnrollment ? 'success' : 'default'} label={savedEnrollment ? 'Saved status: Enrolled' : 'Saved status: Not enrolled'} />
          {savedEnrollment !== profile.profile.payrollEnrolled && <Alert severity="warning">Enrollment has an unsaved change. Enter a profile change reason and save below.</Alert>}
          <Alert severity="info">
            Salary history drives payroll. Create the opening salary effective
            on the joining date, then enroll this employee. Currency: {currency}
            . Leave policy: business rules.
          </Alert>
          <FormControlLabel
            label="Enroll in payroll"
            control={
              <Checkbox
                disabled={!canEdit}
                checked={profile.profile.payrollEnrolled}
                onChange={(_, v) =>
                  setProfile({
                    ...profile,
                    profile: { ...profile.profile, payrollEnrolled: v },
                  })
                }
              />
            }
          />
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            {(
              [
                "department",
                "employmentEndDate",
                "bankName",
                "bankAccount",
              ] as const
            ).map((k) => (
              <TextField
                key={k}
                disabled={!canEdit}
                label={
                  {
                    department: "Department",
                    employmentEndDate: "Employment end date",
                    bankName: "Bank name",
                    bankAccount: "Bank account",
                  }[k]
                }
                type={k === "employmentEndDate" ? "date" : "text"}
                slotProps={{ inputLabel: { shrink: true } }}
                value={profile.profile[k] || ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    profile: { ...profile.profile, [k]: e.target.value },
                  })
                }
              />
            ))}
            <TextField
              select
              label="Payment method"
              disabled={!canEdit}
              value={profile.profile.paymentMethod || "cash"}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  profile: {
                    ...profile.profile,
                    paymentMethod: e.target.value as "cash" | "bank",
                  },
                })
              }
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="bank">Bank</MenuItem>
            </TextField>
          </Stack>
          <Box>
            {Object.entries(profile.balances).map(([k, v]) => (
              <Chip sx={{ mr: 1, mb: 1 }} key={k} label={`${k}: ${v} days`} />
            ))}
          </Box>
          {canEdit && (
            <Stack gap={1}>
            <TextField label="Reason for payroll profile change" required value={profileReason} onChange={e => setProfileReason(e.target.value)} />
            <Button
              variant="contained"
              disabled={busy || !profileReason.trim()}
              onClick={() => save(false)}
            >
              Save payroll profile
            </Button>
            </Stack>
          )}
          <Typography variant="h6">Salary history</Typography>
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
                  onClick={() =>
                    setSalary({
                      effectiveDate: dateToday(),
                      base: s.baseMinor / 100,
                      salaryType: s.salaryType,
                      commissionPercent: s.commissionPercent,
                      schedule: s.schedule,
                      components: s.components,
                      leavePolicyName: s.leavePolicyName || "Business default",
                      leaveRules: s.leaveRules || {},
                    })
                  }
                >
                  Copy to new salary
                </Button>
              )
            }
          />
        </>
      )}
      {canEdit && (
        <>
          <Typography variant="h6">New effective-dated salary</Typography>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              type="date"
              label="Effective date"
              value={salary.effectiveDate}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) =>
                setSalary({ ...salary, effectiveDate: e.target.value })
              }
            />
            <TextField
              type="number"
              label={`Base rate (${currency})`}
              value={salary.base}
              onChange={(e) =>
                setSalary({ ...salary, base: Number(e.target.value) })
              }
            />
            <TextField
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
            <TextField
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
          </Stack>
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
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            {(
              ["startTime", "endTime", "breakMinutes", "graceMinutes"] as const
            ).map((k) => (
              <TextField
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
            label="Assigned leave policy"
            value={salary.leavePolicyName}
            onChange={(e) =>
              setSalary({ ...salary, leavePolicyName: e.target.value })
            }
          />
          <Typography variant="body2">
            Leave rules inherit business settings unless overridden below.
            Overrides are saved with this effective salary version.
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
                  <Stack direction={{ xs: "column", md: "row" }} gap={1}>
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
                          key={k}
                          type="number"
                          label={
                            k === "annualDays"
                              ? "Annual entitlement"
                              : k === "openingDays"
                                ? "Opening days at employment start"
                                : "Annual carry limit"
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
              <Stack key={i} direction={{ xs: "column", md: "row" }} gap={1}>
                <TextField
                  label="Name"
                  value={c.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                <TextField
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
                  label="Value"
                  type="number"
                  value={c.value}
                  onChange={(e) => update({ value: Number(e.target.value) })}
                />
                <FormControlLabel
                  label="Prorate"
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
            Add component
          </Button>
          <TextField
            label="Reason for salary change"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="contained"
            disabled={busy || !reason.trim()}
            onClick={() => save(true)}
          >
            Create salary version
          </Button>
        </>
      )}
    </Stack>
  );
}
