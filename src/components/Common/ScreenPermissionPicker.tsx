import { Box, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { ADMIN_SCREEN_PERMISSIONS, toggleScreenPermission, type ScreenPermission } from '../../lib/screenPermissions';
import { NAV_MODULES } from '../../lib/navigation';

// Every left-nav module is listed, so a screen added to the sidebar appears here too.
// Permissions without their own sidebar entry are listed under additional screens.
const navKeys = new Set(NAV_MODULES.map((module) => module.permission));
const extraPermissions = ADMIN_SCREEN_PERMISSIONS.filter((permission) => !navKeys.has(permission.key));
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' };

interface ScreenPermissionPickerProps {
    value: ScreenPermission[];
    onChange: (value: ScreenPermission[]) => void;
    disabled?: boolean;
}

export default function ScreenPermissionPicker({ value, onChange, disabled }: ScreenPermissionPickerProps) {
    const toggle = (key: ScreenPermission) => onChange(toggleScreenPermission(value, key));
    return <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Modules that share access, such as POS Terminal, Shift Management and Order Drafts, are selected together.</Typography>
        <Box sx={{ ...grid, gap: 1.25 }}>
            {NAV_MODULES.map((module) => {
                const checked = Boolean(module.permission && value.includes(module.permission));
                return <Box key={module.path} sx={{ border: '1px solid', borderColor: checked ? 'primary.main' : 'divider', borderRadius: 2, bgcolor: checked ? 'action.selected' : 'transparent', px: 1, py: 0.5 }}>
                    <FormControlLabel sx={{ m: 0, width: '100%' }} control={<Checkbox checked={checked} disabled={!module.permission || disabled} onChange={() => module.permission && toggle(module.permission)} />} label={<Stack direction="row" spacing={1} alignItems="center"><Box sx={{ display: 'flex', color: 'text.secondary' }}>{module.icon}</Box><Box><Typography variant="body2" fontWeight={600}>{module.text}</Typography>{!module.permission && <Typography variant="caption" color="text.secondary">Super Admin only</Typography>}</Box></Stack>} />
                </Box>;
            })}
        </Box>
        <Divider sx={{ my: 3 }} />
        <Typography fontWeight={700}>Additional screens & actions</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Set access to settings, product actions, payroll processing, and expense approvals.</Typography>
        <Box sx={{ ...grid, gap: 0.5 }}>
            {extraPermissions.map((permission) => <FormControlLabel key={permission.key} control={<Checkbox checked={value.includes(permission.key)} onChange={() => toggle(permission.key)} disabled={disabled} />} label={<Typography variant="body2">{permission.label}</Typography>} />)}
        </Box>
    </>;
}
