export const SECTION_PHOTOS = [
    { key: 'main-course', description: 'Grilled chicken, rice and vegetables; for main courses and cooked meals' },
    { key: 'appetizers', description: 'Avocado toast and vegetable starters; for appetizers, toast and salads' },
    { key: 'drinks', description: 'Lemonade, juice and smoothie glasses; for non-alcoholic drinks and refreshments' },
    { key: 'desserts', description: 'Chocolate cake and ice cream; for cakes, sweets and desserts' },
] as const;
export const SECTION_PHOTO_KEYS = [...SECTION_PHOTOS.map(photo => photo.key), 'none'];
