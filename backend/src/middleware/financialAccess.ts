import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import type { AdminScreenPermission } from '../utils/screenPermissions';

export function canFinancial(req: AuthRequest, key: AdminScreenPermission) {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const personal = key.startsWith('self_') || key === 'finance_expense_create';
  return (personal || user.role === 'admin') && !!user.screenPermissions?.includes(key);
}
export const financialAccess = (...keys: AdminScreenPermission[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (keys.some(key => canFinancial(req, key))) return next();
  return res.status(403).json({ message: 'This feature has not been shared with your account' });
};
