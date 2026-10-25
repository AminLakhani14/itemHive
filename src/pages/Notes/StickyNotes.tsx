import React from 'react';
import { Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Check, Maximize2, Minimize2, Pin, Plus, StickyNote as NoteIcon, Trash2 } from 'lucide-react';
import axios from 'axios';
import api from '../../api/axios';

type StickyNote = {
    _id: string; title: string; body: string; color: string; pinned: boolean; updatedAt: string; createdAt: string;
};
type Draft = Pick<StickyNote, 'title' | 'body' | 'color'>;
const COLORS = [
    { label: 'Lemon', value: '#FDE68A' }, { label: 'Mint', value: '#A7F3D0' },
    { label: 'Sky', value: '#BFDBFE' }, { label: 'Peach', value: '#FBCFE8' },
    { label: 'Lavender', value: '#DDD6FE' },
];
const ink = '#292524';
const message = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

function NoteEditor({ note, onPersist, onClose, expanded = true, onMaximize, onPin, onDelete, busy = false }: {
    note: StickyNote | null; onPersist: (note: StickyNote) => void; onClose: () => void;
    expanded?: boolean; onMaximize?: () => void; onPin?: () => Promise<void>;
    onDelete?: () => Promise<void>; busy?: boolean;
}) {
    const [draft, setDraft] = React.useState<Draft>(() => ({ title: note?.title || '', body: note?.body || '', color: note?.color || COLORS[0].value }));
    const [status, setStatus] = React.useState(note ? 'saved' : 'idle');
    const [createdAt, setCreatedAt] = React.useState(note?.createdAt);
    const [error, setError] = React.useState('');
    const [closing, setClosing] = React.useState(false);
    const current = React.useRef(draft);
    const id = React.useRef(note?._id);
    const dirty = React.useRef(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const request = React.useRef<Promise<boolean> | null>(null);
    const cardRef = React.useRef<HTMLElement | null>(null);

    React.useLayoutEffect(() => {
        const card = cardRef.current;
        if (!expanded || !card) return;
        window.scrollTo({ top: 0 });
        const fitToViewport = () => {
            const viewport = window.visualViewport;
            const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
            const main = card.closest('main');
            const padding = main ? parseFloat(getComputedStyle(main).paddingBottom) : 16;
            card.style.setProperty('--note-height', `${Math.max(0, bottom - card.getBoundingClientRect().top - padding - 2)}px`);
        };
        fitToViewport();
        const observer = new ResizeObserver(fitToViewport);
        if (card.parentElement) observer.observe(card.parentElement);
        window.addEventListener('resize', fitToViewport);
        window.visualViewport?.addEventListener('resize', fitToViewport);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', fitToViewport);
            window.visualViewport?.removeEventListener('resize', fitToViewport);
        };
    }, [expanded]);

    // Serialize requests and drain any changes made while a save was in flight.
    const flush = React.useCallback((): Promise<boolean> => {
        clearTimeout(timer.current);
        if (request.current) return request.current;
        const persist = async () => {
            while (dirty.current) {
                const snapshot = current.current;
                if (!id.current && !snapshot.title.trim() && !snapshot.body.trim()) {
                    dirty.current = false;
                    setStatus('idle');
                    return true;
                }
                dirty.current = false;
                setStatus('saving');
                setError('');
                try {
                    const payload = { ...snapshot, title: snapshot.title.trim() || 'Untitled' };
                    const response = id.current
                        ? await api.patch<StickyNote>(`/notes/${id.current}`, payload)
                        : await api.post<StickyNote>('/notes', payload);
                    id.current = response.data._id;
                    setCreatedAt(response.data.createdAt);
                    onPersist(response.data);
                } catch (saveError) {
                    dirty.current = true;
                    setStatus('error');
                    setError(message(saveError, 'Unable to auto-save. Your changes are still here. Please retry.'));
                    return false;
                }
            }
            setStatus(id.current ? 'saved' : 'idle');
            return true;
        };
        request.current = persist().finally(() => { request.current = null; });
        return request.current;
    }, [onPersist]);

    React.useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (dirty.current || request.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            clearTimeout(timer.current);
            void flush();
        };
    }, [flush]);

    const change = (updates: Partial<Draft>) => {
        current.current = { ...current.current, ...updates };
        setDraft(current.current);
        dirty.current = true;
        setStatus('pending');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { void flush(); }, 650);
    };
    const collapse = async () => {
        setClosing(true);
        if (await flush()) onClose();
        setClosing(false);
    };
    const runAction = async (action: () => void | Promise<void>) => {
        setClosing(true);
        try {
            if (await flush()) await action();
        } finally { setClosing(false); }
    };

    return (
        <Card ref={cardRef} component="section" aria-label={expanded ? 'Expanded sticky note' : 'Sticky note'} sx={{ bgcolor: draft.color, color: ink, borderRadius: 1, height: expanded ? 'var(--note-height, 60dvh)' : '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: expanded ? 0 : 240, boxShadow: expanded ? '0 12px 36px rgba(0,0,0,0.16)' : '0 4px 14px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, flexShrink: 0, bgcolor: alpha('#000', 0.05) }}>
                <Stack direction="row" spacing={1} alignItems="center"><NoteIcon size={17} /><Typography variant="body2" fontWeight={700}>{note?.pinned ? 'Pinned note' : note ? 'Sticky note' : 'New note'}</Typography></Stack>
                <Stack direction="row">
                    {onPin && <Tooltip title={note?.pinned ? 'Unpin note' : 'Pin note'}><IconButton size="small" aria-label={note?.pinned ? 'Unpin note' : 'Pin note'} disabled={closing || busy} onClick={() => { void runAction(onPin); }} sx={{ color: ink, bgcolor: note?.pinned ? alpha('#000', 0.1) : 'transparent' }}><Pin size={16} /></IconButton></Tooltip>}
                    {expanded && <Tooltip title="Minimize note"><IconButton size="small" aria-label="Minimize note" onClick={() => { void collapse(); }} disabled={closing || busy} sx={{ color: ink }}><Minimize2 size={18} /></IconButton></Tooltip>}
                </Stack>
            </Stack>
            <Box sx={{ px: expanded ? { xs: 2, md: 3 } : 2.5, py: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <TextField autoFocus={!note} fullWidth variant="standard" placeholder="Title" value={draft.title} disabled={closing || busy} onChange={event => change({ title: event.target.value })}
                    slotProps={{ input: { disableUnderline: true }, htmlInput: { 'aria-label': 'Note title' } }}
                    sx={{ mb: 1, flexShrink: 0, '& input': { color: ink, fontSize: expanded ? { xs: 22, md: 26 } : 20, fontWeight: 700 } }} />
                <Box component="textarea" aria-label="Note content" placeholder="Take a note..." value={draft.body}
                    disabled={closing || busy} onChange={event => change({ body: event.target.value })}
                    sx={{ width: '100%', flex: 1, minHeight: expanded ? 0 : 100, height: expanded ? undefined : 140, resize: 'none', overflowY: 'auto', border: 0, outline: 0, bgcolor: 'transparent', color: ink, fontFamily: 'inherit', fontSize: expanded ? 16 : 14, lineHeight: 1.8, p: 0, '&::placeholder': { color: alpha(ink, 0.6) } }} />
            </Box>
            {error && <Alert severity="error" action={<Button color="inherit" onClick={() => { void flush(); }}>Retry</Button>} sx={{ mx: 2, mb: 2 }}>{error}</Alert>}
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                {expanded && <Stack direction="row" spacing={1} role="group" aria-label="Note color">
                    {COLORS.map(option => <Tooltip title={option.label} key={option.value}>
                        <IconButton aria-label={`${option.label} note`} aria-pressed={draft.color === option.value} disabled={closing} onClick={() => change({ color: option.value })}
                            sx={{ width: 30, height: 30, bgcolor: option.value, color: ink, border: '1px solid rgba(0,0,0,0.25)', '&:hover': { bgcolor: option.value, outline: `2px solid ${ink}` } }}>
                            {draft.color === option.value && <Check size={16} />}
                        </IconButton>
                    </Tooltip>)}
                </Stack>}
                <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    {createdAt && <Typography variant="caption" sx={{ color: alpha(ink, 0.75), overflowWrap: 'anywhere' }}>
                        Created: {new Date(createdAt).toLocaleString()}
                    </Typography>}
                    <Stack direction="row" alignItems="center" spacing={1} role="status" aria-live="polite">
                        {status === 'saving' && <CircularProgress size={12} sx={{ color: ink }} />}
                        {status === 'saved' && <Check size={14} />}
                        <Typography variant="caption" sx={{ color: alpha(ink, 0.75) }}>
                            {status === 'idle' ? 'Start typing · Changes save automatically' : status === 'pending' ? 'Unsaved changes…' : status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved · Please retry' : 'All changes saved'}
                        </Typography>
                    </Stack>
                </Stack>
                <Stack direction="row">
                    {!expanded && onMaximize && <Tooltip title="Maximize note"><IconButton size="small" aria-label="Maximize note" disabled={closing || busy} onClick={onMaximize} sx={{ color: ink }}><Maximize2 size={16} /></IconButton></Tooltip>}
                    {onDelete && <Tooltip title="Delete note"><IconButton size="small" aria-label="Delete note" disabled={closing || busy} onClick={() => { void runAction(onDelete); }} sx={{ color: ink }}><Trash2 size={16} /></IconButton></Tooltip>}
                </Stack>
            </Stack>
        </Card>
    );
}

const StickyNotes: React.FC = () => {
    const [notes, setNotes] = React.useState<StickyNote[]>([]);
    const [editor, setEditor] = React.useState<{ note: StickyNote | null } | null>(null);
    const [activeId, setActiveId] = React.useState<string>();
    const [expandedId, setExpandedId] = React.useState<string>();
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState<string[]>([]);
    const [deleteTarget, setDeleteTarget] = React.useState<StickyNote | null>(null);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        let active = true;
        api.get<StickyNote[]>('/notes').then(response => { if (active) setNotes(response.data || []); })
            .catch(fetchError => { if (active) setError(message(fetchError, 'Unable to load sticky notes.')); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const onPersist = React.useCallback((note: StickyNote) => {
        setNotes(previous => previous.some(item => item._id === note._id)
            ? previous.map(item => item._id === note._id ? note : item) : [note, ...previous]);
    }, []);
    const onNewPersist = React.useCallback((note: StickyNote) => {
        setActiveId(note._id);
        onPersist(note);
    }, [onPersist]);

    const mutateNote = async (note: StickyNote, remove = false) => {
        setBusy(previous => [...previous, note._id]);
        setError('');
        try {
            if (remove) {
                await api.delete(`/notes/${note._id}`);
                setNotes(previous => previous.filter(item => item._id !== note._id));
                setExpandedId(previous => previous === note._id ? undefined : previous);
                setDeleteTarget(null);
            } else {
                const response = await api.patch<StickyNote>(`/notes/${note._id}`, { pinned: !note.pinned });
                setNotes(previous => previous.map(item => item._id === note._id ? response.data : item));
            }
        } catch (mutationError) {
            setError(message(mutationError, remove ? 'Unable to delete note.' : 'Unable to update note.'));
        } finally { setBusy(previous => previous.filter(id => id !== note._id)); }
    };
    const sortedNotes = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
                <Box><Typography variant="h4" fontWeight={800}>Sticky Notes</Typography>
                    <Typography variant="body2" color="text.secondary">A little space for your thoughts. Everything saves automatically.</Typography></Box>
                <Button variant="contained" startIcon={<Plus size={18} />} disabled={loading || Boolean(editor)} onClick={() => { setActiveId(undefined); setEditor({ note: null }); }} sx={{ flexShrink: 0 }}>New note</Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}
            {editor && <NoteEditor note={editor.note} onPersist={onNewPersist} onClose={() => { setEditor(null); setActiveId(undefined); }} />}
            {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box> : (
                <Grid container spacing={3} sx={{ display: editor ? 'none' : 'flex' }}>
                    {sortedNotes.filter(note => !editor || note._id !== activeId).map(note => (
                        <Grid key={note._id} size={expandedId === note._id ? 12 : { xs: 12, sm: 6, lg: 4 }} sx={{ display: expandedId && expandedId !== note._id ? 'none' : undefined }}>
                            <NoteEditor note={note} onPersist={onPersist} expanded={expandedId === note._id}
                                onClose={() => setExpandedId(undefined)} onMaximize={() => setExpandedId(note._id)}
                                onPin={() => mutateNote(note)} onDelete={async () => { setError(''); setDeleteTarget(note); }} busy={busy.includes(note._id)} />
                        </Grid>
                    ))}
                </Grid>
            )}
            {!loading && notes.length === 0 && !editor && <Stack alignItems="center" spacing={1.5} sx={{ py: 10, color: 'text.secondary' }}><NoteIcon size={40} strokeWidth={1.25} /><Typography>No notes yet. Click New note and start typing.</Typography></Stack>}
            <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!busy.includes(deleteTarget?._id || '')) setDeleteTarget(null); }}
                maxWidth="xs" fullWidth aria-labelledby="delete-note-title" aria-describedby="delete-note-description"
                slotProps={{ paper: { sx: { borderRadius: 3, p: 1 } } }}>
                <DialogTitle id="delete-note-title" sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 2, bgcolor: theme => alpha(theme.palette.error.main, 0.12), color: 'error.main' }}><Trash2 size={22} /></Box>
                        <Typography component="span" variant="h6" fontWeight={700}>Delete this note?</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Typography id="delete-note-description" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This note will be permanently deleted. You cannot undo this action.
                    </Typography>
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: deleteTarget?.color || COLORS[0].value, color: ink, borderRadius: 1.5 }}>
                        <Typography fontWeight={700} noWrap>{deleteTarget?.title || 'Untitled'}</Typography>
                        {deleteTarget?.body && <Typography variant="body2" noWrap sx={{ mt: 0.5, opacity: 0.8 }}>{deleteTarget.body}</Typography>}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button autoFocus variant="outlined" color="inherit" disabled={busy.includes(deleteTarget?._id || '')} onClick={() => setDeleteTarget(null)}>No, keep note</Button>
                    <Button variant="contained" color="error" disabled={busy.includes(deleteTarget?._id || '')}
                        startIcon={busy.includes(deleteTarget?._id || '') ? <CircularProgress size={16} color="inherit" /> : <Trash2 size={16} />}
                        onClick={() => { if (deleteTarget) void mutateNote(deleteTarget, true); }}>Yes, delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
export default StickyNotes;
