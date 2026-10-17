import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { menuBlockStyle, menuGridStyle, menuItemStyle, menuPriceStyle, menuTextStyle, modernMenu } from './menuAppearance';
import { menuFont, type MenuDesign } from './menuTemplates';
import { sectionProducts, unsectionedProducts, type MenuBlock, type MenuProduct } from './menuContent';
import PictureMenuPage from './PictureMenuPage';
import { sectionImageUrl } from './sectionImages';

export function MenuSectionImage({ block }: { block: MenuBlock }) {
    return block.sectionImage ? <Box component="img" data-section-image={block.id} src={sectionImageUrl(block.sectionImage.url)} referrerPolicy="no-referrer" alt={block.sectionImage.alt} sx={{ display: 'block', width: '100%', height: { xs: 180, sm: block.span === 6 ? 260 : 210 }, objectFit: 'cover', borderRadius: '18px', mb: 2.5, '@media print': { height: block.span === 6 ? 190 : 150 } }} /> : null;
}

export function MenuBlockText({ block, design }: { block: MenuBlock; design: MenuDesign }) {
    // An uploaded menu page is shown exactly as it is.
    if (block.type === 'image') return <Box component="img" src={block.imageUrl} alt={block.text} sx={{ display: 'block', width: '100%', height: 'auto', borderRadius: 1 }} />;
    return <Typography component={block.type === 'title' ? 'h1' : block.type === 'label' ? 'p' : 'h2'} sx={{ ...menuTextStyle(block, design), fontFamily: block.headingStyle ? 'Arial, sans-serif' : block.type === 'label' ? 'inherit' : menuFont(design) }}>{block.text}</Typography>;
}

// Item photos and descriptions follow the menu design in the builder, customer menu and print.
export function MenuItemDetails({ product, design }: { product: MenuProduct; design: MenuDesign }) {
    const description = design.showDescriptions ? product.description?.trim() : '';
    return <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
        {design.showImages && product.imageUrl && <Box component="img" src={product.imageUrl} alt="" loading="lazy" sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1.5, flexShrink: 0 }} />}
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: modernMenu(design) ? 15 : 14, fontWeight: modernMenu(design) ? 500 : 400, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{product.name}</Typography>
            {description && <Typography sx={{ fontSize: 12, lineHeight: 1.4, opacity: .75, overflowWrap: 'anywhere' }}>{description}</Typography>}
        </Box>
    </Stack>;
}

export function MenuProductCard({ product, design, priceControl }: { product: MenuProduct; design: MenuDesign; priceControl?: ReactNode }) {
    return <Stack direction="row" spacing={1} alignItems="center" sx={menuItemStyle(design)}>
        <MenuItemDetails product={product} design={design} />
        {priceControl || <Typography sx={menuPriceStyle(design)}>Rs. {product.salePrice ?? product.price ?? 0}</Typography>}
    </Stack>;
}

export function MenuProductItems({ products, design, renderProduct }: { products: MenuProduct[]; design: MenuDesign; renderProduct?: (product: MenuProduct) => ReactNode }) {
    return <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>{products.map(product => <Box key={product.id} sx={{ minWidth: 0 }}>{renderProduct ? renderProduct(product) : <MenuProductCard product={product} design={design} />}</Box>)}</Box>;
}

export function MenuPageContent({ content, products, design, page, print = false, renderProduct }: { content: MenuBlock[]; products: MenuProduct[]; design: MenuDesign; page: number; print?: boolean; renderProduct?: (product: MenuProduct) => ReactNode }) {
    const remaining = unsectionedProducts(content, products);
    const pictureSections = content.filter(block => (block.page ?? 1) === page && block.source);
    return <>
        <Box sx={menuGridStyle(design)}>
            {content.filter(block => (block.page ?? 1) === page && !block.source && !(pictureSections.length && block.type === 'title')).map(block => <Box key={block.id} component={block.type === 'section' ? 'section' : 'div'} sx={{ ...menuBlockStyle(block, design), minWidth: 0, gridColumn: print ? `span ${block.span ?? 6}` : { xs: 'span 6', sm: `span ${block.span ?? 6}` } }}>
                {block.type === 'section' && <MenuSectionImage block={block} />}
                {block.type === 'image' && pictureSections.some(section => section.source?.imageId === block.id) ? <PictureMenuPage image={block} sections={pictureSections.filter(section => section.source?.imageId === block.id)} products={products} design={design} renderProduct={renderProduct} /> : <MenuBlockText block={block} design={design} />}
                {block.type === 'section' && <Box sx={{ mt: modernMenu(design) ? 2 : 1 }}><MenuProductItems products={sectionProducts(block, products)} design={design} renderProduct={renderProduct} /></Box>}
            </Box>)}
        </Box>
        {page === 1 && remaining.length > 0 && <Box component="section" sx={{ mt: 3 }}><Typography component="h2" fontWeight={800} sx={{ mb: 1.5, color: design.accentColor, fontFamily: menuFont(design) }}>Menu items</Typography><MenuProductItems products={remaining} design={design} renderProduct={renderProduct} /></Box>}
    </>;
}
