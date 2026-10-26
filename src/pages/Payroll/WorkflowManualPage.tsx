import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { ChevronDown } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { workflowGroups } from '../../lib/workflowScreens';
import { Link } from 'react-router-dom';
import manual from '../../../docs/PAYROLL_FINANCE_USER_MANUAL.md?raw';
import manualUrl from '../../../docs/PAYROLL_FINANCE_USER_MANUAL.md?url';
import printableUrl from '../../../docs/PAYROLL_FINANCE_USER_MANUAL.html?url';

const sections = manual.replace(/^\uFEFF/, '').trim().split(/\r?\n(?=## )/).map((text, index) => ({
  text, index, title: text.split(/\r?\n/)[0].replace(/^#{1,2} /, ''),
}));

// Render the guide's controlled Markdown subset as accessible headings and lists.
// Text stays escaped by React; the document does not inject arbitrary HTML.
function Paragraph({ text }: { text: string }) {
  const heading = /^(#{1,3}) (.+)$/.exec(text);
  if (heading) {
    const level = heading[1].length;
    return <Typography component={level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'} variant={level === 1 ? 'h4' : level === 2 ? 'h5' : 'h6'} fontWeight={800}>{heading[2]}</Typography>;
  }
  const lines = text.split(/\r?\n/);
  if (lines.every(line => /^\d+\. /.test(line))) return <Box component="ol" start={Number.parseInt(lines[0])} sx={{ pl: 3, my: 0 }}>{lines.map((line, i) => <Typography component="li" key={i} sx={{ mb: 1, pl: 0.5 }}>{line.replace(/^\d+\. /, '')}</Typography>)}</Box>;
  if (lines.every(line => /^- /.test(line))) return <Box component="ul" sx={{ pl: 3, my: 0 }}>{lines.map((line, i) => <Typography component="li" key={i} sx={{ mb: 1, pl: 0.5 }}>{line.slice(2)}</Typography>)}</Box>;
  return <Typography>{text.replace(/\r?\n/g, ' ')}</Typography>;
}

export default function WorkflowManualPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [search, setSearch] = React.useState('');
  const visible = sections.filter(s => s.text.toLowerCase().includes(search.trim().toLowerCase()));
  const topics = <Stack>{visible.map(s => <Button key={s.index} component="a" href={'#manual-topic-' + s.index} sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}>{s.title}</Button>)}</Stack>;
  return <Stack gap={2}>
    <Stack direction="row" gap={1} flexWrap="wrap">
      {workflowGroups.filter(g => g.screens.some(s => s.permissions.some(p => hasScreenAccess(user, p)))).map(g => <Button key={g.id} component={Link} to={g.path}>{g.title}</Button>)}
      <Button component="a" href={manualUrl} download="ItemHive-Payroll-Expenses-Finance-My-Payroll-Manual.md">Download manual</Button>
      <Button variant="outlined" component="a" href={printableUrl} target="_blank" rel="noreferrer">Print / Save PDF</Button>
    </Stack>
    <TextField label="Search the manual" placeholder="Enrollment, expense approval, payslips, opening balances..." value={search} onChange={e => setSearch(e.target.value)} />
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 3 }}>
        <Accordion disableGutters variant="outlined" sx={{ display: { md: 'none' } }}>
          <AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={800}>Topics ({visible.length})</Typography></AccordionSummary>
          <AccordionDetails>{topics}</AccordionDetails>
        </Accordion>
        <Paper variant="outlined" sx={{ display: { xs: 'none', md: 'block' }, p: 2, position: 'sticky', top: 88, maxHeight: 'calc(100vh - 112px)', overflowY: 'auto' }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>Topics</Typography>{topics}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, md: 9 }}>
        <Stack gap={2}>
          {!visible.length && <Alert severity="info">No matching topic. Try a shorter search.</Alert>}
          {visible.map(section => <Paper key={section.index} id={'manual-topic-' + section.index} variant="outlined" sx={{ p: { xs: 2, md: 3 }, scrollMarginTop: 88, overflowWrap: 'anywhere' }}>
            <Stack gap={2}>{section.text.split(/\r?\n\s*\r?\n/).map((paragraph, i) => <Paragraph key={i} text={paragraph} />)}</Stack>
          </Paper>)}
        </Stack>
      </Grid>
    </Grid>
  </Stack>;
}
