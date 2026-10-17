// Keep in sync with backend/src/utils/branches.ts and createClientSchema in backend/src/controllers/clientController.ts.
// Phone: 7–15 digits (E.164 maximum), an optional leading +, and spaces, dots, dashes or brackets between digits.
const PHONE_PATTERN = /^\+?(?:[\s().-]*\d){7,15}[\s().-]*$/;
const CNIC_PATTERN = /^(?:\d{13}|\d{5}-\d{7}-\d)$/;

export const phoneError = (value: string) => value.trim() && !PHONE_PATTERN.test(value.trim()) ? 'Enter a valid phone number with 7–15 digits, e.g. +92 300 1234567.' : '';
export const cnicError = (value: string) => value.trim() && !CNIC_PATTERN.test(value.trim()) ? 'Enter 13 digits, e.g. 12345-1234567-1 or 1234512345671.' : '';
export const cleanPhone = (value: string) => value.replace(/[^\d\s().+-]/g, '').replace(/(?!^)\+/g, '');
export const cleanCnic = (value: string) => value.replace(/[^\d-]/g, '');

// Chrome can ignore autocomplete="off" for contact and address inputs.
// Apply the suppression hints to each native contact input.
export const manualEntryInputProps = {
    autoComplete: 'new-password',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
};
