import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { PayrollRequest } from '../../types/payroll';
import { money } from './PayrollShared';

export const compactPayrollSx = {
  '& .MuiTextField-root': { minWidth: 150 },
  '& .MuiInputBase-input': { py: 1.1, fontSize: 14 },
  '& .MuiButton-root': { minHeight: 32, fontSize: 13 },
  '& .MuiTab-root': { minHeight: 44, py: 1, textTransform: 'none' },
  '& .MuiTabs-root': { minHeight: 44 },
  '& .MuiTableCell-root': { py: 1, fontSize: 13 },
  '& .MuiCardContent-root': { p: 2, '&:last-child': { pb: 2 } },
};

export function PayrollStats({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${items.length}, minmax(0, 1fr))` }, gap: 1.5 }}>
    {items.map(item => <Card key={item.label} variant="outlined"><CardContent>
      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
      <Typography variant="h6" fontWeight={800}>{item.value}</Typography>
    </CardContent></Card>)}
  </Box>;
}

export function StatusChip({ status }: { status: string }) {
  const color = ['approved', 'paid', 'enrolled'].includes(status) ? 'success' : ['pending', 'submitted', 'partially_paid'].includes(status) ? 'warning' : ['rejected', 'cancelled', 'reversed'].includes(status) ? 'error' : 'default';
  return <Chip size="small" color={color} label={status.replaceAll('_', ' ')} sx={{ textTransform: 'capitalize', height: 24 }} />;
}

export function requestDetails(request: PayrollRequest, currency: string) {
  const d = request.data;
  if (request.kind === 'leave') return `${d.startDate} – ${d.endDate} · ${d.leaveType} · ${d.fraction === 0.5 ? 'Half day' : 'Full day'}`;
  if (request.kind === 'overtime' || request.kind === 'attendance') return `${d.dateKey} · ${d.minutes || 0} min`;
  return `${money(Math.round((d.amount || 0) * 100), currency)} · ${money(Math.round((d.installment || 0) * 100), currency)}/month · from ${d.startMonth}`;
}

export function PayrollSection({ title, action, children }: React.PropsWithChildren<{ title: string; action?: React.ReactNode }>) {
  return <Stack gap={1.5}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800}>{title}</Typography>{action}</Stack>{children}</Stack>;
}
