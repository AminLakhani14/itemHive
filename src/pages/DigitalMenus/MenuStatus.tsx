import { Box, Chip } from '@mui/material';

export default function MenuStatus({ published }: { published: boolean }) {
    return <Chip size="small" color={published ? 'success' : 'default'} variant="outlined" label={published ? 'Published' : 'Draft'} icon={<Box component="span" aria-label={published ? 'Active menu' : 'Draft menu'} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: published ? '#22c55e' : 'text.disabled', boxShadow: published ? '0 0 6px #22c55e66' : 'none' }} />} />;
}
