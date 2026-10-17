import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { ImportSection } from './oldMenuImport';
import type { PictureBox } from './menuContent';

export default function PictureSectionMapper({ picture, sections, onChange }: { picture: string; sections: ImportSection[]; onChange: (id: string, box: PictureBox) => void }) {
    const [selected, setSelected] = useState('');
    const [start, setStart] = useState<[number, number] | null>(null);
    const [end, setEnd] = useState<[number, number] | null>(null);
    const point = (event: React.PointerEvent<HTMLDivElement>): [number, number] => {
        const rect = event.currentTarget.getBoundingClientRect();
        return [Math.round(Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000))), Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)))];
    };
    const box = start && end ? [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])] as PictureBox : null;
    const region = (id: string, area: PictureBox, name: string) => <Box key={id} sx={{ pointerEvents: 'none', position: 'absolute', top: `${area[0] / 10}%`, left: `${area[1] / 10}%`, width: `${(area[3] - area[1]) / 10}%`, height: `${(area[2] - area[0]) / 10}%`, border: '2px solid', borderColor: selected === id ? '#ffb800' : '#08bdc0', bgcolor: '#08bdc012' }}><Typography sx={{ position: 'absolute', top: -20, bgcolor: '#ffffff', color: '#111', fontSize: 11, px: .5 }}>{name}</Typography></Box>;
    return <Stack spacing={1}>
        <Typography fontWeight={700}>Sections on your original picture</Typography>
        <Typography variant="body2" color="text.secondary">Check the marked item areas. To adjust one, select its section, then drag around its item names and prices on the picture. Leave the heading and photos outside the box.</Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>{sections.filter(section => section.selected).map(section => <Button key={section.id} size="small" color={section.itemsBox ? 'primary' : 'warning'} variant={selected === section.id ? 'contained' : 'outlined'} onClick={() => setSelected(section.id)}>{section.name}{!section.itemsBox ? ' · Mark items' : ''}</Button>)}</Stack>
        <Box aria-label="Mark section items on picture" sx={{ position: 'relative', maxWidth: 490, mx: 'auto !important', width: '100%', touchAction: selected ? 'none' : 'auto', cursor: selected ? 'crosshair' : 'default' }} onPointerDown={event => { if (selected) { event.currentTarget.setPointerCapture(event.pointerId); setStart(point(event)); setEnd(point(event)); } }} onPointerMove={event => { if (start) setEnd(point(event)); }} onPointerUp={event => { if (selected && start) { const last = point(event); const area: PictureBox = [Math.min(start[0], last[0]), Math.min(start[1], last[1]), Math.max(start[0], last[0]), Math.max(start[1], last[1])]; if (area[2] - area[0] >= 10 && area[3] - area[1] >= 10) onChange(selected, area); setStart(null); setEnd(null); } }} onPointerCancel={() => { setStart(null); setEnd(null); }}>
            <Box component="img" src={picture} alt="Your original menu with editable section areas" draggable={false} sx={{ width: '100%', display: 'block', userSelect: 'none' }} />
            {sections.filter(section => section.selected && section.itemsBox).map(section => region(section.id, section.itemsBox!, section.name))}
            {box && region('drawing', box, 'Item area')}
        </Box>
    </Stack>;
}
