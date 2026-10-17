import React from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Store } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import { BRANCH_STORAGE_KEY, fetchMyBranches, setActiveBranch } from '../../features/branch/branchSlice';
import { fetchProducts, resetInventory } from '../../features/inventory/inventorySlice';
import { resetTransactions } from '../../features/transactions/transactionSlice';
import { clearCart } from '../../features/pos/posSlice';

// Shown to logins that work in more than one branch. Each branch keeps its own inventory, sales,
// customers and staff, so switching clears the previous branch's data before the new branch loads.
export default function BranchSwitcher({ fontColor }: { fontColor?: string }) {
    const theme = useTheme();
    const dispatch = useDispatch<AppDispatch>();
    const { branches, activeBranchId } = useSelector((state: RootState) => state.branch);

    React.useEffect(() => {
        const load = () => { void dispatch(fetchMyBranches()); };
        load();
        // A different workspace, or new branch assignments, change the branches this login can use.
        window.addEventListener('itemhive-workspace-changed', load);
        window.addEventListener('itemhive-team-updated', load);
        window.addEventListener('itemhive-branches-updated', load);
        return () => {
            window.removeEventListener('itemhive-workspace-changed', load);
            window.removeEventListener('itemhive-team-updated', load);
            window.removeEventListener('itemhive-branches-updated', load);
        };
    }, [dispatch]);

    const changeBranch = (branchId: string) => {
        if (!branchId || branchId === activeBranchId) return;
        localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
        dispatch(setActiveBranch(branchId));
        dispatch(resetInventory());
        dispatch(resetTransactions());
        dispatch(clearCart());
        window.dispatchEvent(new Event('itemhive-branch-changed'));
        dispatch(fetchProducts({ force: true }));
    };

    if (branches.length < 2) return null;
    const active = branches.find((branch) => branch.id === activeBranchId);

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.6,
                borderRadius: 999,
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.18),
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.05),
                minWidth: 0,
            }}
        >
            <Store size={17} color={theme.palette.primary.main} aria-hidden />
            <TextField
                select
                size="small"
                value={active?.id || ''}
                onChange={(event) => changeBranch(event.target.value)}
                variant="standard"
                InputProps={{ disableUnderline: true }}
                SelectProps={{
                    displayEmpty: true,
                    inputProps: { 'aria-label': 'Switch branch' },
                    renderValue: () => (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <Typography variant="caption" sx={{ fontWeight: 900, color: fontColor || 'text.secondary', display: { xs: 'none', md: 'inline' } }}>
                                Branch
                            </Typography>
                            <Typography variant="body2" title={active?.name} sx={{ fontWeight: 900, maxWidth: { xs: 110, md: 170 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {active?.name || 'Choose branch'}
                            </Typography>
                        </Box>
                    ),
                }}
                sx={{
                    minWidth: 0,
                    '& .MuiInputBase-root, & .MuiSelect-icon': { color: fontColor || 'text.primary' },
                    '& .MuiInputBase-root': { fontWeight: 800, fontSize: 14 },
                }}
            >
                {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                        <Box sx={{ py: 0.3, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={900} noWrap>{branch.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {[branch.location, branch.city].filter(Boolean).join(', ') || 'No address recorded'}
                            </Typography>
                        </Box>
                    </MenuItem>
                ))}
            </TextField>
        </Box>
    );
}
