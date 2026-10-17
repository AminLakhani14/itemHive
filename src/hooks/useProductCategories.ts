import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { PRODUCT_CATEGORIES } from '../features/inventory/inventorySlice';

const categoryCache = new Map<string, string[]>();
const categoryRequests = new Map<string, Promise<string[]>>();
// Categories belong to a branch, so the cache is kept per workspace and branch.
const workspaceKey = () => `${localStorage.getItem('itemhive-workspace-id') || 'default-workspace'}:${localStorage.getItem('itemhive-branch-id') || ''}`;

export default function useProductCategories() {
    const [categories, setCategories] = useState<string[]>(PRODUCT_CATEGORIES);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const generation = useRef(0);
    const reload = useCallback(async (force = false) => {
        const request = ++generation.current;
        setLoading(true); setError('');
        try {
            const key = workspaceKey();
            const cached = categoryCache.get(key);
            const load = force || !cached
                ? (categoryRequests.get(key) || api.get<string[]>('/categories').then(({ data }) => {
                    const unique = new Map<string, string>();
                    data.forEach(name => unique.set(name.toLowerCase(), name));
                    const normalized = [...unique.values()].sort((a, b) => a.localeCompare(b));
                    categoryCache.set(key, normalized);
                    return normalized;
                }).finally(() => categoryRequests.delete(key)))
                : Promise.resolve(cached!);
            if (force || !cached) categoryRequests.set(key, load);
            const categories = await load;
            if (request !== generation.current) return;
            setCategories(categories);
        } catch {
            if (request === generation.current) setError('Unable to load saved categories. Please retry.');
        } finally { if (request === generation.current) setLoading(false); }
    }, []);
    useEffect(() => {
        const refresh = () => { setCategories(PRODUCT_CATEGORIES); void reload(true); };
        void reload();
        window.addEventListener('itemhive-workspace-changed', refresh);
        return () => { ++generation.current; window.removeEventListener('itemhive-workspace-changed', refresh); };
    }, [reload]);
    return { categories, loading, error, reload };
}
