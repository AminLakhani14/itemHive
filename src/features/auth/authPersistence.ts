import { createTransform } from 'redux-persist';
import type { AuthState } from './authSlice';

type SavedSession = Pick<AuthState, 'user' | 'token' | 'isAuthenticated'>;

// A request cannot survive a page reload. Restore session data only, including
// when an older app version saved loading/errors alongside the session.
export const authPersistence = createTransform<AuthState, SavedSession>(
    ({ user, token, isAuthenticated }) => ({ user, token, isAuthenticated }),
    ({ user, token }) => ({ user: user ?? null, token: token ?? null, isAuthenticated: Boolean(token), loading: false, error: null }),
    { whitelist: ['auth'] },
);
