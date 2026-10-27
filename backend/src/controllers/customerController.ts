import { Response } from 'express';
import Customer, { type ICustomer } from '../models/Customer';
import type { AuthRequest } from '../middleware/auth';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';

const normalize = (value: unknown) => String(value ?? '').trim();
type CustomerType = ICustomer['customerType'];
type CustomerStatus = ICustomer['status'];
type CustomerPayload = {
    fullName: string;
    cnic: string;
    phoneNumber: string;
    amount: number;
    email: string;
    address: string;
    city: string;
    customerType: CustomerType;
    status: CustomerStatus;
    notes: string;
};

const customerTypes: CustomerType[] = ['regular', 'credit', 'installment', 'wholesale'];
const customerStatuses: CustomerStatus[] = ['active', 'inactive'];

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

const parseCustomerType = (value: unknown): CustomerType => {
    const type = normalize(value) as CustomerType;
    return customerTypes.includes(type) ? type : 'regular';
};

const parseCustomerStatus = (value: unknown): CustomerStatus => {
    const status = normalize(value) as CustomerStatus;
    return customerStatuses.includes(status) ? status : 'active';
};

const buildPayload = (body: Record<string, unknown>): CustomerPayload => ({
    fullName: normalize(body.fullName),
    cnic: normalize(body.cnic),
    phoneNumber: normalize(body.phoneNumber),
    amount: Number(body.amount || 0),
    email: normalize(body.email).toLowerCase(),
    address: normalize(body.address),
    city: normalize(body.city),
    customerType: parseCustomerType(body.customerType),
    status: parseCustomerStatus(body.status),
    notes: normalize(body.notes),
});

const ensureUniqueCnic = async (req: AuthRequest, cnic: string, ignoreId?: string) => {
    const query = {
        cnic,
        ...buildTenantFilter(req.user!),
        ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
    };

    return Customer.findOne(query);
};

export const getCustomers = async (req: AuthRequest, res: Response) => {
    try {
        const customers = await Customer.find(buildTenantFilter(req.user!)).sort({ updatedAt: -1 }).lean();
        return res.json(customers);
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch customers') });
    }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
    try {
        const payload = buildPayload(req.body);
        const existingCustomer = await ensureUniqueCnic(req, payload.cnic);

        if (existingCustomer) {
            return res.status(409).json({ message: 'A customer with this CNIC already exists.' });
        }

        const customer = await Customer.create({
            ...payload,
            createdBy: req.user?.id,
            businessId: getTenantObjectId(req.user!),
        });

        return res.status(201).json(customer);
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to create customer') });
    }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const payload = buildPayload(req.body);
        const existingCustomer = await ensureUniqueCnic(req, payload.cnic, id);

        if (existingCustomer) {
            return res.status(409).json({ message: 'A customer with this CNIC already exists.' });
        }

        const customer = await Customer.findOneAndUpdate(
            { _id: id, ...buildTenantFilter(req.user!) },
            { $set: payload },
            { returnDocument: 'after' }
        );

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        return res.json(customer);
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to update customer') });
    }
};

export const deleteCustomer = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        const customer = await Customer.findOneAndDelete({ _id: id, ...buildTenantFilter(req.user!) });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        return res.json({ message: 'Customer deleted' });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to delete customer') });
    }
};
