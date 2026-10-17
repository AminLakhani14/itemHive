export type SectionImage = { url: string; alt: string };
export const SECTION_PHOTOS = [
    { key: 'main-course', name: 'Main course', alt: 'Grilled chicken with rice and vegetables', url: 'https://images.pexels.com/photos/36982101/pexels-photo-36982101/free-photo-of-plate-of-rice-with-grilled-chicken-and-vegetables.jpeg?auto=compress&dpr=1&h=750&w=1260', source: 'https://www.pexels.com/photo/plate-of-rice-with-grilled-chicken-and-vegetables-36982101/', author: 'rakhmat suwandi' },
    { key: 'appetizers', name: 'Appetizers', alt: 'Avocado toast on a plate', url: 'https://images.pexels.com/photos/4451863/pexels-photo-4451863.jpeg?auto=compress&dpr=1&h=750&w=1260', source: 'https://www.pexels.com/photo/an-avocado-toast-on-a-plate-4451863/', author: 'alleksana' },
    { key: 'drinks', name: 'Drinks', alt: 'Lemonade with mint', url: 'https://images.pexels.com/photos/18509675/pexels-photo-18509675/free-photo-of-glass-of-lemonade.jpeg?auto=compress&dpr=1&h=750&w=1260', source: 'https://www.pexels.com/photo/glass-of-lemonade-18509675/', author: 'Tim Durand' },
    { key: 'desserts', name: 'Desserts', alt: 'Chocolate layer cake', url: 'https://images.pexels.com/photos/1028711/pexels-photo-1028711.jpeg?auto=compress&dpr=1&h=750&w=1260', source: 'https://www.pexels.com/photo/chocolate-cake-slice-1028711/', author: 'Acharaporn Kamornboonyarush' },
] as const;
export const sectionPhoto = (key?: string): SectionImage | undefined => {
    const photo = SECTION_PHOTOS.find(item => item.key === key);
    return photo ? { url: photo.url, alt: photo.alt } : undefined;
};
export function isSectionImageLink(input: string): boolean {
    if (!input.startsWith('https://') || input.length > 2048) return false;
    try { const url = new URL(input); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
}
// Drafts made with the previous library now show the corresponding web photo.
export const sectionImageUrl = (url: string) => sectionPhoto(/^\/menu-images\/([^/]+)\.webp$/.exec(url)?.[1])?.url ?? url;
export const MAX_SECTION_IMAGE_LENGTH = 200_000;
export const MAX_MENU_IMAGE_LENGTH = 2_400_000;
// Reduce uploads once so the saved draft, public menu and print use the same photo.
export async function readSectionImage(file: File): Promise<SectionImage> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [.82, .7, .55, .4]) {
            const url = canvas.toDataURL('image/webp', quality);
            if (url.length <= MAX_SECTION_IMAGE_LENGTH) return { url, alt: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Section photo' };
        }
        throw new Error('This photo is too detailed. Choose a smaller image.');
    } finally { bitmap.close(); }
}
