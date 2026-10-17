import React from "react";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { compactPayrollSx, PayrollStats, requestDetails, StatusChip } from "../../components/Payroll/PayrollLayout";
import {
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useSelector } from "react-redux";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import type { RootState } from "../../store";
import api from "../../api/axios";
import {
  hasScreenAccess,
  type ScreenPermission,
} from "../../lib/screenPermissions";
import {
  dateToday,
  emptyPolicy,
  exportRows,
  money,
  Payslip,
  PayrollTable,
  requestError,
  RequestForm,
} from "../../components/Payroll/PayrollShared";
import EmployeePayrollPanel from "../../components/Payroll/EmployeePayrollPanel";
import type {
  PayrollEmployee,
  PayrollItem,
  PayrollLoan,
  PayrollMovement,
  PayrollPayment,
  PayrollPolicy,
  PayrollReport,
  PayrollRequest,
  PayrollRun,
} from "../../types/payroll";

type TabKey =
  | "overview"
  | "runs"
  | "requests"
  | "loans"
  | "payments"
  | "reports"
  | "settings";
const labels: Record<TabKey, string> = {
  overview: "Overview",
  runs: "Runs",
  requests: "Requests",
  loans: "Loans & Advances",
  payments: "Payments",
  reports: "Reports",
  settings: "Settings",
};
export default function PayrollPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const can = (key: ScreenPermission) => hasScreenAccess(user, key);
  const [params, setParams] = useSearchParams();
  const tabs: TabKey[] = [
    "overview",
    "runs",
    ...(can("payroll_hr") ? ["requests" as const] : []),
    "loans",
    ...(can("payroll_pay") ? ["payments" as const] : []),
    ...(can("payroll_reports") ? ["reports" as const] : []),
    ...(can("payroll_settings") ? ["settings" as const] : []),
  ];
  const tab = tabs.includes(params.get("tab") as TabKey)
    ? (params.get("tab") as TabKey)
    : "overview";
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [employees, setEmployees] = React.useState<PayrollEmployee[]>([]);
  const [runs, setRuns] = React.useState<PayrollRun[]>([]);
  const [enabled, setEnabled] = React.useState(false);
  const [policy, setPolicy] = React.useState<PayrollPolicy>(emptyPolicy);
  const [requests, setRequests] = React.useState<PayrollRequest[]>([]);
  const [loans, setLoans] = React.useState<PayrollLoan[]>([]);
  const [movements, setMovements] = React.useState<PayrollMovement[]>([]);
  const [payments, setPayments] = React.useState<PayrollPayment[]>([]);
  const [selectedRun, setRun] = React.useState<PayrollRun>();
  const [slip, setSlip] = React.useState<PayrollItem>();
  const [profileId, setProfileId] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({
    month: dateToday().slice(0, 7),
    kind: "regular",
    parentRunId: "",
    employeeIds: [] as string[],
    reason: "",
  });
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState("");
  const [report, setReport] = React.useState<PayrollReport>();
  const [reportType, setReportType] = React.useState("register");
  const [filters, setFilters] = React.useState({
    from: `${dateToday().slice(0, 4)}-01`,
    to: dateToday().slice(0, 7),
    employeeId: "",
    department: "",
    designation: "",
    status: "",
  });
  const [action, setAction] = React.useState<{
    title: string;
    path: string;
    kind: "reason" | "payment" | "loan";
    run?: PayrollRun;
    item?: PayrollItem;
    loan?: PayrollLoan;
    movementKind?: string;
  }>();
  const [actionData, setActionData] = React.useState({
    reason: "",
    amount: 0,
    reference: "",
    dateKey: dateToday(),
    method: "cash",
    key: "",
  });
  const [adjustment, setAdjustment] = React.useState({
    employeeId: "",
    kind: "bonus",
    amount: 0,
    reason: "",
    loanId: "",
  });
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    const base = await Promise.all([
      api.get<PayrollEmployee[]>("/payroll/employees"),
      api.get<PayrollRun[]>("/payroll/runs"),
      api.get<PayrollPolicy>("/payroll/settings"),
    ]);
    if (current !== generation.current) return;
    setEmployees(base[0].data);
    setRuns(base[1].data);
    setPolicy(base[2].data);
    setEnabled(base[2].data.enabled);
    if (tab === "requests") {
      const r = (await api.get<PayrollRequest[]>("/payroll/requests")).data;
      if (current === generation.current) setRequests(r);
    }
    if (tab === "loans") {
      const l = (
        await api.get<{ loans: PayrollLoan[]; movements: PayrollMovement[] }>(
          "/payroll/loans",
        )
      ).data;
      if (current === generation.current) {
        setLoans(l.loans);
        setMovements(l.movements);
      }
    }
    if (tab === "payments") {
      const p = (await api.get<PayrollPayment[]>("/payroll/payments")).data;
      if (current === generation.current) setPayments(p);
    }
  }, [tab]);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    load().catch((e) => {
      if (active) setError(requestError(e));
    }).finally(() => { if (active) setLoading(false); });
    const changed = () => {
      setRun(undefined);
      setProfileId("");
      setSlip(undefined);
      setReport(undefined);
      setEnabled(false);
      setPolicy(emptyPolicy);
      setLoading(true);
      setRequestOpen(false);
      setEmployees([]);
      setRuns([]);
      setRequests([]);
      setLoans([]);
      setMovements([]);
      setPayments([]);
      setAction(undefined);
      setCreateOpen(false);
      void load().catch((e) => setError(requestError(e))).finally(() => setLoading(false));
    };
    window.addEventListener("itemhive-workspace-changed", changed);
    return () => {
      active = false;
      generation.current++;
      window.removeEventListener("itemhive-workspace-changed", changed);
    };
  }, [load]);
  const operate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await fn();
      await load();
      setNotice(typeof message === "string" ? message : "Saved successfully.");
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  };
  const showRun = async (id: string) => {
    try {
      setRun((await api.get<PayrollRun>(`/payroll/runs/${id}`)).data);
    } catch (e) {
      setError(requestError(e));
    }
  };
  const employeeName = (id: string) =>
    employees.find((e) => e._id === id)?.fullName || id;
  const openAction = (a: NonNullable<typeof action>) => {
    setAction(a);
    setActionData({
      reason: "",
      amount: a.item ? (a.item.outstandingMinor ?? a.item.netMinor) / 100 : 0,
      reference: "",
      dateKey: dateToday(),
      method: "cash",
      key: crypto.randomUUID(),
    });
  };
  const commitAction = () =>
    operate(async () => {
      if (!action) return;
      if (action.kind === "payment")
        await api.post("/payroll/payments", {
          reason: actionData.reason,
          payments: [
            {
              runId: action.run!._id,
              employeeId: action.item!.employeeId,
              amount: actionData.amount,
              dateKey: actionData.dateKey,
              method: actionData.method,
              reference: actionData.reference,
              key: actionData.key,
            },
          ],
        });
      else if (action.kind === "loan")
        await api.post(action.path, {
          kind: action.movementKind,
          amount: actionData.amount || undefined,
          reason: actionData.reason,
          reference: actionData.reference,
          key: actionData.key,
        });
      else
        await api.post(action.path, {
          reason: actionData.reason,
          version: action.run?.version,
        });
      if (action.run) await showRun(action.run._id);
      setAction(undefined);
    });
  const loadReport = () =>
    operate(async () =>
      setReport(
        (await api.get<PayrollReport>("/payroll/reports", { params: filters }))
          .data,
      ),
    );
  const reportRows = (): Record<string, string | number>[] => {
    if (!report) return [];
    const rows = report.rows;
    if (reportType === "paymentHistory")
      return report.payments.map((p) => ({
        Employee: employeeName(p.employeeId),
        Run: p.runId,
        Date: p.dateKey,
        Amount: p.amountMinor / 100,
        Method: p.method,
        Reference: p.reference,
        Status: p.reversedAt ? "reversed" : "recorded",
        "Reversal reason": p.reversalReason || "",
      }));
    if (reportType === "loanMovements")
      return report.movements.map((m) => ({
        Employee: employeeName(m.employeeId),
        Loan: m.loanId,
        Date: m.createdAt,
        Type: m.kind,
        Amount: m.amountMinor / 100,
        Reason: m.reason,
      }));
    if (reportType === "commission")
      return report.commissions.map((c) => ({
        Employee: employeeName(c.employeeId),
        Sale: c.saleId,
        Date: c.dateKey,
        "Eligible amount": c.eligibleMinor / 100,
        "Rate %": c.percent,
        Commission: c.amountMinor / 100,
        Status: c.reversed ? "reversed" : c.runId ? "posted" : "unposted",
      }));
    if (reportType === "loans")
      return report.loans.map((l) => ({
        Employee: employeeName(l.employeeId),
        Loan: l._id,
        Type: l.kind,
        Principal: l.principalMinor / 100,
        Installment: l.installmentMinor / 100,
        Outstanding: l.balanceMinor / 100,
        Status: l.status,
      }));
    if (reportType === "audit")
      return report.audit.map((a) => ({
        Date: a.createdAt,
        Actor: a.actorId,
        Action: a.action,
        Target: a.targetId,
        Reason: a.reason,
      }));
    if (reportType === "leave")
      return (report.balances || []).flatMap((e) =>
        Object.entries(e.balances).map(([type, balance]) => ({
          Employee: e.employeeName,
          Type: type,
          "Days available": balance,
        })),
      );
    if (reportType === "attendance")
      return rows.flatMap((i) =>
        i.days.map((d) => ({
          Employee: i.employeeName,
          Month: i.month || "",
          Date: d.date,
          Status: d.status,
          "Worked minutes": d.workedMinutes,
          "Regular minutes": d.regularMinutes,
          "Overtime minutes": d.overtimeMinutes,
          "Payable units": d.payableUnits,
        })),
      );
    if (reportType === "variance") {
      const groups = new Map<
        string,
        { month: string; department: string; cost: number }
      >();
      for (const r of rows) {
        const key = `${r.month}:${r.department}`;
        const g = groups.get(key) || {
          month: r.month || "",
          department: r.department,
          cost: 0,
        };
        g.cost += r.employerCostMinor;
        groups.set(key, g);
      }
      const sorted = [...groups.values()].sort((a, b) =>
        a.month.localeCompare(b.month),
      );
      return sorted.map((g) => {
        const previous = sorted
          .filter((p) => p.department === g.department && p.month < g.month)
          .at(-1);
        return {
          Month: g.month,
          Department: g.department,
          "Employer cost": g.cost / 100,
          "Previous available period cost": (previous?.cost || 0) / 100,
          Change: previous ? (g.cost - previous.cost) / 100 : 0,
        };
      });
    }
    return rows.map((i) => ({
      Employee: i.employeeName,
      Code: i.employeeCode,
      Month: i.month || "",
      Department: i.department,
      Designation: i.designation,
      Currency: i.currency || policy.currency,
      Base:
        i.lines
          .filter((l) => l.kind === "base")
          .reduce((n, l) => n + l.amountMinor, 0) / 100,
      Allowances:
        i.lines
          .filter((l) => l.kind === "allowance")
          .reduce((n, l) => n + l.amountMinor, 0) / 100,
      Overtime:
        i.lines
          .filter((l) => l.kind === "overtime")
          .reduce((n, l) => n + l.amountMinor, 0) / 100,
      Commission:
        i.lines
          .filter((l) => l.kind === "commission")
          .reduce((n, l) => n + l.amountMinor, 0) / 100,
      Gross: i.grossMinor / 100,
      Deductions: i.deductionsMinor / 100,
      Net: i.netMinor / 100,
      "Employer cost": i.employerCostMinor / 100,
      Paid: (i.paidMinor || 0) / 100,
      Outstanding: (i.outstandingMinor ?? i.netMinor) / 100,
      Status: i.paymentStatus || "",
    }));
  };
  const availableReportRows = reportRows();
  const approved = runs.filter((r) => r.status === "approved");
  const matches = (values: unknown[], status?: string) => (!statusFilter || status === statusFilter) && values.join(" ").toLowerCase().includes(search.toLowerCase());
  const statusOptions = tab === "overview" ? ["enrolled", "not_enrolled"] : tab === "runs" ? ["draft", "calculated", "submitted", "approved"] : tab === "requests" ? ["pending", "approved", "rejected", "cancelled"] : tab === "loans" ? ["approved", "disbursed", "settled", "cancelled"] : ["recorded", "reversed"];
  return (
    <Stack gap={2} sx={compactPayrollSx}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
        <Stack direction="row" alignItems="center" gap={1.5}><Typography variant="h4" fontWeight={800}>Payroll</Typography><StatusChip status={enabled ? "enabled" : "disabled"} /></Stack>
        <Stack direction="row" gap={1}>
          <IconButton aria-label="Refresh payroll" disabled={busy || loading} onClick={() => { setLoading(true); void load().catch(e => setError(requestError(e))).finally(() => setLoading(false)); }}><RefreshCw size={18} /></IconButton>
          <Button component={RouterLink} to="/my-payroll">My Payroll</Button>
          {can("payroll_prepare") && <Button variant="contained" startIcon={<Plus size={16} />} disabled={busy || loading || !enabled} onClick={() => setCreateOpen(true)}>New run</Button>}
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {!loading && !enabled && (
        <Alert severity="info" action={can("payroll_settings") ? (
          <Button color="inherit" size="small" onClick={() => setParams({ tab: "settings" })}>
            Open Payroll Settings
          </Button>
        ) : undefined}>
          Enable payroll in Settings, then enroll employees.
          {!can("payroll_settings") && " Ask your payroll admin."}
        </Alert>
      )}
      <Card variant="outlined">
        <Tabs
          value={tab}
          variant="scrollable"
          scrollButtons="auto"
          onChange={(_, v: TabKey) => { setParams({ tab: v }); setSearch(""); setStatusFilter(""); }}
        >
          {tabs.map((t) => (
            <Tab key={t} value={t} label={labels[t]} />
          ))}
        </Tabs>
        <CardContent>
          {["overview", "runs", "requests", "loans", "payments"].includes(tab) && <Stack direction={{ xs: "column", sm: "row" }} gap={1} sx={{ mb: 2 }}>
            <TextField size="small" label={tab === "overview" ? "Search employees" : "Search"} value={search} onChange={e => setSearch(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" select label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><MenuItem value="">All statuses</MenuItem>{statusOptions.map(s => <MenuItem key={s} value={s}>{s.replaceAll("_", " ")}</MenuItem>)}</TextField>
          </Stack>}
          {tab === "overview" && (
            <Stack gap={3}>
              <PayrollStats items={[
                { label: "Enrolled", value: employees.filter(e => e.payrollEnrolled).length + " / " + employees.length },
                { label: "Draft runs", value: runs.filter(r => ["draft", "calculated"].includes(r.status)).length },
                { label: "Awaiting approval", value: runs.filter(r => r.status === "submitted").length },
                { label: "Approved cost", value: money(approved.reduce((n, r) => n + (r.totals?.employerCostMinor || 0), 0), policy.currency) },
              ]} />
              <Typography variant="h6">Employee payroll readiness</Typography>
              <PayrollTable
                rows={employees.filter(e => matches([e.employeeCode, e.fullName, e.department, e.designation], e.payrollEnrolled ? "enrolled" : "not_enrolled"))}
                columns={[
                  {
                    label: "Employee",
                    value: (e) => `${e.employeeCode} · ${e.fullName}`,
                  },
                  { label: "Department", value: (e) => e.department },
                  {
                    label: "Enrollment",
                    value: (e) =>
                      <StatusChip status={e.payrollEnrolled ? "enrolled" : "not_enrolled"} />,
                  },
                  {
                    label: "Employment",
                    value: (e) =>
                      `${e.joiningDate || "Missing joining date"}${e.employmentEndDate ? ` → ${e.employmentEndDate}` : ""}`,
                  },
                ]}
                actions={(e) => (
                  <Button onClick={() => setProfileId(e._id)}>
                    Payroll profile
                  </Button>
                )}
              />
            </Stack>
          )}
          {tab === "runs" && (
            <Stack gap={2}>
              <PayrollTable
                rows={runs.filter(r => matches([r.month, r.kind, r.reason], r.status))}
                columns={[
                  { label: "Month", value: (r) => r.month },
                  { label: "Type", value: (r) => r.kind },
                  {
                    label: "Status",
                    value: (r) => <StatusChip status={r.status} />,
                  },
                  { label: "Employees", value: (r) => r.employeeIds.length },
                  {
                    label: "Net pay",
                    value: (r) =>
                      money(
                        r.totals?.netMinor || 0,
                        r.policy?.currency || policy.currency,
                      ),
                  },
                ]}
                actions={(r) => (
                  <Button onClick={() => showRun(r._id)}>Open</Button>
                )}
              />
            </Stack>
          )}
          {tab === "requests" && (
            <Stack gap={2}>
              <Button variant="contained" onClick={() => setRequestOpen(true)}>
                New HR request
              </Button>
              <PayrollTable
                rows={requests.filter(r => matches([employeeName(r.employeeId), r.kind, r.reason, requestDetails(r, policy.currency)], r.status))}
                columns={[
                  {
                    label: "Employee",
                    value: (r) => employeeName(r.employeeId),
                  },
                  { label: "Type", value: (r) => r.kind },
                  {
                    label: "Details",
                    value: (r) => requestDetails(r, policy.currency),
                  },
                  { label: "Reason", value: (r) => r.reason },
                  {
                    label: "Status",
                    value: (r) =>
                      <Stack gap={0.5}><StatusChip status={r.status} />{r.decisionReason && <Typography variant="caption">{r.decisionReason}</Typography>}</Stack>,
                  },
                ]}
                actions={(r) =>
                  (r.status === "pending" ||
                    (r.status === "approved" &&
                      ["leave", "overtime", "attendance"].includes(
                        r.kind,
                      ))) && (
                    <>
                      {(r.status === "pending"
                        ? ["approved", "rejected", "cancelled"]
                        : ["cancelled"]
                      ).map((status) => (
                        <Button
                          key={status}
                          disabled={busy}
                          onClick={() => {
                            setAction({
                              title: `${status} request`,
                              path: `/payroll/requests/${r._id}/decision?status=${status}`,
                              kind: "reason",
                            });
                            setActionData({
                              reason: "",
                              amount: 0,
                              reference: status,
                              dateKey: dateToday(),
                              method: "cash",
                              key: crypto.randomUUID(),
                            });
                          }}
                        >
                          {status}
                        </Button>
                      ))}
                    </>
                  )
                }
              />
            </Stack>
          )}
          {tab === "loans" && (
            <Stack gap={2}>
              <PayrollTable
                rows={loans.filter(l => matches([employeeName(l.employeeId), l.kind, l.startMonth], l.status))}
                columns={[
                  {
                    label: "Employee",
                    value: (l) => employeeName(l.employeeId),
                  },
                  { label: "Type", value: (l) => l.kind },
                  {
                    label: "Principal",
                    value: (l) => money(l.principalMinor, policy.currency),
                  },
                  {
                    label: "Installment",
                    value: (l) => money(l.installmentMinor, policy.currency),
                  },
                  {
                    label: "Outstanding",
                    value: (l) => money(l.balanceMinor, policy.currency),
                  },
                  { label: "Status", value: (l) => <StatusChip status={l.status} /> },
                ]}
                actions={(l) =>
                  can("payroll_pay") && (
                    <>
                      {(l.status === "approved"
                        ? ["disbursement", "cancellation"]
                        : l.status === "disbursed"
                          ? ["repayment"]
                          : []
                      ).map((kind) => (
                        <Button
                          key={kind}
                          onClick={() =>
                            openAction({
                              title: `${kind} · ${employeeName(l.employeeId)}`,
                              path: `/payroll/loans/${l._id}/movements`,
                              kind: "loan",
                              loan: l,
                              movementKind: kind,
                            })
                          }
                        >
                          {kind}
                        </Button>
                      ))}
                    </>
                  )
                }
              />
              <Typography variant="h6">Loan movements</Typography>
              <PayrollTable
                rows={movements}
                columns={[
                  {
                    label: "Employee",
                    value: (m) => employeeName(m.employeeId),
                  },
                  { label: "Date", value: (m) => m.createdAt.slice(0, 10) },
                  { label: "Type", value: (m) => m.kind },
                  {
                    label: "Amount",
                    value: (m) => money(m.amountMinor, policy.currency),
                  },
                  { label: "Reason", value: (m) => m.reason },
                ]}
              />
            </Stack>
          )}
          {tab === "payments" && (
            <Stack gap={2}>
              <Alert severity="info">
                Open an approved run to record individual or bulk salary
                payments. These entries do not change POS till cash.
              </Alert>
              <PayrollTable
                rows={payments.filter(p => matches([employeeName(p.employeeId), p.dateKey, p.reference, p.method], p.reversedAt ? "reversed" : "recorded"))}
                columns={[
                  {
                    label: "Employee",
                    value: (p) => employeeName(p.employeeId),
                  },
                  { label: "Date", value: (p) => p.dateKey },
                  { label: "Method", value: (p) => p.method },
                  {
                    label: "Amount",
                    value: (p) => money(p.amountMinor, policy.currency),
                  },
                  { label: "Reference", value: (p) => p.reference },
                  {
                    label: "Status",
                    value: (p) =>
                      p.reversedAt
                        ? `Reversed · ${p.reversalReason}`
                        : "Recorded",
                  },
                ]}
                actions={(p) =>
                  !p.reversedAt && (
                    <Button
                      onClick={() =>
                        openAction({
                          title: "Reverse payment",
                          path: `/payroll/payments/${p._id}/reverse`,
                          kind: "reason",
                        })
                      }
                    >
                      Reverse
                    </Button>
                  )
                }
              />
            </Stack>
          )}
          {tab === "reports" && (
            <Stack gap={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                gap={2}
                flexWrap="wrap"
              >
                <TextField
                  select
                  label="Report"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {Object.entries({
                    register: "Payroll register",
                    outstanding: "Payments & outstanding",
                    paymentHistory: "Payment entries & reversals",
                    loanMovements: "Loan balance movements",
                    attendance: "Attendance impact",
                    loans: "Loans & advances",
                    commission: "Commission",
                    variance: "Cost & variance",
                    leave: "Leave balances",
                    audit: "Audit trail",
                  }).map(([k, label]) => (
                    <MenuItem key={k} value={k}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                {(["from", "to"] as const).map((k) => (
                  <TextField
                    key={k}
                    type="month"
                    label={k}
                    value={filters[k]}
                    onChange={(e) =>
                      setFilters({ ...filters, [k]: e.target.value })
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                ))}
                <TextField
                  select
                  label="Employee"
                  value={filters.employeeId}
                  onChange={(e) =>
                    setFilters({ ...filters, employeeId: e.target.value })
                  }
                >
                  <MenuItem value="">All</MenuItem>
                  {employees.map((e) => (
                    <MenuItem key={e._id} value={e._id}>
                      {e.fullName}
                    </MenuItem>
                  ))}
                </TextField>
                {(["department", "designation"] as const).map((k) => (
                  <TextField
                    key={k}
                    label={k}
                    value={filters[k]}
                    onChange={(e) =>
                      setFilters({ ...filters, [k]: e.target.value })
                    }
                  />
                ))}
                <TextField
                  select
                  label="Payment status"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <MenuItem value="">All</MenuItem>
                  {["unpaid", "partially_paid", "paid"].map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  disabled={busy}
                  variant="contained"
                  onClick={loadReport}
                >
                  Load report
                </Button>
              </Stack>
              {report && (
                <>
                  <Stack direction="row" gap={1}>
                    <Button
                      onClick={() =>
                        exportRows(availableReportRows, `payroll-${reportType}`)
                      }
                    >
                      Excel
                    </Button>
                    <Button
                      onClick={() =>
                        exportRows(
                          availableReportRows,
                          `payroll-${reportType}`,
                          true,
                        )
                      }
                    >
                      CSV
                    </Button>
                    <Button onClick={() => window.print()}>
                      Print A4 / Save PDF
                    </Button>
                  </Stack>
                  <Box className="payroll-print-report">
                    <Typography variant="h6">
                      {labels.reports} · {reportType} · {filters.from} to{" "}
                      {filters.to} · {policy.currency}
                    </Typography>
                    <PayrollTable
                      paginate={false}
                      rows={availableReportRows}
                      columns={Object.keys(availableReportRows[0] || {}).map(
                        (k) => ({
                          label: k,
                          value: (r: Record<string, string | number>) => r[k],
                        }),
                      )}
                    />
                  </Box>
                </>
              )}
            </Stack>
          )}
          {tab === "settings" && (
            <Stack gap={3}>
              <Accordion defaultExpanded disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
                <AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={800}>General & pay rules</Typography></AccordionSummary>
                <AccordionDetails><Stack gap={2}>
              <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                <TextField
                  select
                  label="Payroll currency"
                  value={policy.currency}
                  onChange={(e) =>
                    setPolicy({ ...policy, currency: e.target.value })
                  }
                >
                  {["PKR", "USD", "EUR", "GBP", "CHF", "CDF", "INR", "AED"].map(
                    (k) => (
                      <MenuItem key={k} value={k}>
                        {k}
                      </MenuItem>
                    ),
                  )}
                </TextField>
                <TextField
                  label="Business timezone"
                  value={policy.timeZone}
                  onChange={(e) =>
                    setPolicy({ ...policy, timeZone: e.target.value })
                  }
                />
                <TextField
                  type="number"
                  label="Overtime multiplier"
                  value={policy.overtimeMultiplier}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      overtimeMultiplier: Number(e.target.value),
                    })
                  }
                />
              </Stack>
              {(
                [
                  ["enabled", "Enable payroll"],
                  ["confirmed", "I confirm business currency and timezone"],
                  ["commissionsEnabled", "Automatic sales commissions"],
                  [
                    "dailyPaidNonWork",
                    "Daily staff: pay approved paid leave/off days/holidays",
                  ],
                  [
                    "hourlyPaidNonWork",
                    "Hourly staff: pay approved paid leave/off days/holidays",
                  ],
                  ["allowZeroPay", "Explicitly allow zero base pay"],
                ] as const
              ).map(([k, label]) => (
                <FormControlLabel
                  key={k}
                  label={label}
                  control={
                    <Checkbox
                      checked={policy[k]}
                      onChange={(_, v) => setPolicy({ ...policy, [k]: v })}
                    />
                  }
                />
              ))}
              <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                {(["latePenaltyMinor", "earlyPenaltyMinor"] as const).map(
                  (k) => (
                    <TextField
                      key={k}
                      type="number"
                      label={
                        k === "latePenaltyMinor"
                          ? "Late penalty per day"
                          : "Early exit penalty per day"
                      }
                      value={policy[k] / 100}
                      onChange={(e) =>
                        setPolicy({
                          ...policy,
                          [k]: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  ),
                )}
              </Stack>
              <TextField
                label="Holiday dates (YYYY-MM-DD, comma separated)"
                value={policy.holidays.join(", ")}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    holidays: e.target.value
                      .split(",")
                      .map((d) => d.trim())
                      .filter(Boolean),
                  })
                }
              />
                </Stack></AccordionDetails>
              </Accordion>
              <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
                <AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={800}>Leave entitlements</Typography></AccordionSummary>
                <AccordionDetails><Stack gap={2}>
              {Object.entries(policy.leaveRules).map(([type, rule]) => (
                <Stack
                  key={type}
                  direction={{ xs: "column", md: "row" }}
                  gap={2}
                >
                  <Typography sx={{ minWidth: 80, alignSelf: "center" }}>
                    {type}
                  </Typography>
                  <FormControlLabel
                    label="Paid"
                    control={
                      <Checkbox
                        checked={rule.paid}
                        onChange={(_, v) =>
                          setPolicy({
                            ...policy,
                            leaveRules: {
                              ...policy.leaveRules,
                              [type]: { ...rule, paid: v },
                            },
                          })
                        }
                      />
                    }
                  />
                  {(["annualDays", "openingDays", "carryLimit"] as const).map(
                    (k) => (
                      <TextField
                        key={k}
                        type="number"
                        label={
                          {
                            annualDays: "Annual entitlement",
                            openingDays: "Opening balance",
                            carryLimit: "Carry-forward cap",
                          }[k]
                        }
                        value={rule[k] || 0}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            leaveRules: {
                              ...policy.leaveRules,
                              [type]: { ...rule, [k]: Number(e.target.value) },
                            },
                          })
                        }
                      />
                    ),
                  )}
                </Stack>
              ))}
                </Stack></AccordionDetails>
              </Accordion>
              <TextField
                label="Reason for settings change"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="contained"
                disabled={busy || !reason.trim() || (policy.enabled && !policy.confirmed)}
                onClick={() =>
                  operate(() =>
                    api.put("/payroll/settings", {
                      ...policy,
                      _id: undefined,
                      businessId: undefined,
                      createdAt: undefined,
                      updatedAt: undefined,
                      __v: undefined,
                      reason,
                    }),
                  )
                }
              >
                Save settings
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  operate(async () => {
                    const result = (
                      await api.post<{
                        migrated: number;
                        incomplete: Array<{ name: string }>;
                      }>("/payroll/migration")
                    ).data;
                    return `Migrated ${result.migrated} opening salaries. Incomplete: ${result.incomplete.map((e) => e.name).join(", ") || "none"}.`;
                  })
                }
              >
                Migrate opening salaries
              </Button>
              <Alert severity="info">
                A different authorized admin must approve each payroll run.
              </Alert>
            </Stack>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create payroll run</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              type="month"
              label="Payroll month"
              value={draft.month}
              onChange={(e) => setDraft({ ...draft, month: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              label="Run type"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            >
              {["regular", "adjustment", "final"].map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>
            {draft.kind === "adjustment" && (
              <TextField
                select
                label="Approved parent run"
                value={draft.parentRunId}
                onChange={(e) =>
                  setDraft({ ...draft, parentRunId: e.target.value })
                }
              >
                {approved.map((r) => (
                  <MenuItem key={r._id} value={r._id}>
                    {r.month} · {r._id}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button
              onClick={() =>
                setDraft({
                  ...draft,
                  employeeIds: employees
                    .filter((e) => e.payrollEnrolled)
                    .map((e) => e._id),
                })
              }
            >
              Select all enrolled employees
            </Button>
            {employees
              .filter((e) => e.payrollEnrolled)
              .map((e) => (
                <FormControlLabel
                  key={e._id}
                  label={e.fullName}
                  control={
                    <Checkbox
                      checked={draft.employeeIds.includes(e._id)}
                      onChange={(_, v) =>
                        setDraft({
                          ...draft,
                          employeeIds: v
                            ? [...draft.employeeIds, e._id]
                            : draft.employeeIds.filter((i) => i !== e._id),
                        })
                      }
                    />
                  }
                />
              ))}
            <TextField
              label="Reason"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            disabled={busy || !draft.reason.trim() || !draft.employeeIds.length}
            onClick={() =>
              operate(async () => {
                const r = (
                  await api.post<PayrollRun>("/payroll/runs", {
                    ...draft,
                    parentRunId: draft.parentRunId || undefined,
                  })
                ).data;
                setCreateOpen(false);
                setRun(r);
              })
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!selectedRun}
        onClose={() => setRun(undefined)}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle>
          Payroll {selectedRun?.month} · {selectedRun?.kind} ·{" "}
          {selectedRun?.status}
        </DialogTitle>
        <DialogContent>
          {selectedRun && (
            <Stack gap={2} sx={{ pt: 1 }}>
              <Stack direction="row" gap={1} flexWrap="wrap">
                {can("payroll_prepare") &&
                  ["draft", "calculated"].includes(selectedRun.status) && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        openAction({
                          title: "Calculate payroll",
                          kind: "reason",
                          path: `/payroll/runs/${selectedRun._id}/calculate`,
                          run: selectedRun,
                        })
                      }
                    >
                      Calculate
                    </Button>
                  )}
                {can("payroll_prepare") &&
                  selectedRun.status === "calculated" && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        openAction({
                          title: "Submit for independent approval",
                          kind: "reason",
                          path: `/payroll/runs/${selectedRun._id}/submit`,
                          run: selectedRun,
                        })
                      }
                    >
                      Submit
                    </Button>
                  )}
                {can("payroll_approve") &&
                  selectedRun.status === "submitted" && (
                    <>
                      <Button
                        disabled={
                          busy ||
                          selectedRun.preparedBy === user?.id ||
                          selectedRun.createdBy === user?.id
                        }
                        onClick={() =>
                          openAction({
                            title: "Approve frozen payroll",
                            kind: "reason",
                            path: `/payroll/runs/${selectedRun._id}/approve`,
                            run: selectedRun,
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        onClick={() =>
                          openAction({
                            title: "Return payroll for correction",
                            kind: "reason",
                            path: `/payroll/runs/${selectedRun._id}/return`,
                            run: selectedRun,
                          })
                        }
                      >
                        Return
                      </Button>
                    </>
                  )}
                {can("payroll_pay") && selectedRun.status === "approved" && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const first = selectedRun.items.find(
                        (i) => (i.outstandingMinor ?? i.netMinor) > 0,
                      );
                      if (first)
                        openAction({
                          title: "Pay all outstanding employees",
                          kind: "payment",
                          path: "bulk",
                          run: selectedRun,
                          item: first,
                        });
                    }}
                  >
                    Bulk payment
                  </Button>
                )}
              </Stack>
              <Typography>
                Gross{" "}
                {money(
                  selectedRun.totals?.grossMinor || 0,
                  selectedRun.policy?.currency || policy.currency,
                )}{" "}
                · Net{" "}
                {money(
                  selectedRun.totals?.netMinor || 0,
                  selectedRun.policy?.currency || policy.currency,
                )}{" "}
                · Employer cost{" "}
                {money(
                  selectedRun.totals?.employerCostMinor || 0,
                  selectedRun.policy?.currency || policy.currency,
                )}
              </Typography>
              <PayrollTable
                rows={selectedRun.items}
                columns={[
                  { label: "Employee", value: (i) => i.employeeName },
                  {
                    label: "Gross",
                    value: (i) => money(i.grossMinor, policy.currency),
                  },
                  {
                    label: "Deductions",
                    value: (i) => money(i.deductionsMinor, policy.currency),
                  },
                  {
                    label: "Net",
                    value: (i) => money(i.netMinor, policy.currency),
                  },
                  {
                    label: "Outstanding",
                    value: (i) =>
                      money(i.outstandingMinor ?? i.netMinor, policy.currency),
                  },
                  {
                    label: "Exceptions",
                    value: (i) => i.exceptions.join("; ") || "Clear",
                  },
                ]}
                actions={(i) => (
                  <>
                    <Button
                      onClick={() =>
                        setSlip({
                          ...i,
                          month: selectedRun.month,
                          runId: selectedRun._id,
                          currency:
                            selectedRun.policy?.currency || policy.currency,
                        })
                      }
                    >
                      {selectedRun.status === "approved"
                        ? "Payslip"
                        : "Breakdown"}
                    </Button>
                    {can("payroll_pay") &&
                      selectedRun.status === "approved" &&
                      (i.outstandingMinor ?? i.netMinor) > 0 && (
                        <Button
                          onClick={() =>
                            openAction({
                              title: `Pay ${i.employeeName}`,
                              kind: "payment",
                              path: "/payroll/payments",
                              run: selectedRun,
                              item: i,
                            })
                          }
                        >
                          Record payment
                        </Button>
                      )}
                  </>
                )}
              />
              {can("payroll_prepare") &&
                ["draft", "calculated"].includes(selectedRun.status) && (
                  <>
                    <Typography variant="h6">
                      Adjustments / final settlement benefits
                    </Typography>
                    <Stack direction={{ xs: "column", md: "row" }} gap={1}>
                      <TextField
                        select
                        label="Employee"
                        value={adjustment.employeeId}
                        onChange={(e) =>
                          setAdjustment({
                            ...adjustment,
                            employeeId: e.target.value,
                          })
                        }
                      >
                        {selectedRun.employeeIds.map((id) => (
                          <MenuItem key={id} value={id}>
                            {employeeName(id)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Component"
                        value={adjustment.kind}
                        onChange={(e) =>
                          setAdjustment({ ...adjustment, kind: e.target.value })
                        }
                      >
                        {[
                          "bonus",
                          "reimbursement",
                          "deduction",
                          "allowance",
                          "benefit",
                          "encashment",
                          "recovery",
                        ].map((k) => (
                          <MenuItem key={k} value={k}>
                            {k}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        type="number"
                        label="Amount"
                        value={adjustment.amount}
                        onChange={(e) =>
                          setAdjustment({
                            ...adjustment,
                            amount: Number(e.target.value),
                          })
                        }
                      />
                      {adjustment.kind === "recovery" && (
                        <TextField
                          label="Loan ID"
                          value={adjustment.loanId}
                          onChange={(e) =>
                            setAdjustment({
                              ...adjustment,
                              loanId: e.target.value,
                            })
                          }
                        />
                      )}
                      <TextField
                        label="Reason"
                        value={adjustment.reason}
                        onChange={(e) =>
                          setAdjustment({
                            ...adjustment,
                            reason: e.target.value,
                          })
                        }
                      />
                      <Button
                        disabled={
                          busy ||
                          !adjustment.employeeId ||
                          !adjustment.reason.trim()
                        }
                        onClick={() =>
                          operate(async () => {
                            await api.put(
                              `/payroll/runs/${selectedRun._id}/adjustments`,
                              {
                                version: selectedRun.version,
                                reason: adjustment.reason,
                                adjustments: [
                                  ...selectedRun.adjustments.map((a) => ({
                                    ...a,
                                    amount: a.amountMinor / 100,
                                    amountMinor: undefined,
                                  })),
                                  {
                                    ...adjustment,
                                    loanId: adjustment.loanId || undefined,
                                  },
                                ],
                              },
                            );
                            await showRun(selectedRun._id);
                          })
                        }
                      >
                        Add adjustment
                      </Button>
                    </Stack>
                    <PayrollTable
                      rows={selectedRun.adjustments}
                      columns={[
                        {
                          label: "Employee",
                          value: (a) => employeeName(a.employeeId),
                        },
                        { label: "Type", value: (a) => a.kind },
                        {
                          label: "Amount",
                          value: (a) => money(a.amountMinor, policy.currency),
                        },
                        { label: "Reason", value: (a) => a.reason },
                      ]}
                      actions={(a) => (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            operate(async () => {
                              await api.put(
                                `/payroll/runs/${selectedRun._id}/adjustments`,
                                {
                                  version: selectedRun.version,
                                  reason: `Remove adjustment: ${a.reason}`,
                                  adjustments: selectedRun.adjustments
                                    .filter((x) => x !== a)
                                    .map((x) => ({
                                      ...x,
                                      amount: x.amountMinor / 100,
                                      amountMinor: undefined,
                                    })),
                                },
                              );
                              await showRun(selectedRun._id);
                            })
                          }
                        >
                          Remove
                        </Button>
                      )}
                    />
                  </>
                )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRun(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!action}
        onClose={() => !busy && setAction(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{action?.title}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {action && action.kind !== "reason" && (
              <>
                {(action.kind === "payment" && action.path !== "bulk") ||
                action.movementKind === "repayment" ? (
                  <TextField
                    type="number"
                    label="Amount"
                    value={actionData.amount}
                    onChange={(e) =>
                      setActionData({
                        ...actionData,
                        amount: Number(e.target.value),
                      })
                    }
                  />
                ) : (
                  <Typography>
                    {action.path === "bulk"
                      ? "Records each selected employee's full outstanding balance with the date, method and reference below."
                      : action.movementKind === "disbursement"
                        ? money(
                            action.loan?.principalMinor || 0,
                            policy.currency,
                          )
                        : "Cancel undisbursed loan"}
                  </Typography>
                )}
                {action.kind === "payment" && (
                  <>
                    <TextField
                      type="date"
                      label="Payment date"
                      value={actionData.dateKey}
                      slotProps={{ inputLabel: { shrink: true } }}
                      onChange={(e) =>
                        setActionData({
                          ...actionData,
                          dateKey: e.target.value,
                        })
                      }
                    />
                    <TextField
                      select
                      label="Payment method"
                      value={actionData.method}
                      onChange={(e) =>
                        setActionData({ ...actionData, method: e.target.value })
                      }
                    >
                      <MenuItem value="cash">Cash</MenuItem>
                      <MenuItem value="bank">Bank</MenuItem>
                    </TextField>
                  </>
                )}
                <TextField
                  label="Reference / receipt number"
                  value={actionData.reference}
                  onChange={(e) =>
                    setActionData({ ...actionData, reference: e.target.value })
                  }
                />
              </>
            )}
            <TextField
              label="Reason"
              required
              value={actionData.reason}
              onChange={(e) =>
                setActionData({ ...actionData, reason: e.target.value })
              }
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setAction(undefined)}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !actionData.reason.trim() ||
              (action?.kind !== "reason" && !actionData.reference.trim())
            }
            onClick={() => {
              if (action?.path.includes("/decision"))
                void operate(async () => {
                  const status = action.path.split("status=")[1];
                  await api.post(action.path.split("?")[0], {
                    status,
                    reason: actionData.reason,
                  });
                  setAction(undefined);
                });
              else if (action?.path === "bulk")
                void operate(async () => {
                  await api.post("/payroll/payments", {
                    reason: actionData.reason,
                    payments: action
                      .run!.items.filter(
                        (i) => (i.outstandingMinor ?? i.netMinor) > 0,
                      )
                      .map((i) => ({
                        runId: action.run!._id,
                        employeeId: i.employeeId,
                        amount: (i.outstandingMinor ?? i.netMinor) / 100,
                        dateKey: actionData.dateKey,
                        method: actionData.method,
                        reference: actionData.reference,
                        key: `${actionData.key}:${i.employeeId}`,
                      })),
                  });
                  await showRun(action.run!._id);
                  setAction(undefined);
                });
              else void commitAction();
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={requestOpen}
        onClose={() => !busy && setRequestOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>New request</DialogTitle>
        <DialogContent>
          <RequestForm
            employees={employees}
            busy={busy}
            submit={(data) =>
              void operate(async () => {
                await api.post("/payroll/requests", data);
                setRequestOpen(false);
              })
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!profileId}
        onClose={() => setProfileId("")}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle>Employee payroll</DialogTitle>
        <DialogContent>
          {profileId && <EmployeePayrollPanel employeeId={profileId} />}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setProfileId("");
              void load().catch((e) => setError(requestError(e)));
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!slip}
        onClose={() => setSlip(undefined)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Employee pay breakdown</DialogTitle>
        <DialogContent>
          {slip && (
            <>
              <Payslip
                item={slip}
                currency={slip.currency || policy.currency}
              />
              <Button onClick={() => setSlip(undefined)}>Close payslip</Button>
              <Typography variant="h6" sx={{ mt: 3 }}>
                Attendance impact
              </Typography>
              <PayrollTable
                rows={slip.days}
                columns={[
                  { label: "Date", value: (d) => d.date },
                  { label: "Status", value: (d) => d.status },
                  { label: "Worked minutes", value: (d) => d.workedMinutes },
                  { label: "Payable units", value: (d) => d.payableUnits },
                  {
                    label: "Overtime minutes",
                    value: (d) => d.overtimeMinutes,
                  },
                ]}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <style>{`@media print { body * { visibility: hidden; } .payroll-print-report, .payroll-print-report * { visibility: visible; } .payroll-print-report { position: absolute; left: 0; top: 0; width: 100%; } .payroll-print-report table { font-size: 9pt; } @page { size: A4 landscape; margin: 12mm; } }`}</style>
    </Stack>
  );
}
