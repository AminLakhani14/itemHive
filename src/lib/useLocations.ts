import React from 'react';
import { loadCities, loadCountries, type CountryOption } from '../api/clientLocations';

// Several branch forms share one country list and one city list per country.
let countriesRequest: Promise<CountryOption[]> | null = null;
const citiesRequests = new Map<string, Promise<string[]>>();
const never = new AbortController().signal;

export function useCountries() {
    const [countries, setCountries] = React.useState<CountryOption[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [retry, setRetry] = React.useState(0);
    React.useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        countriesRequest ||= loadCountries(never);
        countriesRequest
            .then((data) => { if (active) setCountries(data); })
            .catch(() => { countriesRequest = null; if (active) setError('Countries could not be loaded.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [retry]);
    return { countries, loading, error, retry: () => setRetry((value) => value + 1) };
}

export function useCities(country: CountryOption | undefined) {
    const [cities, setCities] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [retry, setRetry] = React.useState(0);
    React.useEffect(() => {
        setCities([]); setError('');
        if (!country) { setLoading(false); return; }
        let active = true;
        setLoading(true);
        if (!citiesRequests.has(country.code)) citiesRequests.set(country.code, loadCities(country, never));
        citiesRequests.get(country.code)!
            .then((data) => { if (active) setCities(data); })
            .catch(() => { citiesRequests.delete(country.code); if (active) setError(`Cities could not be loaded for ${country.name}.`); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [country, retry]);
    return { cities, loading, error, retry: () => setRetry((value) => value + 1) };
}
