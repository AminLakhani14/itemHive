import Joi from 'joi';
import { getCountries, getCities } from '../services/clientLocations';

// 7–15 digits (E.164 maximum), an optional leading +, and spaces, dots, dashes or brackets between digits.
export const PHONE_PATTERN = /^\+?(?:[\s().-]*\d){7,15}[\s().-]*$/;
export const phoneSchema = Joi.string().trim().max(25).pattern(PHONE_PATTERN)
    .messages({ 'string.pattern.base': '{#label} must be a valid phone number with 7–15 digits' });

// Only the name is required. A city is checked against its country by resolveBranchPlaces.
export const branchDetailsSchema = Joi.object({
    name: Joi.string().trim().min(1).max(160).required(),
    location: Joi.string().trim().max(500).allow('').default(''),
    phone: phoneSchema.allow('').default(''),
    countryCode: Joi.string().trim().uppercase().pattern(/^[A-Z]{2}$/).allow('').default(''),
    city: Joi.string().trim().max(160).allow('').default(''),
});

export const branchAdminIds = (branch: any): string[] => [...new Set<string>([
    ...(branch.adminUserIds || []).map(String),
    ...(branch.adminUserId ? [String(branch.adminUserId)] : []),
])];

export const serializeBranch = (branch: any) => ({
    id: String(branch._id),
    name: branch.name,
    location: branch.location,
    phone: branch.phone,
    city: branch.city,
    countryCode: branch.countryCode,
    country: branch.country,
    adminUserIds: branchAdminIds(branch),
});

export const findDuplicateName =(names: string[]) => {
    const seen = new Set<string>();
    return names.find((name) => {
        const key = name.trim().toLowerCase();
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
    });
};

export class BranchLocationError extends Error {
    constructor(message: string, readonly status = 400) { super(message); }
}

export interface BranchPlace { countryCode: string; country: string; city: string }
interface PlaceInput { countryCode: string; city: string; current?: BranchPlace }

// Returns the stored country name for each branch and checks that each city belongs to its country.
// An unchanged place is kept as stored, so editing other details does not need the location service.
export const resolveBranchPlaces = async (inputs: PlaceInput[]): Promise<BranchPlace[]> => {
    if (inputs.some((input) => input.city && !input.countryCode)) throw new BranchLocationError('Choose a country for each branch city.');
    const unchanged = (input: PlaceInput) => Boolean(input.current
        && input.current.countryCode === input.countryCode && input.current.city === input.city);
    const toCheck = inputs.filter((input) => input.countryCode && !unchanged(input));
    const citiesByCode = new Map<string, Set<string>>();
    let countries: Awaited<ReturnType<typeof getCountries>> = [];
    if (toCheck.length) {
        try {
            countries = await getCountries();
            for (const code of new Set(toCheck.filter((input) => input.city).map((input) => input.countryCode))) {
                const country = countries.find((item) => item.code === code);
                if (country) citiesByCode.set(code, new Set(await getCities(country)));
            }
        } catch {
            throw new BranchLocationError('Unable to verify the branch location. Please retry.', 503);
        }
    }
    return inputs.map((input) => {
        if (!input.countryCode) return { countryCode: '', country: '', city: '' };
        if (unchanged(input)) return { countryCode: input.current!.countryCode, country: input.current!.country, city: input.current!.city };
        const country = countries.find((item) => item.code === input.countryCode);
        if (!country) throw new BranchLocationError('Choose an available country for each branch.');
        if (input.city && !citiesByCode.get(country.code)?.has(input.city)) throw new BranchLocationError(`Choose a city in ${country.name} for each branch.`);
        return { countryCode: country.code, country: country.name, city: input.city };
    });
};
