export const SECTION_PHOTOS = [
    { key: 'main-course', description: 'Web photograph of grilled chicken with rice and vegetables; for main courses and cooked meals' },
    { key: 'appetizers', description: 'Web photograph of avocado toast on a plate; for appetizers, toast and salads' },
    { key: 'drinks', description: 'Web photograph of a glass of lemonade with mint; for non-alcoholic drinks and refreshments' },
    { key: 'desserts', description: 'Web photograph of chocolate layer cake; for cakes, sweets and desserts' },
] as const;
export const SECTION_PHOTO_KEYS = [...SECTION_PHOTOS.map(photo => photo.key), 'none'];
