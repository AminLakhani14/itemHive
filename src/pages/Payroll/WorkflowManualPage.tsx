import React from 'react';
import { Alert, Button, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import manual from '../../../docs/PAYROLL_FINANCE_USER_MANUAL.md?raw';
const sections = manual.split(/\r?\n(?=## )/).map((text, index) => ({ text, index, title: text.split(/\r?\n/)[0].replace(/^#{1,2} /, '') }));
export default function WorkflowManualPage() {
  const [search, setSearch] = React.useState('');
  const visible = sections.filter(s => s.text.toLowerCase().includes(search.trim().toLowerCase()));
  const download = () => { const url = URL.createObjectURL(new Blob([manual], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'ItemHive-Payroll-Finance-User-Manual.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <Stack gap={2}><Stack direction="row" gap={1} flexWrap="wrap"><Button component={Link} to="/payroll">Payroll</Button><Button component={Link} to="/finance">Finance</Button><Button component={Link} to="/my">My Workspace</Button><Button onClick={download}>Download manual</Button></Stack><TextField label="Search the manual" placeholder="Enrollment, expense approval, permissions…" value={search} onChange={e => setSearch(e.target.value)} />
    <Grid container spacing={2}><Grid size={{ xs: 12, md: 3 }}><Paper variant="outlined" sx={{ p: 2, position: { md: 'sticky' }, top: 88 }}><Typography fontWeight={800} sx={{ mb: 1 }}>Topics</Typography><Stack>{visible.map(s => <Button key={s.index} component="a" href={'#manual-topic-' + s.index} sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}>{s.title}</Button>)}</Stack></Paper></Grid><Grid size={{ xs: 12, md: 9 }}><Stack gap={2}>{!visible.length && <Alert severity="info">No matching topic. Try a shorter search.</Alert>}{visible.map(section => <Paper key={section.index} id={'manual-topic-' + section.index} variant="outlined" sx={{ p: { xs: 2, md: 3 }, scrollMarginTop: 88 }}><Stack gap={2}>{section.text.split(/\r?\n\s*\r?\n/).map((paragraph, i) => <Typography key={i} variant={paragraph.startsWith('# ') ? 'h4' : paragraph.startsWith('## ') ? 'h6' : 'body1'} fontWeight={paragraph.startsWith('#') ? 800 : 400} sx={{ whiteSpace: 'pre-line' }}>{paragraph.replace(/^#{1,2} /, '')}</Typography>)}</Stack></Paper>)}</Stack></Grid></Grid>
  </Stack>;
}
