import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { menuDecoration, type MenuDesign } from './menuTemplates';

// Screen menus use the available space. Physical dimensions belong to printing.
export default function MenuSheet({ design, children }: { design: MenuDesign; children: ReactNode }) {
    return <Box data-menu-sheet sx={{ width: '100%', minWidth: 0, minHeight: 400, boxSizing: 'border-box', p: { xs: 3.5, sm: 4 }, borderRadius: 2, bgcolor: design.backgroundColor, color: design.textColor, ...menuDecoration(design) }}>
        <Box data-menu-sheet-content>{children}</Box>
    </Box>;
}
