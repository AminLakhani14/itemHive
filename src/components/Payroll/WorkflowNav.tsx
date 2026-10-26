import { Breadcrumbs, Button, Stack, Typography } from '@mui/material';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { workflowGroups, nextWorkflowScreen, type WorkflowArea } from '../../lib/workflowScreens';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';

export default function WorkflowNav({ area = 'payroll' }: { area?: WorkflowArea }) {
  const { pathname } = useLocation();
  const group = workflowGroups.find(g => g.id === area)!;
  const screen = group.screens.find(s => s.path === pathname);
  const user = useSelector((s: RootState) => s.auth.user);
  const next = nextWorkflowScreen(pathname);
  return <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
    <Breadcrumbs separator={<ChevronRight size={14} />} aria-label="Screen location">
      <Typography variant="body2" color="text.secondary">{group.title}</Typography>
      {screen && <Typography variant="body2" color="text.primary">{screen.title}</Typography>}
    </Breadcrumbs>
    <Stack direction="row" gap={1} flexWrap="wrap">
      {next && next.permissions.some(p => hasScreenAccess(user, p)) && <Button component={Link} to={next.path} size="small" endIcon={<ChevronRight size={14} />}>Next: {next.title}</Button>}
      <Button component={Link} to="/workflow-manual" size="small" startIcon={<BookOpen size={16} />}>User guide</Button>
    </Stack>
  </Stack>;
}
