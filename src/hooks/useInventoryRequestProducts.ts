import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import type { Product } from '../features/inventory/inventorySlice';

export default function useInventoryRequestProducts(enabled = true) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {
        setLoading(true); setError('');
        try { const { data } = await api.get<Product[]>('/products'); setProducts(data); }
        catch { setError('Unable to load products for linking. You can leave items unlinked and save their order records.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);
    return { products, loading, error, reload };
}
