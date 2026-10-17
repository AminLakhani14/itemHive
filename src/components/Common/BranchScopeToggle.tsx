import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Layers, Store } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { selectActiveBranch } from '../../features/branch/branchSlice';

export type BranchViewScope = 'branch' | 'all';

// Logins with several branches can read Dashboard and Reports for every branch at once.
// New entries are always made in one branch, so the combined view is read-only.
export default function BranchScopeToggle({ value, onChange }: { value: BranchViewScope; onChange: (value: BranchViewScope) => void }) {
    const canViewAll = useSelector((state: RootState) => state.branch.canViewAll);
    const activeBranch = useSelector(selectActiveBranch);
    if (!canViewAll) return null;
    return (
        <ToggleButtonGroup size="small" exclusive value={value} onChange={(_event, next: BranchViewScope | null) => next && onChange(next)} aria-label="Branches shown">
            <ToggleButton value="branch" sx={{ gap: 0.75, px: 1.5, fontWeight: 800, textTransform: 'none', whiteSpace: 'nowrap' }}>
                <Store size={15} />{activeBranch?.name || 'This branch'}
            </ToggleButton>
            <ToggleButton value="all" sx={{ gap: 0.75, px: 1.5, fontWeight: 800, textTransform: 'none', whiteSpace: 'nowrap' }}>
                <Layers size={15} />All branches
            </ToggleButton>
        </ToggleButtonGroup>
    );
}
