import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../api/axios';
import type { RootState } from '../store';
import type { OrderDraft } from '../types/orderDraft';

/** QR orders use the same saved drafts that POS opens and removes after payment. */
export function useOrderDrafts(enabled: boolean, tableOnly = false) {
    const userId = useSelector((state: RootState) => state.auth.user?.id);
    const [orders, setOrders] = useState<OrderDraft[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState('');

    useEffect(() => {
        let disposed = false;
        let request: AbortController | null = null;
        const load = async (reset = false) => {
            if (reset) {
                request?.abort();
                request = null;
                setOrders([]);
                setError('');
                setLoading(enabled);
            }
            if (!enabled || !userId || request || disposed) return;
            const current = new AbortController();
            request = current;
            try {
                const { data } = await api.get<OrderDraft[]>('/order-drafts', { signal: current.signal, timeout: 15000 });
                if (!disposed && !current.signal.aborted) {
                    setOrders(tableOnly ? data.filter(order => order.digitalMenuTable?.trim()) : data);
                    setError('');
                }
            } catch {
                if (!disposed && !current.signal.aborted) setError(tableOnly ? 'Unable to check table orders. Retrying automatically.' : 'Unable to load order drafts. Retrying automatically.');
            } finally {
                if (!disposed && !current.signal.aborted) setLoading(false);
                if (request === current) request = null;
            }
        };
        const refresh = () => { if (document.visibilityState === 'visible') void load(); };
        const draftsChanged = () => { request?.abort(); request = null; void load(); };
        const changeWorkspace = () => { void load(true); };
        void load(true);
        const timer = enabled ? window.setInterval(refresh, 10000) : undefined;
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('itemhive-workspace-changed', changeWorkspace);
        window.addEventListener('itemhive-order-drafts-changed', draftsChanged);
        return () => {
            disposed = true;
            request?.abort();
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('itemhive-workspace-changed', changeWorkspace);
            window.removeEventListener('itemhive-order-drafts-changed', draftsChanged);
        };
    }, [enabled, userId, tableOnly]);

    return { orders, loading, error, removeLocalDraft: (id: string) => setOrders(current => current.filter(order => order._id !== id)) };
}

export default function useTableOrders(enabled: boolean) {
    return useOrderDrafts(enabled, true);
}
