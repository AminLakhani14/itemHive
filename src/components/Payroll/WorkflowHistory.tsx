import React from 'react';
import { Box, Stack, TablePagination, Typography, useMediaQuery, useTheme } from '@mui/material';
import { PayrollTable } from './PayrollShared';

interface Entry {
  _id?: string;
  at?: string;
  createdAt?: string;
  action: string;
  actorName?: string;
  actorId?: string;
  reason?: string;
  changes?: string;
}
const time = (entry: Entry) => {
  const value = entry.at || entry.createdAt;
  return value ? new Date(value).toLocaleString() : 'Time not recorded';
};
export default function WorkflowHistory({ rows }: { rows: Entry[] }) {
  const desktop = useMediaQuery(useTheme().breakpoints.up('sm'));
  const [page, setPage] = React.useState(0);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  if (desktop) return <PayrollTable rows={rows} emptyMessage="No activity recorded yet." columns={[
    { label: 'Time', value: time },
    { label: 'Action', value: h => h.action.replaceAll('.', ' ') },
    { label: 'User', value: h => h.actorName || h.actorId || 'Recorded user' },
    ...(rows.some(h => h.changes) ? [{ label: 'Changes', value: (h: Entry) => h.changes || '-' }] : []),
    { label: 'Reason / note', value: h => h.reason || 'No additional note' },
  ]} />;
  return <Stack gap={1}>
    {!rows.length && <Typography variant="body2" color="text.secondary">No activity recorded yet.</Typography>}
    {rows.slice(safePage * 10, (safePage + 1) * 10).map((entry, index) => <Box key={entry._id || index} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
      <Typography variant="body2" fontWeight={700} sx={{ textTransform: 'capitalize' }}>{entry.action.replaceAll('.', ' ')}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere', mb: 1 }}>{entry.actorName || entry.actorId || 'Recorded user'} | {time(entry)}</Typography>
      {entry.changes && <Typography variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{entry.changes}</Typography>}
      <Typography variant="body2" color={entry.reason ? 'text.primary' : 'text.secondary'} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.reason || 'No additional note'}</Typography>
    </Box>)}
    {rows.length > 10 && <TablePagination component="div" count={rows.length} page={safePage} rowsPerPage={10} rowsPerPageOptions={[10]} onPageChange={(_, value) => setPage(value)} sx={{ '& .MuiTablePagination-toolbar': { px: 0, flexWrap: 'wrap' } }} />}
  </Stack>;
}
