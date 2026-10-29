import { Response } from 'express';
import SignupRequest, { type ISignupRequest } from '../models/SignupRequest';
import User from '../models/User';
import Business from '../models/Business';
import type { AuthRequest } from '../middleware/auth';

const sendSignupDecisionEmail = async (to: string, payload: Record<string, unknown>) => {
    const endpoint = process.env.SIGNUP_EMAIL_FUNCTION_URL || process.env.EMAIL_FUNCTION_URL;
    if (!endpoint) return;

    try {
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, ...payload }),
        });
    } catch (error) {
        console.error('Signup decision email failed:', error);
    }
};

export interface SignupRequestData {
    fullName: string;
    email: string;
    password: string;
    businessName: string;
    packageId?: 'free_trial' | 'starter' | 'pro';
    packageName?: string;
    country?: string;
    currency?: string;
    businessType?: string;
    phone?: string;
    employeeCount?: number;
    address?: string;
    notes?: string;
}

export const createPendingSignupRequest = async (
    data: SignupRequestData,
    requestType: 'new_signup' | 'duplicate_email' = 'new_signup'
) => {
    const email = String(data.email || '').trim().toLowerCase();
    const pendingRequest = await SignupRequest.findOne({ email, status: 'pending' });
    if (pendingRequest) {
        return pendingRequest;
    }

    return SignupRequest.create({
        fullName: String(data.fullName || '').trim(),
        email,
        password: String(data.password || ''),
        businessName: String(data.businessName || '').trim(),
        packageId: data.packageId || 'free_trial',
        packageName: data.packageName || 'Free Trial',
        country: data.country || 'PK',
        currency: data.currency || 'PKR',
        businessType: String(data.businessType || '').trim(),
        phone: String(data.phone || '').trim(),
        employeeCount: Number(data.employeeCount || 1),
        address: String(data.address || '').trim(),
        notes: String(data.notes || '').trim(),
        requestType,
    });
};

export const sendSignupApprovalRequestEmail = async (request: ISignupRequest) => {
    const isDuplicateEmailRequest = request.requestType === 'duplicate_email';
    const payload = {
        subject: isDuplicateEmailRequest
            ? 'Approval request for an existing Ozor email'
            : 'New Ozor signup approval request',
        status: 'pending',
        requestType: request.requestType,
        name: request.fullName,
        businessName: request.businessName,
        loginEmail: request.email,
    };

    await sendSignupDecisionEmail(request.email, payload);

    const adminEmail = String(process.env.SIGNUP_ADMIN_EMAIL || 'admin@itemhive.com').trim().toLowerCase();
    if (adminEmail !== request.email) {
        await sendSignupDecisionEmail(adminEmail, {
            ...payload,
            subject: 'New Ozor signup approval request',
            requesterEmail: request.email,
        });
    }
};

export const sendDuplicateSignupApprovalRequestEmail = sendSignupApprovalRequestEmail;

export const createSignupRequest = async (req: AuthRequest, res: Response) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const [existingUser, pendingRequest] = await Promise.all([
            User.exists({ email }),
            SignupRequest.exists({ email, status: 'pending' }),
        ]);

        if (existingUser) {
            return res.status(400).json({ message: 'An account already exists for this email' });
        }

        if (pendingRequest) {
            return res.status(400).json({ message: 'A signup request is already pending for this email' });
        }

        const request = await createPendingSignupRequest(req.body);

        return res.status(201).json({
            message: 'Signup request submitted successfully',
            requestId: request._id,
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to submit signup request' });
    }
};

export const getSignupRequests = async (_req: AuthRequest, res: Response) => {
    try {
        const requests = await SignupRequest.find()
            .select('-password')
            .sort({ status: 1, createdAt: -1 });

        return res.json(requests);
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch signup requests' });
    }
};

export const decideSignupRequest = async (req: AuthRequest, res: Response) => {
    try {
        const request = await SignupRequest.findById(req.params.id).select('+password');

        if (!request) {
            return res.status(404).json({ message: 'Signup request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'This signup request has already been reviewed' });
        }

        const status = req.body.status;
        const decisionNote = String(req.body.decisionNote || '').trim();

        request.status = status;
        request.decisionNote = decisionNote;
        request.reviewedBy = req.user?.id as any;
        request.reviewedByName = req.user?.name || '';
        request.reviewedAt = new Date();

        if (status === 'approved') {
            const existingUser = await User.exists({ email: request.email });
            if (existingUser) {
                // A duplicate-email request is for review/audit only. The existing
                // account remains the single identity for this email.
                request.createdUserId = existingUser._id as any;
                await sendSignupDecisionEmail(request.email, {
                    subject: 'Your Ozor approval request was reviewed',
                    status: 'approved',
                    requestType: request.requestType,
                    name: request.fullName,
                    businessName: request.businessName,
                    loginEmail: request.email,
                    note: decisionNote || 'An account already exists for this email. Please sign in with that account.',
                });
                await request.save();

                return res.json({
                    message: 'Signup request approved. The existing account remains active for this email.',
                    request,
                });
            }

            const business = await Business.create({
                name: request.businessName,
                slug: `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                createdBy: req.user?.id,
            });

            const user = await User.create({
                name: request.fullName,
                email: request.email,
                password: request.password,
                visiblePassword: request.password,
                role: 'admin',
                createdBy: req.user?.id,
                businessId: business._id,
                preferences: {
                    country: request.country,
                    currency: request.currency,
                    notifications: {
                        orderUpdates: true,
                        lowStockAlerts: true,
                    },
                },
            });

            request.createdUserId = user._id as any;
            request.createdBusinessId = business._id as any;

            await sendSignupDecisionEmail(request.email, {
                subject: 'Your Ozor account is approved',
                status: 'approved',
                name: request.fullName,
                businessName: request.businessName,
                packageName: request.packageName,
                country: request.country,
                currency: request.currency,
                loginEmail: request.email,
                password: request.password,
                note: decisionNote,
            });
        } else {
            await sendSignupDecisionEmail(request.email, {
                subject: 'Your Ozor signup request update',
                status: 'rejected',
                name: request.fullName,
                businessName: request.businessName,
                note: decisionNote,
            });
        }

        await request.save();

        return res.json({
            message: `Signup request ${request.status} successfully`,
            request,
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to review signup request' });
    }
};
