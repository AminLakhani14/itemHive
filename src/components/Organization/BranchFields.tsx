import React from 'react';
import { Alert, Box, Button, TextField } from '@mui/material';
import type { CountryOption } from '../../api/clientLocations';
import SearchableSelect from '../Common/SearchableSelect';
import { useCities } from '../../lib/useLocations';
import { cleanPhone, manualEntryInputProps, phoneError } from '../../lib/contactFormat';

export interface BranchForm { name: string; location: string; phone: string; countryCode: string; city: string }

interface BranchFieldsProps {
    value: BranchForm;
    onChange: (updates: Partial<BranchForm>) => void;
    countries: CountryOption[];
    countriesLoading?: boolean;
    disabled?: boolean;
    showErrors?: boolean;
}

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 };

// Only the branch name is required. A city is chosen from the selected country.
export default function BranchFields({ value, onChange, countries, countriesLoading, disabled, showErrors }: BranchFieldsProps) {
    const country = countries.find((item) => item.code === value.countryCode);
    const cities = useCities(country);
    const [phoneTouched, setPhoneTouched] = React.useState(false);
    const countryOptions = React.useMemo(() => countries.map((item) => ({ value: item.code, label: item.name })), [countries]);
    const cityOptions = React.useMemo(() => {
        const options = cities.cities.map((city) => ({ value: city, label: city }));
        // Keep a saved city selectable if the location service no longer lists it.
        return value.city && !cities.cities.includes(value.city) ? [{ value: value.city, label: value.city }, ...options] : options;
    }, [cities.cities, value.city]);
    const phoneMessage = showErrors || phoneTouched ? phoneError(value.phone) : '';

    return <>
        <Box sx={grid}>
            <TextField label="Branch name" required value={value.name} disabled={disabled} onChange={(event) => onChange({ name: event.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 160 }} />
            <TextField label="Branch phone number" type="tel" value={value.phone} disabled={disabled} onChange={(event) => onChange({ phone: cleanPhone(event.target.value) })} onBlur={() => setPhoneTouched(true)}
                error={Boolean(phoneMessage)} helperText={phoneMessage || 'Optional · 7–15 digits, with an optional leading +.'} inputProps={{ ...manualEntryInputProps, maxLength: 25 }} />
            <TextField label="Branch location / address" value={value.location} disabled={disabled} onChange={(event) => onChange({ location: event.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 500 }} sx={{ gridColumn: '1 / -1' }} />
            <SearchableSelect label="Country" value={value.countryCode} options={countryOptions} disabled={disabled || countriesLoading}
                onChange={(code) => onChange({ countryCode: code, city: '' })} helperText={countriesLoading ? 'Loading countries…' : 'Optional · search by country name.'} />
            <SearchableSelect key={value.countryCode || 'no-country'} label="City" value={value.city} options={cityOptions} disabled={disabled || !country || cities.loading || Boolean(cities.error)}
                onChange={(city) => onChange({ city })} helperText={!country ? 'Select a country first.' : cities.loading ? `Loading cities in ${country.name}…` : `Optional · cities in ${country.name}.`} />
        </Box>
        {cities.error && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={cities.retry}>Retry</Button>}>{cities.error}</Alert>}
    </>;
}
