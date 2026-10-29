import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useSelector } from 'react-redux';
import { DEFAULT_APP_SETTINGS } from '../../features/settings/settingsSlice';
import { selectPrintSettings } from '../../features/branch/branchSlice';

interface DocumentBannerProps {
    /** `inverted` keeps the text white for headers painted on a coloured background. */
    variant?: 'default' | 'inverted';
    align?: 'left' | 'center';
    /** Hide shop name/phone/address when the surrounding document already prints them. */
    showShopDetails?: boolean;
    /** Rendered height cap for the banner image, in pixels. */
    maxHeight?: number;
    sx?: SxProps<Theme>;
}

/**
 * Shared branding header for every customer-facing document (POS receipt, order
 * invoice, transaction invoice, stock slip). Renders the banner uploaded in
 * Settings -> POS & Receipt, falling back to the shop name when none is set.
 */
const DocumentBanner: React.FC<DocumentBannerProps> = ({
    variant = 'default',
    align = 'center',
    showShopDetails = true,
    maxHeight = 96,
    sx,
}) => {
    const app = useSelector(selectPrintSettings);
    const appSettings = app || DEFAULT_APP_SETTINGS;
    const bannerUrl = appSettings.receiptBannerUrl;
    const shopName = appSettings.shopName || DEFAULT_APP_SETTINGS.shopName;

    if (!bannerUrl && !showShopDetails) {
        return null;
    }

    const inverted = variant === 'inverted';

    return (
        <Box
            sx={[
                {
                    textAlign: align,
                    // Keep logos and background colours in the printed output.
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {bannerUrl && (
                <Box
                    component="img"
                    src={bannerUrl}
                    alt={`${shopName} banner`}
                    sx={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight,
                        objectFit: 'contain',
                        mx: align === 'center' ? 'auto' : 0,
                        mb: showShopDetails ? 1.25 : 0,
                    }}
                />
            )}

            {showShopDetails && (
                <>
                    <Typography
                        variant="h5"
                        fontWeight={900}
                        color={inverted ? 'common.white' : 'primary.main'}
                        sx={{ lineHeight: 1.2 }}
                    >
                        {shopName}
                    </Typography>
                    {appSettings.shopPhone && (
                        <Typography
                            variant="body2"
                            sx={{ opacity: inverted ? 0.9 : 1 }}
                            color={inverted ? 'common.white' : 'text.secondary'}
                        >
                            {appSettings.shopPhone}
                        </Typography>
                    )}
                    {appSettings.shopAddress && (
                        <Typography
                            variant="caption"
                            sx={{ display: 'block', opacity: inverted ? 0.82 : 1 }}
                            color={inverted ? 'common.white' : 'text.secondary'}
                        >
                            {appSettings.shopAddress}
                        </Typography>
                    )}
                </>
            )}
        </Box>
    );
};

export default DocumentBanner;
