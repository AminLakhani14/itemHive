// CountriesNow is open source: https://github.com/MartinsOnuoha/countriesNowAPI
const BASE = 'https://countriesnow.space/api/v0.1/countries';
const TTL = 24 * 60 * 60 * 1000;
export interface CountryOption { code: string; name: string }
const cache = new Map<string, { expires: number; data: unknown }>();

async function request<T>(path: string, parse: (data: unknown) => T): Promise<T> {
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.data as T;
    const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Location service is unavailable. Please retry.');
    const body = await response.json() as { error: boolean; data: unknown };
    if (body.error) throw new Error('Location service could not find the requested location.');
    const data = parse(body.data);
    if (cache.size >= 260) cache.clear();
    cache.set(path, { expires: Date.now() + TTL, data });
    return data;
}

export const getCountries = () => request('/iso', (data) => {
    if (!Array.isArray(data)) throw new Error('Invalid country data. Please retry.');
    return data.filter((item) => typeof item?.name === 'string' && /^[A-Z]{2}$/.test(item?.Iso2))
        .map((item): CountryOption => ({ code: item.Iso2, name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
});

export const getCities = (country: CountryOption) => request(`/cities/q?country=${encodeURIComponent(country.name)}`, (data) => {
    if (!Array.isArray(data) || data.some((city) => typeof city !== 'string')) throw new Error('Invalid city data. Please retry.');
    return [...new Set(data as string[])].sort((a, b) => a.localeCompare(b));
});
