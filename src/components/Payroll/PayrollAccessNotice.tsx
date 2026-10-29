import { Alert, Button, Stack } from '@mui/material';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../../store';

export default function PayrollAccessNotice({ error }: { error: string }) {
  const user = useSelector((state: RootState) => state.auth.user);
  if (!error) return null;

  const missingEmployee = error === 'Employee not found in the selected business';
  if (missingEmployee && user?.role === 'super_admin') {
    return <Alert severity="info">
      Your Super Admin account has full payroll access. No personal employee profile is linked to this login in the selected business. Link your login to an employee profile to use My Payroll, or open Payroll to manage employee salaries.
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
        <Button component={Link} to="/employees">Manage employee profiles</Button>
        <Button component={Link} to="/payroll/runs">Open Payroll</Button>
      </Stack>
    </Alert>;
  }

  return <Alert severity="error">{missingEmployee ? 'Ask your admin to link your login to an employee profile.' : error}</Alert>;
}
