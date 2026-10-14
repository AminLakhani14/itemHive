import { Button, Stack } from '@mui/material';
import { Link } from 'react-router-dom';
export default function WorkflowNav({ area = 'payroll' }: { area?: 'payroll' | 'finance' | 'personal' }) {
  return <Stack direction="row" gap={1} flexWrap="wrap"><Button component={Link} to={area === 'personal' ? '/my' : '/' + area}>← {area === 'personal' ? 'My Workspace' : area === 'finance' ? 'Finance' : 'Payroll'} home</Button><Button component={Link} to="/workflow-manual">User manual</Button></Stack>;
}
