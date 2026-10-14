import { Alert, Button, Card, CardActions, CardContent, Grid, Stack, Typography } from '@mui/material';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { payrollScreens, financeScreens, personalScreens } from '../../lib/workflowScreens';
export default function WorkflowHomePage({ area }: { area: 'payroll' | 'finance' | 'personal' }) {
  const user = useSelector((s: RootState) => s.auth.user);
  const [params] = useSearchParams();
  const legacy: Record<string, string> = { overview: 'employees', runs: 'runs', requests: 'leave-requests', loans: 'loans', payments: 'payments', reports: 'reports', settings: 'settings' };
  if (area === 'payroll' && legacy[params.get('tab') || '']) return <Navigate replace to={'/payroll/' + legacy[params.get('tab')!]} />;
  const screens = (area === 'payroll' ? payrollScreens : area === 'finance' ? financeScreens : personalScreens).filter(s => s.permissions.some(p => hasScreenAccess(user, p)));
  return <Stack gap={3}><Stack direction="row" justifyContent="space-between"><Typography variant="h4" fontWeight={800}>{area === 'personal' ? 'My Workspace' : area === 'finance' ? 'Finance' : 'Payroll'}</Typography><Button component={Link} to="/workflow-manual">User manual</Button></Stack>
    <Typography color="text.secondary">{area === 'payroll' ? 'Set up salaries → review requests → calculate and approve a run → record payments.' : area === 'finance' ? 'Set up accounts → submit expenses → approve costs → record payments → review reports and close the month.' : 'Choose a task below. Your admin controls which features are available to you.'}</Typography>
    {!screens.length && <Alert severity="info">No features have been shared with this account. Ask your Super Admin to enable the required screens.</Alert>}
    <Grid container spacing={2}>{screens.map(s => <Grid key={s.path} size={{ xs: 12, sm: 6, lg: 4 }}><Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}><CardContent sx={{ flex: 1 }}><Typography variant="h6" fontWeight={700}>{s.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{s.description}</Typography></CardContent><CardActions><Button component={Link} to={s.path}>Open screen →</Button></CardActions></Card></Grid>)}</Grid>
  </Stack>;
}
