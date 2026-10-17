import { resolveSellingLine } from '../utils/productSelling';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import InstallmentPlan from '../models/InstallmentPlan';
import Product from '../models/Product';
import Transaction from '../models/Transaction';
import { recordCommission, salesPerson } from '../services/payrollService';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/accessControl';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';
import POSShift from '../models/POSShift';

const round2 = (value: number) => Math.round(value * 100) / 100;

const buildSchedule = (saleDateInput: string | Date, months: 3 | 6 | 9 | 12, financedAmount: number) => {
    const saleDate = new Date(saleDateInput);
    const baseInstallment = round2(financedAmount / months);
    const schedule = [];
    let accumulated = 0;

    for (let index = 0; index < months; index += 1) {
        const dueDate = new Date(saleDate);
        dueDate.setMonth(dueDate.getMonth() + index + 1);

        const amount = index === months - 1
            ? round2(financedAmount - accumulated)
            : baseInstallment;

        accumulated = round2(accumulated + amount);

        schedule.push({
            installmentNumber: index + 1,
            dueDate,
            amount,
            status: 'pending' as const,
        });
    }

    return schedule;
};

const refreshInstallmentStatus = (plan: any) => {
    const installmentPayments = round2(
        (plan.schedule || [])
            .filter((item: any) => item.status === 'paid')
            .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
    );

    const advancePayment = round2(Number(plan.advancePayment || 0));
    const totalPaid = round2(advancePayment + installmentPayments);

    plan.paidAmount = totalPaid;
    plan.remainingAmount = round2(Math.max(Number(plan.totalAmount || 0) - totalPaid, 0));
    plan.status = plan.remainingAmount <= 0 ? 'cleared' : 'active';
};

export const getInstallmentPlans = async (req: AuthRequest, res: Response) => {
    try {
        const plans = await InstallmentPlan.find(buildTenantFilter(req.user!)).sort({ createdAt: -1 }).lean();
        res.json(plans);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch installment plans' });
    }
};

export const createInstallmentPlan = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            planCode,
            productId,
            productName,
            amount,
            totalAmount,
            unitPrice,
            advancePayment,
            customerName,
            customerCnic,
            customerPhone,
            customerAddress,
            witnesses,
            saleDate,
            installmentMonths,
            userName,
            orderType,
            otherOrderType,
            shiftId,
            orderId,
            advancePaidVia,
        } = req.body;

        let resolvedShiftId: mongoose.Types.ObjectId | undefined;
        if (shiftId) {
            if (!mongoose.Types.ObjectId.isValid(String(shiftId))) {
                throw new Error('Open a POS shift before taking payment');
            }
            const activeShift = await POSShift.findOneAndUpdate(
                { _id: shiftId, status: 'open', ...buildTenantFilter(req.user!) },
                { $inc: { activityVersion: 1 } },
                { new: true, session },
            );
            if (!activeShift) throw new Error('This POS shift is closed. Open a new shift before taking payment');
            resolvedShiftId = activeShift._id;
        }

        const product = await Product.findOne({ id: productId, ...buildTenantFilter(req.user!) }).session(session);
        if (!product) {
            throw new Error('Product not found');
        }

        const sizeId = String(req.body.sizeId || '');
        const sellingLine = resolveSellingLine(product, Number(amount), sizeId);

        const actorRole = normalizeRole(req.user?.role);
        const defaultUnitPrice = sellingLine.unitPrice;
        const resolvedUnitPrice = Number(unitPrice ?? defaultUnitPrice);
        const resolvedTotalAmount = Number(totalAmount ?? resolvedUnitPrice * Number(amount || 0));
        const resolvedAdvancePayment = round2(Number(advancePayment ?? 0));
        const resolvedMonths = Number(installmentMonths) as 3 | 6 | 9 | 12;
        const financedAmount = round2(resolvedTotalAmount - resolvedAdvancePayment);

        if (actorRole === 'user' && resolvedUnitPrice !== defaultUnitPrice) {
            throw new Error('Users are not allowed to change the sale price');
        }

        if (!Number.isFinite(resolvedAdvancePayment) || resolvedAdvancePayment < 0) {
            throw new Error('Advance payment must be zero or more');
        }

        if (!Number.isFinite(resolvedTotalAmount) || resolvedTotalAmount <= 0) {
            throw new Error('Installment total amount must be greater than zero');
        }

        if (resolvedAdvancePayment >= resolvedTotalAmount) {
            throw new Error('Advance payment must be less than the installment sale total');
        }

        const schedule = buildSchedule(saleDate, resolvedMonths, financedAmount);
        const planId = String(planCode || `INS-${Date.now()}`);

        const salesperson = await salesPerson(req.user!.businessId, req.user!.id, req.body.salespersonEmployeeId, session);
        const transaction = new Transaction({
            ...salesperson,
            id: `INS-${randomUUID()}`,
            productId,
            productName: sellingLine.name,
            sizeId,
            selectedSize: sellingLine.size?.size,
            productUnit: product.unitSizeEnabled ? product.productUnit : undefined,
            type: 'reduction',
            amount,
            subtotal: resolvedTotalAmount,
            discountPercent: 0,
            discountAmount: 0,
            taxAmount: 0,
            totalPrice: resolvedTotalAmount,
            userName: req.user?.name || userName || 'Staff',
            paymentMethod: 'installment',
            paidNow: resolvedAdvancePayment,
            dueAmount: financedAmount,
            customerName,
            customerCnic,
            orderType,
            otherOrderType,
            unitCost: sellingLine.unitCost,
            unitPrice: resolvedUnitPrice,
            grossProfit: (resolvedUnitPrice - (sellingLine.unitCost)) * Number(amount || 0),
            installmentPlanId: planId,
            source: resolvedShiftId ? 'pos' : 'order_desk',
            orderId: resolvedShiftId ? String(orderId || planId) : '',
            shiftId: resolvedShiftId,
            paidVia: advancePaidVia === 'card' ? 'card' : 'cash',
            businessId: getTenantObjectId(req.user!),
        });
        await transaction.save({ session });
        await recordCommission(transaction, session);

        if (sizeId) {
            const size = product.sizes?.find(row => row.id === sizeId);
            if (!size) throw new Error('Invalid product size');
            size.stock -= Number(amount);
        }
        product.stock -= Number(amount || 0);
        await product.save({ session });

        const plan = new InstallmentPlan({
            planCode: planId,
            productId,
            productName: sellingLine.name,
            sizeId,
            selectedSize: sellingLine.size?.size,
            productUnit: product.unitSizeEnabled ? product.productUnit : undefined,
            customerName,
            customerCnic,
            customerPhone,
            customerAddress,
            witnesses,
            saleDate,
            installmentMonths: resolvedMonths,
            unitPrice: resolvedUnitPrice,
            advancePayment: resolvedAdvancePayment,
            financedAmount,
            monthlyInstallmentAmount: schedule[0]?.amount || 0,
            totalAmount: resolvedTotalAmount,
            paidAmount: resolvedAdvancePayment,
            remainingAmount: financedAmount,
            status: 'active',
            createdBy: req.user?.id || userName || 'Staff',
            schedule,
            shiftId: resolvedShiftId,
            orderId: resolvedShiftId ? String(orderId || planId) : '',
            advancePaidVia: advancePaidVia === 'card' ? 'card' : 'cash',
            businessId: getTenantObjectId(req.user!),
        });

        await plan.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(plan);
    } catch (error: any) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ message: error.message || 'Failed to create installment plan' });
    }
};

export const payInstallment = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    try {
        let updatedPlan: any;
        await session.withTransaction(async () => {
            const plan = await InstallmentPlan.findOne({ planCode: req.params.id, ...buildTenantFilter(req.user!) }).session(session);
            if (!plan) throw new Error('Installment plan not found');

            const installmentNumber = Number(req.body.installmentNumber);
            const paidVia = req.body.paidVia as 'cash' | 'card';
            const notes = String(req.body.notes || '');
            const scheduleItem = plan.schedule.find((item) => item.installmentNumber === installmentNumber);
            if (!scheduleItem) throw new Error('Installment entry not found');
            if (scheduleItem.status === 'paid') throw new Error('This installment is already marked paid');

            const activeShift = await POSShift.findOneAndUpdate(
                { ...buildTenantFilter(req.user!), status: 'open' },
                { $inc: { activityVersion: 1 } },
                { new: true, session },
            );
            scheduleItem.status = 'paid';
            scheduleItem.paidAt = new Date();
            scheduleItem.paidVia = paidVia;
            scheduleItem.notes = notes;
            scheduleItem.shiftId = activeShift?._id;

            refreshInstallmentStatus(plan);
            await plan.save({ session });
            updatedPlan = plan;
        });

        res.json(updatedPlan);
    } catch (error: any) {
        res.status(400).json({ message: error.message || 'Failed to update installment payment' });
    } finally {
        await session.endSession();
    }
};
