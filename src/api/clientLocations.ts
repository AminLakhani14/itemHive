export interface CountryOption { code: string; name: string }

// Public geographic data does not depend on the Ozor API or its deployment.
// https://github.com/MartinsOnuoha/countriesNowAPI
const BASE_URL = 'https://countriesnow.space/api/v0.1/countries';

async function request(path: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(`${BASE_URL}${path}`, {
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error('The location service is unavailable. Please retry.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('error' in body) || body.error !== false || !('data' in body)) {
        throw new Error('The location service returned invalid data. Please retry.');
    }
    return body.data;
}

export async function loadCountries(signal: AbortSignal): Promise<CountryOption[]> {
    const data = await request('/iso', signal);
    if (!Array.isArray(data)) throw new Error('Invalid country data. Please retry.');
    const countries = data.filter((item) => typeof item?.name === 'string' && /^[A-Z]{2}$/.test(item?.Iso2))
        .map((item): CountryOption => ({ code: item.Iso2, name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (!countries.length) throw new Error('No countries were returned. Please retry.');
    return countries;
}

export async function loadCities(country: CountryOption, signal: AbortSignal): Promise<string[]> {
    const data = await request(`/cities/q?country=${encodeURIComponent(country.name)}`, signal);
    if (!Array.isArray(data) || data.some((city) => typeof city !== 'string')) {
        throw new Error('Invalid city data. Please retry.');
    }
    return [...new Set(data as string[])].filter((city) => city.trim()).sort((a, b) => a.localeCompare(b));
}
