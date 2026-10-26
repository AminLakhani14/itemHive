import { Alert, Button, Stack } from '@mui/material';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { workflowGroups, expenseScreens, type WorkflowArea } from '../../lib/workflowScreens';

// Keep existing bookmarks working while navigation lives in the sidebar.
export default function WorkflowHomePage({ area }: { area: WorkflowArea }) {
  const user = useSelector((s: RootState) => s.auth.user);
  const [params] = useSearchParams();
  const legacy: Record<string, string> = { overview: 'employees', runs: 'runs', requests: 'leave-requests', loans: 'loans', payments: 'payments', reports: 'reports', settings: 'settings' };
  const group = workflowGroups.find(g => g.id === area)!;
  const screens = group.screens.filter(s => s.permissions.some(p => hasScreenAccess(user, p)));
  const legacyPath = area === 'payroll' && legacy[params.get('tab') || ''];
  if (legacyPath) return <Navigate replace to={'/payroll/' + legacyPath} />;
  if (screens.length) return <Navigate replace to={screens[0].path} />;
  const expense = expenseScreens.find(s => s.permissions.some(p => hasScreenAccess(user, p)));
  if ((area === 'finance' || area === 'personal') && expense) return <Navigate replace to={expense.path} />;
  return <Stack gap={2}><Alert severity="info">No {group.title.toLowerCase()} screens have been shared with your account. Ask your administrator for access.</Alert><Button component={Link} to="/profile" sx={{ alignSelf: 'flex-start' }}>My profile</Button></Stack>;
}
