import type { AxiosInstance } from 'axios';

declare module 'axios' {
    interface AxiosRequestConfig { workflowBackground?: boolean }
}

export function isWorkflowRequest(url = '', pathname = '') {
    if (/^\/(payroll|finance|expenses|my)(\/|$)/.test(pathname)) return true;
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api(?=\/|$)/, '');
    return /^\/(payroll|finance|expenses|me\/payroll)(\/|$)/.test(path);
}

const pending = new Set<object>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const workflowLoading = {
    getSnapshot: () => pending.size,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

export function installWorkflowLoading(api: AxiosInstance, pathname: () => string) {
    const finish = (config?: object) => {
        if (config && pending.delete(config)) notify();
    };
    api.interceptors.request.use(config => {
        if (!config.workflowBackground && isWorkflowRequest(config.url, pathname())) {
            pending.add(config);
            notify();
        }
        return config;
    });
    api.interceptors.response.use(response => {
        finish(response.config);
        return response;
    }, error => {
        finish(error.config);
        return Promise.reject(error);
    });
}
