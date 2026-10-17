import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { UserRole } from '../../features/auth/authSlice';
import { getDigitalMenuAccess, hasInstallmentAccess, hasScreenAccess, type ScreenPermission } from '../../lib/screenPermissions';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
    requireInstallmentAccess?: boolean;
    requiredScreen?: ScreenPermission;
    requireDigitalMenuAccess?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requireInstallmentAccess, requiredScreen, requireDigitalMenuAccess }) => {
    const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
    const { app } = useSelector((state: RootState) => state.settings);
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    if (requireInstallmentAccess && !hasInstallmentAccess(user, app?.installmentsEnabled)) {
        return <Navigate to="/" replace />;
    }

    if (requireDigitalMenuAccess && getDigitalMenuAccess(user) === 'none') {
        return <Navigate to="/access-denied" state={{ from: location.pathname }} replace />;
    }

    if (requiredScreen && !hasScreenAccess(user, requiredScreen)) {
        return <Navigate to="/access-denied" state={{ from: location.pathname }} replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
