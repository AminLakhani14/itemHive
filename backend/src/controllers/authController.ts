import { Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import type { AuthRequest } from '../middleware/auth';
import { isSuperAdminEmail, normalizeRole, serializeUser } from '../utils/accessControl';
import Business from '../models/Business';
import { ensureLegacyBusiness, getGlobalAppSettings } from '../utils/tenancy';
import SignupRequest from '../models/SignupRequest';
import Employee from '../models/Employee';
import { createEmployeeForAccount, isStaffRole } from '../utils/employeeAccounts';
import { resolveThemeOwner, serializeUserWithTheme } from '../utils/appearance';
import {
    createPendingSignupRequest,
    sendSignupApprovalRequestEmail,
} from './signupRequestController';

const signToken = (id: string, role: string) => jwt.sign(
    { id, role: normalizeRole(role) },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: (process.env.JWT_EXPIRATION as any) || '7d' }
);

export const register = async (req: AuthRequest, res: Response) => {
    try {
        const {
            name,
            email,
            password,
            role,
            businessName,
            businessId: requestedBusinessId,
            packageId,
            packageName,
            country,
            currency,
            businessType,
            phone,
            employeeCount,
            address,
            notes,
            employeeId,
        } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const requestedRole = normalizeRole(role);
        const isPublicRegistration = !req.user;
        const globalAppSettings = isPublicRegistration ? await getGlobalAppSettings() : null;

        const [existingUser, totalUsers, currentUser] = await Promise.all([
            User.findOne({ email: normalizedEmail }),
            User.countDocuments(),
            req.user?.id ? User.findById(req.user.id).select('role userCreationLimit isActive businessId') : null,
        ]);

        if (existingUser) {
            if (isPublicRegistration) {
                const hadPendingRequest = await SignupRequest.exists({ email: normalizedEmail, status: 'pending' });
                const request = await createPendingSignupRequest({
                    fullName: name,
                    email: normalizedEmail,
                    password,
                    businessName,
                    packageId,
                    packageName,
                    country,
                    currency,
                    businessType,
                    phone,
                    employeeCount,
                    address,
                    notes,
                }, 'duplicate_email');

                if (!hadPendingRequest) {
                    await sendSignupApprovalRequestEmail(request);
                }

                return res.status(202).json({
                    message: 'This email already has an account. An approval request has been sent for review.',
                    requestId: request._id,
                    requiresApproval: true,
                });
            }

            return res.status(400).json({ message: 'User already exists' });
        }

        if (isPublicRegistration && !globalAppSettings?.autoRegistrationEnabled) {
            const request = await createPendingSignupRequest({
                fullName: name,
                email: normalizedEmail,
                password,
                businessName,
                packageId,
                packageName,
                country,
                currency,
                businessType,
                phone,
                employeeCount,
                address,
                notes,
            }, 'new_signup');

            await sendSignupApprovalRequestEmail(request);

            return res.status(202).json({
                message: 'Signup request submitted. A super admin will review it before creating your account.',
                requestId: request._id,
                requiresApproval: true,
            });
        }

        const superAdminExists = await User.exists({ role: 'super_admin' });
        const bootstrapSuperAdmin = totalUsers === 0 || (!superAdminExists && isSuperAdminEmail(normalizedEmail));

        if (req.user && !currentUser?.isActive) {
            return res.status(403).json({ message: 'Your account is not active' });
        }

        let assignedRole = requestedRole;
        let createdBy = null;
        let businessId = currentUser?.businessId || null;

        if (bootstrapSuperAdmin || isSuperAdminEmail(normalizedEmail)) {
            assignedRole = 'super_admin';
            businessId = (await ensureLegacyBusiness())._id;
        } else if (isPublicRegistration) {
            // A public signup owns a new workspace, so it becomes that
            // workspace's administrator immediately.
            assignedRole = 'admin';
            const business = await Business.create({
                name: String(businessName || `${name}'s Store`).trim(),
                slug: `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            });
            businessId = business._id;
        } else if (req.user) {
            const actorRole = normalizeRole(req.user.role);
            createdBy = req.user.id;

            if (actorRole === 'admin') {
                if (req.user.screenPermissions != null && !req.user.screenPermissions.includes('team')) {
                    return res.status(403).json({ message: 'You do not have permission to access Team Management' });
                }
                if (requestedRole !== 'user') {
                    return res.status(403).json({ message: 'Admins can only create user accounts' });
                }

                const createdUsersCount = await User.countDocuments({ createdBy: req.user.id, role: 'user' });
                if (createdUsersCount >= Number(currentUser?.userCreationLimit || 0)) {
                    return res.status(403).json({ message: 'This admin has reached the assigned user creation limit' });
                }

                assignedRole = 'user';
            }

            if (actorRole === 'super_admin' && requestedBusinessId) {
                const business = await Business.findById(requestedBusinessId);
                if (!business || !business.isActive) {
                    return res.status(400).json({ message: 'Selected business was not found or is inactive' });
                }
                businessId = business._id;
            } else if (actorRole === 'super_admin' && assignedRole === 'admin') {
                const business = await Business.create({
                    name: String(businessName || `${name}'s Store`).trim(),
                    slug: `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    createdBy: req.user.id,
                });
                businessId = business._id;
            }
        }

        // Creating a login for an existing employee profile (from Employees or Team).
        let employeeToLink: { _id: mongoose.Types.ObjectId; branchId?: mongoose.Types.ObjectId | null } | null = null;
        if (employeeId) {
            if (!req.user || !businessId) {
                return res.status(400).json({ message: 'A login can only be linked to an employee by a signed-in admin' });
            }
            const employee = await Employee.findOne({ _id: employeeId, businessId }).select('_id userId branchId').lean();
            if (!employee) {
                return res.status(400).json({ message: 'That employee was not found in this business' });
            }
            if (employee.userId) {
                return res.status(409).json({ message: 'This employee already has a login account' });
            }
            employeeToLink = employee;
        }

        // Staff work in one branch: their employee profile's, or the branch the account is created in.
        const branchId = !isStaffRole(assignedRole) ? null
            : employeeToLink ? employeeToLink.branchId || null
                : req.user && String(businessId) === req.user.businessId && req.user.branchId ? new mongoose.Types.ObjectId(req.user.branchId) : null;
        const user = new User({
            name,
            email: normalizedEmail,
            password,
            visiblePassword: password,
            role: assignedRole,
            createdBy,
            businessId,
            branchId,
            preferences: country || currency ? {
                country: country || 'PK',
                currency: currency || 'PKR',
                notifications: {
                    orderUpdates: true,
                    lowStockAlerts: true,
                },
            } : undefined,
        });
        await user.save();

        // Staff logins and employee profiles are the same people, so each login gets a profile.
        // A failure here must not undo the account; the Employees screen backfills missing profiles.
        try {
            if (employeeToLink) {
                await Employee.updateOne({ _id: employeeToLink._id, userId: null }, { $set: { userId: user._id } });
            } else if (isStaffRole(user.role)) {
                await createEmployeeForAccount(user);
            }
        } catch (linkError) {
            console.error('Failed to link employee profile to new account:', linkError);
        }

        const token = signToken(String(user._id), user.role);

        res.status(201).json({
            token,
            user: serializeUser(user),
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const login = async (req: AuthRequest, res: Response) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ message: 'Sign in is temporarily unavailable. Please try again shortly.' });
    }
    try {
        const { email, password } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail }).select('+password');
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const normalizedRole = isSuperAdminEmail(user.email) ? 'super_admin' : normalizeRole(user.role);
        const shouldSaveRole = user.role !== normalizedRole;

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (shouldSaveRole) {
            user.role = normalizedRole;
            await user.save();
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact the super admin.' });
        }

        const token = signToken(String(user._id), normalizedRole);

        res.json({
            token,
            user: await serializeUserWithTheme(user),
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user?.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json({
            user: {
                ...(await serializeUserWithTheme(user)),
                businessName: req.user?.businessName || '',
            },
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to load the current account' });
    }
};

export const updateAppearance = async (req: AuthRequest, res: Response) => {
    try {
        const { themeColor, backgroundColor, sidebarColor, navbarColor, sidebarFontColor, navbarFontColor, borderColor, headingColor, secondaryTextColor, secondaryColor, successColor, warningColor, errorColor, fontColor, logo } = req.body;
        const currentUser = await User.findById(req.user?.id);
        if (currentUser && await resolveThemeOwner(currentUser)) {
            return res.status(403).json({ message: "Your theme follows your business's theme, which your administrator sets." });
        }
        const user = await User.findByIdAndUpdate(req.user?.id,
            { $set: { appearance: { themeColor, backgroundColor, sidebarColor, navbarColor, sidebarFontColor, navbarFontColor, borderColor, headingColor, secondaryTextColor, secondaryColor, successColor, warningColor, errorColor, fontColor, logo } } },
            { returnDocument: 'after', runValidators: true });
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.json({ appearance: user.appearance });
    } catch {
        return res.status(500).json({ message: 'Unable to save theme settings' });
    }
};
