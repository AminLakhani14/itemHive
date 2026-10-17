export const LOCAL_API_URL = 'http://localhost:5050/api';
export const DEPLOYED_API_URL = 'https://itemhive-8552.onrender.com/api';

export function resolveApiUrl(development: boolean, configuredUrl?: string): string {
    const fallback = development ? LOCAL_API_URL : DEPLOYED_API_URL;
    const configured = configuredUrl?.trim();
    if (!configured) return fallback;
    try {
        const url = new URL(configured);
        const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
            || url.hostname === '[::1]' || url.hostname === '0.0.0.0' || /^127\./.test(url.hostname);
        // A localhost value in hosting environment variables must never send
        // deployed users' requests to their own computers.
        if ((!development && loopback) || !['http:', 'https:'].includes(url.protocol)) return fallback;
        return configured.replace(/\/+$/, '');
    } catch {
        return fallback;
    }
}
