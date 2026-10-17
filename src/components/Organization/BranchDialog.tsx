import React from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import BranchFields, { type BranchForm } from './BranchFields';
import { useCountries } from '../../lib/useLocations';
import { phoneError } from '../../lib/contactFormat';

interface BranchDialogProps {
    title: string;
    submitLabel: string;
    initial: BranchForm;
    saving: boolean;
    error: string;
    onClose: () => void;
    onSave: (form: BranchForm) => void;
}

// Mount only while open, so each opening starts from `initial`.
export default function BranchDialog({ title, submitLabel, initial, saving, error, onClose, onSave }: BranchDialogProps) {
    const countries = useCountries();
    const [form, setForm] = React.useState(initial);
    const [submitted, setSubmitted] = React.useState(false);
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitted(true);
        if (!phoneError(form.phone)) onSave(form);
    };
    return <Dialog open onClose={() => !saving && onClose()} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={submit} autoComplete="off">
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {countries.error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={countries.retry}>Retry</Button>}>{countries.error}</Alert>}
                <Box sx={{ pt: 1 }}>
                    <BranchFields value={form} onChange={(updates) => setForm((current) => ({ ...current, ...updates }))} countries={countries.countries}
                        countriesLoading={countries.loading} disabled={saving} showErrors={submitted} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>{saving ? 'Saving…' : submitLabel}</Button>
            </DialogActions>
        </Box>
    </Dialog>;
}
