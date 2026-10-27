import { useEffect, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';
import type { RootState } from '../store';
import type { NotificationItem } from './notifications';
import { ALL_ADMIN_SCREEN_KEYS, hasScreenAccess, type ScreenPermission } from './screenPermissions';

export const notificationScreenPermissions: ScreenPermission[] = ['notifications', ...ALL_ADMIN_SCREEN_KEYS.filter(p => /^(payroll_|finance_|self_)/.test(p))];
type Feed = { scope: string; items: NotificationItem[]; read: string[]; loading: boolean; error: string };
const empty: Feed = { scope: '', items: [], read: [], loading: false, error: '' };
let state = empty;
let userKey = '';
let active = 0;
let generation = 0;
let inFlight: Promise<void> | undefined;
let refreshQueued = false;
const listeners = new Set<() => void>();
const scope = () => userKey ? `${userKey}|${localStorage.getItem('itemhive-workspace-id') || ''}` : '';
const publish = (next: Feed) => { state = next; listeners.forEach(fn => fn()); };
const readKey = (key: string) => `itemhive-workflow-read:${key}`;
const readSaved = (key: string): string[] => {
    try { const value = JSON.parse(localStorage.getItem(readKey(key)) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(-2000) : []; } catch { return []; }
};
function alignScope() {
    const key = scope();
    if (state.scope !== key) {
        generation++;
        inFlight = undefined;
        refreshQueued = false;
        publish({ ...empty, scope: key, read: readSaved(key) });
    }
    return key;
}
export function refreshWorkflowNotifications(force = false) {
    const key = alignScope();
    if (!key || !active) return Promise.resolve();
    if (inFlight) { refreshQueued ||= force; return inFlight; }
    const requestGeneration = generation;
    publish({ ...state, loading: true, error: '' });
    inFlight = (async () => {
        try {
            // Background bell refreshes must not block the user's current form.
            const response = await api.get<NotificationItem[]>('/notifications/workflow', { workflowBackground: true, timeout: 15_000 });
            if (requestGeneration !== generation || key !== scope()) return;
            const items = response.data.map(item => ({ ...item, time: new Date(item.sortTime).toLocaleString() }));
            publish({ ...state, items, loading: false, error: '' });
        } catch {
            if (requestGeneration === generation && key === scope()) publish({ ...state, loading: false, error: 'Payroll and finance alerts could not refresh. Previously loaded alerts are still shown. Please retry.' });
        } finally {
            if (requestGeneration === generation) {
                inFlight = undefined;
                if (refreshQueued) { refreshQueued = false; void refreshWorkflowNotifications(); }
            }
        }
    })();
    return inFlight;
}
export function markWorkflowNotificationsRead(ids: string[]) {
    if (state.scope !== scope()) return;
    const read = [...new Set([...state.read, ...ids])].slice(-2000);
    try { localStorage.setItem(readKey(state.scope), JSON.stringify(read)); } catch { /* Reading alerts remains available without browser storage. */ }
    publish({ ...state, read });
}
function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function useWorkflowNotifications() {
    const user = useSelector((s: RootState) => s.auth.user);
    const pathname = useLocation().pathname;
    const enabled = !!user && notificationScreenPermissions.some(p => hasScreenAccess(user, p));
    const key = enabled ? `${user!.id}:${user!.businessId || ''}:${user!.role}:${[...(user!.screenPermissions || [])].sort().join(',')}` : '';
    const feed = useSyncExternalStore(subscribe, () => state);
    useEffect(() => {
        userKey = key;
        alignScope();
        active++;
        void refreshWorkflowNotifications();
        let debounce: ReturnType<typeof setTimeout>;
        const refresh = () => { clearTimeout(debounce); debounce = setTimeout(() => void refreshWorkflowNotifications(true), 250); };
        const changeScope = () => { alignScope(); refresh(); };
        const focus = () => { if (document.visibilityState === 'visible') refresh(); };
        const storage = () => { alignScope(); publish({ ...state, read: readSaved(state.scope) }); refresh(); };
        window.addEventListener('itemhive-workspace-changed', changeScope);
        window.addEventListener('itemhive-workflow-updated', refresh);
        window.addEventListener('focus', focus);
        window.addEventListener('storage', storage);
        document.addEventListener('visibilitychange', focus);
        const timer = setInterval(focus, 30_000);
        return () => {
            active--;
            clearInterval(timer); clearTimeout(debounce);
            window.removeEventListener('itemhive-workspace-changed', changeScope);
            window.removeEventListener('itemhive-workflow-updated', refresh);
            window.removeEventListener('focus', focus);
            window.removeEventListener('storage', storage);
            document.removeEventListener('visibilitychange', focus);
            if (!active) { generation++; inFlight = undefined; refreshQueued = false; state = empty; }
        };
    }, [key]);
    useEffect(() => { void refreshWorkflowNotifications(); }, [pathname]);
    // Never render an older user's feed while effects switch the request scope.
    const current = enabled && feed.scope === `${key}|${localStorage.getItem('itemhive-workspace-id') || ''}` ? feed : empty;
    return { ...current, refresh: refreshWorkflowNotifications, markRead: markWorkflowNotificationsRead, unread: current.items.filter(item => !current.read.includes(item.id)).length };
}
