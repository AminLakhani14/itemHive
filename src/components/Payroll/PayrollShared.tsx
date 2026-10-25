import { buildPayrollPdfBlob } from "../../lib/payrollPdf";
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
} from "@mui/material";
import * as XLSX from "xlsx";
import type {
  PayrollEmployee,
  PayrollItem,
  PayrollPolicy,
  PayrollRequest,
} from "../../types/payroll";
import { useSelector } from "react-redux";
import type { RootState } from "../../store";

export const money = (value: number, currency = "PKR") =>
  new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    (value || 0) / 100,
  );
export const requestError = (e: unknown) => {
  const error = e as {
    response?: { data?: { message?: string; details?: string } };
    message?: string;
  };
  return (
    error.response?.data?.details ||
    error.response?.data?.message ||
    error.message ||
    "Request failed"
  );
};
export const dateToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function PayrollTable<T>({
  rows,
  columns,
  actions,
  paginate = true,
  emptyMessage = 'No records for this selection.',
}: {
  rows: T[];
  columns: Array<{ label: string; value: (row: T) => React.ReactNode }>;
  actions?: (row: T) => React.ReactNode;
  paginate?: boolean;
  emptyMessage?: string;
}) {
  const [page, setPage] = React.useState(0);
  const [limit, setLimit] = React.useState(10);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / limit) - 1));
  return (
    <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.label} sx={{ fontWeight: 800 }}>
                {c.label}
              </TableCell>
            ))}
            {actions && <TableCell>Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {(paginate ? rows.slice(safePage * limit, (safePage + 1) * limit) : rows).map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.label}>{c.value(row)}</TableCell>
              ))}
              {actions && (
                <TableCell>
                  <Stack direction="row" gap={1} flexWrap="wrap">
                    {actions(row)}
                  </Stack>
                </TableCell>
              )}
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={columns.length + (actions ? 1 : 0)}>
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {paginate && rows.length > 10 && <TablePagination component="div" count={rows.length} page={safePage} rowsPerPage={limit} rowsPerPageOptions={[10, 25, 50]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }} />}
    </TableContainer>
  );
}
export function exportRows(
  rows: Record<string, string | number>[],
  name: string,
  csv = false,
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(csv ? rows.map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key,
        typeof value === 'string' && /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value,
      ]),
    )) : rows),
    "Report",
  );
  XLSX.writeFile(workbook, `${name}.${csv ? "csv" : "xlsx"}`);
}
export function Payslip({
  item,
  currency,
}: {
  item: PayrollItem;
  currency: string;
}) {
  const app = useSelector((s: RootState) => s.settings.app);
  const [error, setError] = React.useState("");
  const pdf = async () => {
    try {
      const blob = await buildPayrollPdfBlob({
        title: "Salary Payslip",
        shop: {
          name: app.shopName,
          phone: app.shopPhone,
          address: app.shopAddress,
        },
        billTo: item.employeeName,
        billToSubtitle: `${item.employeeCode} · ${item.department} · ${item.designation}`,
        meta: [
          { label: "Period", value: item.month || "" },
          { label: "Run", value: item.runId || "" },
          { label: "Currency", value: currency },
        ],
        columns: [
          { label: "Component", width: 2 },
          { label: "Calculation", width: 5 },
          { label: "Amount", width: 2, align: "right" },
        ],
        rows: item.lines.map((l) => [
          l.name,
          l.formula,
          money(l.amountMinor, currency),
        ]),
        totals: [
          { label: "Gross pay", value: money(item.grossMinor, currency) },
          { label: "Deductions", value: money(item.deductionsMinor, currency) },
          {
            label: "Net pay",
            value: money(item.netMinor, currency),
            strong: true,
          },
          { label: "Paid", value: money(item.paidMinor || 0, currency) },
          {
            label: "Outstanding",
            value: money(item.outstandingMinor ?? item.netMinor, currency),
          },
        ],
        footer:
          "Released payroll snapshot. Payment status reflects recorded payments.",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payslip-${item.employeeCode}-${item.month}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(requestError(e));
    }
  };
  return (
    <Stack gap={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Typography variant="h6">
          {item.employeeName} · {item.month}
        </Typography>
        <Typography color="text.secondary">
          {item.employeeCode} · {item.department} · {item.designation}
        </Typography>
      </Box>
      <PayrollTable
        paginate={false}
        rows={item.lines}
        columns={[
          { label: "Component", value: (l) => l.name },
          { label: "Type", value: (l) => l.kind },
          { label: "Calculation", value: (l) => l.formula },
          { label: "Amount", value: (l) => money(l.amountMinor, currency) },
        ]}
      />
      <Typography>
        Gross {money(item.grossMinor, currency)} · Deductions{" "}
        {money(item.deductionsMinor, currency)} · Net{" "}
        {money(item.netMinor, currency)} · Outstanding{" "}
        {money(item.outstandingMinor ?? item.netMinor, currency)}
      </Typography>
      <Button onClick={pdf} variant="contained">
        Download PDF payslip
      </Button>
    </Stack>
  );
}
export function RequestForm({
  employees,
  self = false,
  initialKind = "leave",
  allowedKinds,
  submit,
  busy,
}: {
  employees: PayrollEmployee[];
  self?: boolean;
  initialKind?: string;
  allowedKinds?: string[];
  submit: (data: {
    key: string;
    employeeId?: string;
    kind: string;
    reason: string;
    data: PayrollRequest["data"];
  }) => void;
  busy: boolean;
}) {
  const [employeeId, setEmployee] = React.useState("");
  const [key] = React.useState(() => crypto.randomUUID());
  const [kind, setKind] = React.useState(initialKind);
  const [reason, setReason] = React.useState("");
  const [data, setData] = React.useState({
    startDate: dateToday(),
    endDate: dateToday(),
    dateKey: dateToday(),
    leaveType: "casual",
    fraction: 1,
    minutes: 60,
    amount: 0,
    installment: 0,
    startMonth: dateToday().slice(0, 7),
  });
  const field = (key: keyof typeof data, label: string, type = "text") => (
    <TextField
      size="small"
      fullWidth
      label={label}
      type={type}
      value={data[key]}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: type === "number" ? { min: key === "minutes" ? 1 : 0.01, max: key === "minutes" ? 1440 : 1_000_000_000, step: key === "minutes" ? 1 : 0.01 } : {} }}
      onChange={(e) =>
        setData({
          ...data,
          [key]: type === "number" ? Number(e.target.value) : e.target.value,
        })
      }
    />
  );
  return (
    <Stack gap={2}>
      {!self && (
        <TextField
          select
          label="Employee"
          value={employeeId}
          onChange={(e) => setEmployee(e.target.value)}
        >
          <MenuItem value="">Choose employee</MenuItem>
          {employees.map((e) => (
            <MenuItem value={e._id} key={e._id}>
              {e.fullName}
            </MenuItem>
          ))}
        </TextField>
      )}
      {allowedKinds?.length !== 1 && <TextField
        select
        label="Request type"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        {(allowedKinds || [
          "leave",
          "overtime",
          "loan",
          "advance",
          ...(!self ? ["attendance"] : []),
        ]).map((k) => (
          <MenuItem key={k} value={k}>
            {k}
          </MenuItem>
        ))}
      </TextField>}
      {kind === "leave" ? (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {field("startDate", "Start date", "date")}
            {field("endDate", "End date", "date")}
          </Box>
          <TextField
            select
            label="Leave type"
            value={data.leaveType}
            onChange={(e) => setData({ ...data, leaveType: e.target.value })}
          >
            {["casual", "sick", "annual", "unpaid", "other"].map((k) => (
              <MenuItem key={k} value={k}>
                {k}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            label="Half day"
            control={
              <Checkbox
                checked={data.fraction === 0.5}
                onChange={(_, v) => setData({ ...data, fraction: v ? 0.5 : 1 })}
              />
            }
          />
        </>
      ) : ["overtime", "attendance"].includes(kind) ? (
        <>
          {field("dateKey", "Work date", "date")}
          {kind === "overtime" && field("minutes", "Extra minutes", "number")}
          {kind === "attendance" && (
            <Alert severity="info">
              Review the punches in Attendance first. This request records a
              manager’s resolution of an attendance exception, with the reason
              below.
            </Alert>
          )}
        </>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {field("amount", "Requested amount", "number")}
            {field("installment", "Monthly installment", "number")}
          </Box>
          {field("startMonth", "Recovery starts", "month")}
        </>
      )}
      {kind === "leave" && data.fraction === 0.5 && data.startDate !== data.endDate && <Alert severity="info">For half-day leave, choose the same start and end date.</Alert>}
      {["loan", "advance"].includes(kind) && data.installment > data.amount && <Alert severity="info">The monthly installment cannot exceed the requested amount.</Alert>}
      <TextField
        label="Reason"
        multiline
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        variant="contained"
        disabled={busy || !reason.trim() || (!self && !employeeId) || (kind === 'leave' ? !data.startDate || !data.endDate || data.startDate > data.endDate || (data.fraction === 0.5 && data.startDate !== data.endDate) : ['loan', 'advance'].includes(kind) ? data.amount <= 0 || data.installment <= 0 || data.installment > data.amount || !data.startMonth : kind === 'overtime' ? !Number.isInteger(data.minutes) || data.minutes <= 0 || data.minutes > 1440 || !data.dateKey : !data.dateKey)}
        onClick={() =>
          submit({
            key,
            employeeId: self ? undefined : employeeId,
            kind,
            reason,
            data:
              kind === "leave"
                ? {
                    startDate: data.startDate,
                    endDate: data.endDate,
                    leaveType: data.leaveType,
                    fraction: data.fraction,
                  }
                : kind === "overtime"
                  ? { dateKey: data.dateKey, minutes: data.minutes }
                  : kind === "attendance"
                    ? { dateKey: data.dateKey }
                    : {
                        amount: data.amount,
                        installment: data.installment,
                        startMonth: data.startMonth,
                      },
          })
        }
      >
        Submit request
      </Button>
    </Stack>
  );
}
export const emptyPolicy: PayrollPolicy = {
  enabled: false,
  confirmed: false,
  currency: "PKR",
  timeZone: "Asia/Karachi",
  overtimeMultiplier: 1,
  commissionsEnabled: false,
  dailyPaidNonWork: false,
  hourlyPaidNonWork: false,
  allowZeroPay: false,
  latePenaltyMinor: 0,
  earlyPenaltyMinor: 0,
  holidays: [],
  leaveRules: Object.fromEntries(
    ["casual", "sick", "annual", "unpaid", "other"].map((k) => [
      k,
      {
        paid: ["casual", "sick", "annual"].includes(k),
        annualDays: 0,
        openingDays: 0,
        carryLimit: 0,
      },
    ]),
  ),
};
