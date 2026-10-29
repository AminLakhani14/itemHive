import { createTheme, type PaletteMode, alpha, lighten, darken, emphasize, getContrastRatio } from '@mui/material';

import type { Appearance } from '../features/auth/authSlice';

export const getAppTheme = (requestedMode: PaletteMode, appearance?: Partial<Appearance>) => {
const primary = appearance?.themeColor || '#0ea5a5';
const fontColor = appearance?.fontColor;
const backgroundColor = appearance?.backgroundColor;
// Custom backgrounds determine surface contrast, even if the saved toggle is light.
// MUI also uses this mode for labels, disabled controls, and selected states.
const mode: PaletteMode = backgroundColor
    ? (getContrastRatio(backgroundColor, '#ffffff') >= getContrastRatio(backgroundColor, '#000000') ? 'dark' : 'light')
    : requestedMode;
const borderColor = appearance?.borderColor;
const divider = borderColor || (mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.14)');
return createTheme({
    palette: {
        mode,
        primary: {
            main: primary,
            light: lighten(primary, 0.25),
            dark: darken(primary, 0.25),
            contrastText: getContrastRatio(primary, '#ffffff') >= 4.5 ? '#ffffff' : '#0b1220',
        },
        secondary: {
            main: appearance?.secondaryColor || '#f59e0b',
            light: appearance?.secondaryColor ? lighten(appearance.secondaryColor, 0.25) : '#fbbf24',
            dark: appearance?.secondaryColor ? darken(appearance.secondaryColor, 0.25) : '#d97706',
            contrastText: '#0b1220',
        },
        success: {
            main: appearance?.successColor || '#16a34a',
            light: appearance?.successColor ? lighten(appearance.successColor, 0.25) : '#4ade80',
            dark: appearance?.successColor ? darken(appearance.successColor, 0.25) : '#15803d',
        },
        warning: {
            main: appearance?.warningColor || '#f59e0b',
            light: appearance?.warningColor ? lighten(appearance.warningColor, 0.25) : '#fbbf24',
            dark: appearance?.warningColor ? darken(appearance.warningColor, 0.25) : '#d97706',
        },
        error: {
            main: appearance?.errorColor || '#dc2626',
            light: appearance?.errorColor ? lighten(appearance.errorColor, 0.25) : '#f87171',
            dark: appearance?.errorColor ? darken(appearance.errorColor, 0.25) : '#b91c1c',
        },
        background: {
            default: backgroundColor || (mode === 'light' ? '#f5f7fb' : '#0a0f1c'),
            paper: backgroundColor || (mode === 'light' ? '#ffffff' : '#111827'),
        },
        text: {
            primary: fontColor || (mode === 'light' ? '#0f172a' : '#f1f5f9'),
            secondary: appearance?.secondaryTextColor || (fontColor ? alpha(fontColor, 0.75) : (mode === 'light' ? '#5b6475' : '#cbd5f5')),
        },
        divider,
        action: {
            hover: mode === 'light' ? 'rgba(15, 23, 42, 0.04)' : 'rgba(148, 163, 184, 0.16)',
            selected: alpha(primary, mode === 'light' ? 0.12 : 0.18),
        },
    },
    typography: {
        fontFamily: '"Manrope", "Segoe UI", "Helvetica", "Arial", sans-serif',
        h1: { color: appearance?.headingColor || undefined, fontWeight: 800, fontSize: '2.6rem', letterSpacing: '-0.02em', fontFamily: '"Sora", "Manrope", sans-serif' },
        h2: { color: appearance?.headingColor || undefined, fontWeight: 800, fontSize: '2.2rem', letterSpacing: '-0.02em', fontFamily: '"Sora", "Manrope", sans-serif' },
        h3: { color: appearance?.headingColor || undefined, fontWeight: 700, fontSize: '1.85rem', letterSpacing: '-0.01em', fontFamily: '"Sora", "Manrope", sans-serif' },
        h4: { color: appearance?.headingColor || undefined, fontWeight: 700, fontSize: '1.55rem', letterSpacing: '-0.01em', fontFamily: '"Sora", "Manrope", sans-serif' },
        h5: { color: appearance?.headingColor || undefined, fontWeight: 700, fontSize: '1.25rem', fontFamily: '"Sora", "Manrope", sans-serif' },
        h6: { color: appearance?.headingColor || undefined, fontWeight: 700, fontSize: '1.05rem', fontFamily: '"Sora", "Manrope", sans-serif' },
        button: { textTransform: 'none', fontWeight: 700 },
    },
    shape: {
        borderRadius: 6,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                // The global scrollbar in index.css reads these variables, so it follows the active theme.
                ':root': {
                    '--scrollbar-track': backgroundColor ? emphasize(backgroundColor, 0.06) : (mode === 'light' ? '#e2e8f0' : '#1e293b'),
                    '--scrollbar-thumb': primary,
                    '--scrollbar-thumb-hover': darken(primary, 0.25),
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    borderRadius: 6,
                    '&:hover': {
                        boxShadow: '0 8px 16px -10px rgba(15, 23, 42, 0.4)',
                    },
                },
                contained: { padding: '10px 22px' },
                outlined: {
                    minHeight: 44,
                    padding: '10px 22px',
                    borderRadius: 14,
                    borderWidth: 1.5,
                },
                outlinedPrimary: {
                    color: primary,
                    borderColor: borderColor || alpha(primary, 0.5),
                    backgroundColor: mode === 'light' ? alpha(primary, 0.025) : alpha(primary, 0.08),
                    '&:hover': {
                        borderColor: primary,
                        backgroundColor: mode === 'light' ? alpha(primary, 0.09) : alpha(primary, 0.16),
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    boxShadow: mode === 'light'
                        ? '0 12px 30px -20px rgba(15, 23, 42, 0.35)'
                        : '0 16px 32px -24px rgba(0, 0, 0, 0.7)',
                    border: `1px solid ${borderColor || (mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.28)')}`,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: 8,
                    boxShadow: mode === 'light'
                        ? '0 8px 24px -12px rgba(15, 23, 42, 0.12)'
                        : '0 12px 24px -16px rgba(0, 0, 0, 0.5)',
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                notchedOutline: borderColor ? { borderColor } : {},
                root: {
                    borderRadius: 6,
                    backgroundColor: backgroundColor ? emphasize(backgroundColor, 0.05) : (mode === 'light' ? '#f8fafc' : alpha('#1e293b', 0.4)),
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                size: 'small',
            },
        },
        MuiInputBase: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                },
            },
        },
        MuiAutocomplete: {
            styleOverrides: {
                paper: {
                    borderRadius: 6,
                },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    overflowX: 'auto',
                    maxWidth: '100%',
                    WebkitOverflowScrolling: 'touch',
                },
            },
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    backgroundColor: alpha(primary, mode === 'light' ? 0.06 : 0.12),
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    fontWeight: 700,
                    borderRadius: 6,
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: `1px solid ${borderColor || (mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.2)')}`,
                    '@media (max-width:600px)': {
                        padding: '10px 12px',
                        fontSize: '0.78rem',
                    },
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: mode === 'light' ? '#0f172a' : '#111827',
                    color: mode === 'light' ? '#f8fafc' : '#e2e8f0',
                    border: mode === 'light' ? '1px solid rgba(15, 23, 42, 0.2)' : '1px solid rgba(148, 163, 184, 0.3)',
                },
            },
        },
        MuiDialog: {
            defaultProps: {
                transitionDuration: { enter: 220, exit: 170 },
            },
            styleOverrides: {
                paper: {
                    transition: 'transform 220ms ease, opacity 180ms ease',
                },
            },
        },
        MuiPopover: {
            defaultProps: {
                transitionDuration: { enter: 180, exit: 140 },
            },
        },
    },
});
};

export default getAppTheme;

