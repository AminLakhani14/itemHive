import axios from 'axios';
import { resolveApiUrl } from './apiUrl';
import { installWorkflowLoading } from './workflowLoading';

const api = axios.create({
    baseURL: resolveApiUrl(import.meta.env.DEV, import.meta.env.VITE_API_URL),
    headers: {
        'Content-Type': 'application/json'
    }
});

installWorkflowLoading(api, () => window.location.pathname);

// Request interceptor for adding the bearer token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        const selectedWorkspaceId = localStorage.getItem('itemhive-workspace-id');
        if (selectedWorkspaceId) {
            config.headers['x-itemhive-workspace-id'] = selectedWorkspaceId;
        }
        // The branch chosen in the top bar (BRANCH_STORAGE_KEY in features/branch/branchSlice).
        const selectedBranchId = localStorage.getItem('itemhive-branch-id');
        if (selectedBranchId) {
            config.headers['x-itemhive-branch-id'] = selectedBranchId;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for handling errors (like 401 Unauthorized)
api.interceptors.response.use(
    (response) => {
        if (typeof window !== 'undefined' && !['get', 'head', 'options'].includes(response.config.method || 'get') && /\/(payroll|expenses|finance)(\/|$)/.test(response.config.url || '')) {
            window.dispatchEvent(new Event('itemhive-workflow-updated'));
        }
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            window.dispatchEvent(new Event('itemhive-auth-expired'));
        }
        return Promise.reject(error);
    }
);

export default api;
