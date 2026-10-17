import { Response } from 'express';
import mongoose, { ClientSession } from 'mongoose';
import POSShift, {
    type IPOSShift,
    type IShiftOrderTypeSummary,
    type IShiftPaymentSummary,
    type IShiftReportSnapshot,
    type IShiftReportTotals,
    type IShiftSoldItemSummary,
} from '../models/POSShift';
import Transaction from '../models/Transaction';
import CreditPayment from '../models/CreditPayment';
import InstallmentPlan from '../models/InstallmentPlan';
import Expense from '../models/Expense';
import { policyFor } from '../services/payrollService';
import type { AuthRequest } from '../middleware/auth';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const buildShiftReport = async (
    req: AuthRequest,
    shift: IPOSShift,
    reportTime: Date,
    status: 'open' | 'closed',
    countedCash?: number,
    session?: ClientSession,
): Promise<IShiftReportSnapshot> => {
    const [transactions, creditCollections, installmentPlans] = await Promise.all([
        Transaction.find({
            ...buildTenantFilter(req.user!),
            shiftId: shift._id,
            source: 'pos',
            type: 'reduction',
        }).session(session || null).lean(),
        CreditPayment.find({ ...buildTenantFilter(req.user!), shiftId: shift._id }).session(session || null).lean(),
        InstallmentPlan.find({ ...buildTenantFilter(req.user!), 'schedule.shiftId': shift._id }).session(session || null).lean(),
    ]);
    const installmentCollections = installmentPlans.flatMap((plan) =>
        (plan.schedule || []).filter((item) => item.status === 'paid' && String(item.shiftId || '') === String(shift._id))
    );
    const expenseRows = await Expense.find({
        businessId: getTenantObjectId(req.user!),
        $or: [{ 'payments.shiftId': shift._id }, { 'payments.reversalShiftId': shift._id }],
    }).select('payments').session(session || null).lean();
    const expensePayments = expenseRows.flatMap(e => e.payments);
    const expensePaidOut = expensePayments.filter(p => String(p.shiftId || '') === String(shift._id)).reduce((sum, p) => sum + p.amountMinor, 0) / 100;
    const expenseRefunds = expensePayments.filter(p => p.reversedAt && String(p.reversalShiftId || '') === String(shift._id)).reduce((sum, p) => sum + p.amountMinor, 0) / 100;

    const orders = new Map<string, { paymentMethod: IShiftPaymentSummary['method']; orderType: string; amount: number }>();
    const soldItemMap = new Map<string, IShiftSoldItemSummary>();
    transactions.forEach((transaction) => {
        const orderKey = String(transaction.orderId || transaction.id);
        const paymentMethod = ['cash', 'card', 'credit', 'installment'].includes(String(transaction.paymentMethod))
            ? transaction.paymentMethod as IShiftPaymentSummary['method']
            : 'cash';
        const orderType = transaction.orderType === 'other'
            ? String(transaction.otherOrderType || 'Other').trim() || 'Other'
            : String(transaction.orderType || 'Not specified');
        const order = orders.get(orderKey) || { paymentMethod, orderType, amount: 0 };
        order.amount = round2(order.amount + Number(transaction.totalPrice || 0));
        orders.set(orderKey, order);

        const itemKey = String(transaction.productId || transaction.productName);
        const soldItem = soldItemMap.get(itemKey) || {
            productId: String(transaction.productId || ''),
            productName: String(transaction.productName || 'Product'),
            quantity: 0,
            amount: 0,
        };
        soldItem.quantity += Number(transaction.amount || 0);
        soldItem.amount = round2(soldItem.amount + Number(transaction.totalPrice || 0));
        soldItemMap.set(itemKey, soldItem);
    });

    const paymentSummaryMap = new Map<IShiftPaymentSummary['method'], IShiftPaymentSummary>();
    const orderTypeSummaryMap = new Map<string, IShiftOrderTypeSummary>();
    orders.forEach((order) => {
        const payment = paymentSummaryMap.get(order.paymentMethod) || { method: order.paymentMethod, orderCount: 0, amount: 0 };
        payment.orderCount += 1;
        payment.amount = round2(payment.amount + order.amount);
        paymentSummaryMap.set(order.paymentMethod, payment);

        const orderType = orderTypeSummaryMap.get(order.orderType) || { orderType: order.orderType, orderCount: 0, amount: 0 };
        orderType.orderCount += 1;
        orderType.amount = round2(orderType.amount + order.amount);
        orderTypeSummaryMap.set(order.orderType, orderType);
    });

    const paymentOrder = ['cash', 'card', 'credit', 'installment'];
    const paymentSummary = [...paymentSummaryMap.values()].sort((first, second) => paymentOrder.indexOf(first.method) - paymentOrder.indexOf(second.method));
    const orderTypeSummary = [...orderTypeSummaryMap.values()].sort((first, second) => second.amount - first.amount);
    const soldItems = [...soldItemMap.values()].sort((first, second) => second.amount - first.amount);

    const totals: IShiftReportTotals = {
        completedOrders: new Set(transactions.map((transaction) => transaction.orderId || transaction.id)).size,
        itemsSold: transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
        grossSales: round2(transactions.reduce((sum, transaction) => {
            const lineSubtotal = transaction.subtotal != null
                ? Number(transaction.subtotal)
                : transaction.unitPrice != null
                    ? Number(transaction.unitPrice) * Number(transaction.amount || 0)
                    : Number(transaction.totalPrice || 0);
            return sum + lineSubtotal;
        }, 0)),
        discounts: round2(transactions.reduce((sum, transaction) => sum + Number(transaction.discountAmount || 0), 0)),
        tax: round2(transactions.reduce((sum, transaction) => sum + Number(transaction.taxAmount || 0), 0)),
        netSales: round2(transactions.reduce((sum, transaction) => sum + Number(transaction.totalPrice || 0), 0)),
        cashSales: round2(transactions.filter((transaction) => transaction.paymentMethod === 'cash').reduce((sum, transaction) => sum + Number(transaction.totalPrice || 0), 0)),
        cardSales: round2(transactions.filter((transaction) => transaction.paymentMethod === 'card').reduce((sum, transaction) => sum + Number(transaction.totalPrice || 0), 0)),
        creditSales: round2(transactions.filter((transaction) => transaction.paymentMethod === 'credit').reduce((sum, transaction) => sum + Number(transaction.totalPrice || 0), 0)),
        creditCashReceived: round2(transactions.filter((transaction) => transaction.paymentMethod === 'credit' && transaction.paidVia === 'cash').reduce((sum, transaction) => sum + Number(transaction.paidNow || 0), 0)),
        creditCardReceived: round2(transactions.filter((transaction) => transaction.paymentMethod === 'credit' && transaction.paidVia === 'card').reduce((sum, transaction) => sum + Number(transaction.paidNow || 0), 0)),
        creditCollectionsCash: round2(creditCollections.filter((payment) => payment.paidVia === 'cash').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
        creditCollectionsCard: round2(creditCollections.filter((payment) => payment.paidVia === 'card').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
        installmentSales: round2(transactions.filter((transaction) => transaction.paymentMethod === 'installment').reduce((sum, transaction) => sum + Number(transaction.totalPrice || 0), 0)),
        installmentCashAdvance: round2(transactions.filter((transaction) => transaction.paymentMethod === 'installment' && transaction.paidVia === 'cash').reduce((sum, transaction) => sum + Number(transaction.paidNow || 0), 0)),
        installmentCardAdvance: round2(transactions.filter((transaction) => transaction.paymentMethod === 'installment' && transaction.paidVia === 'card').reduce((sum, transaction) => sum + Number(transaction.paidNow || 0), 0)),
        installmentCollectionsCash: round2(installmentCollections.filter((payment) => payment.paidVia === 'cash').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
        installmentCollectionsCard: round2(installmentCollections.filter((payment) => payment.paidVia === 'card').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
        totalCollected: 0,
        expectedDrawerCash: 0,
        expensePaidOut,
        expenseRefunds,
    };
    totals.totalCollected = round2(
        totals.cashSales
        + totals.cardSales
        + totals.creditCashReceived
        + totals.creditCardReceived
        + totals.creditCollectionsCash
        + totals.creditCollectionsCard
        + totals.installmentCashAdvance
        + totals.installmentCardAdvance
        + totals.installmentCollectionsCash
        + totals.installmentCollectionsCard,
    );
    totals.expectedDrawerCash = round2(
        Number(shift.openingCash || 0)
        + totals.cashSales
        + totals.creditCashReceived
        + totals.creditCollectionsCash
        + totals.installmentCashAdvance
        + totals.installmentCollectionsCash
        - expensePaidOut + expenseRefunds,
    );

    if (countedCash != null) {
        totals.countedCash = round2(countedCash);
        totals.cashDifference = round2(countedCash - totals.expectedDrawerCash);
    }

    return {
        shiftCode: shift.shiftCode,
        currency: shift.currency,
        registerName: shift.registerName,
        cashierName: shift.openedByName,
        openingCash: Number(shift.openingCash || 0),
        openedAt: shift.openedAt,
        reportTime,
        status,
        totals,
        paymentSummary,
        orderTypeSummary,
        soldItems,
    };
};

export const getCurrentShift = async (req: AuthRequest, res: Response) => {
    try {
        const shift = await POSShift.findOne({ ...buildTenantFilter(req.user!), status: 'open' }).lean();
        return res.json({ shift });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to load the current shift' });
    }
};

export const openShift = async (req: AuthRequest, res: Response) => {
    try {
        const openingCash = Number(req.body.openingCash);
        const registerName = String(req.body.registerName || 'Main Counter').trim();
        if (!Number.isFinite(openingCash) || openingCash < 0) return res.status(400).json({ message: 'Opening cash must be zero or more' });
        if (!registerName) return res.status(400).json({ message: 'Register name is required' });

        const existing = await POSShift.findOne({ ...buildTenantFilter(req.user!), status: 'open' }).lean();
        if (existing) return res.status(409).json({ message: `${existing.shiftCode} is already open` });

        const shift = await POSShift.create({
            shiftCode: `SH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            registerName,
            openingCash,
            currency: (await policyFor(req.user!.businessId)).currency,
            openedBy: req.user!.id,
            openedByName: req.user!.name || 'Staff',
            openedAt: new Date(),
            businessId: getTenantObjectId(req.user!),
        });
        return res.status(201).json({ shift });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ message: 'A POS shift is already open' });
        return res.status(400).json({ message: error.message || 'Failed to open shift' });
    }
};

export const getXReport = async (req: AuthRequest, res: Response) => {
    try {
        const shift = await POSShift.findOne({ ...buildTenantFilter(req.user!), status: 'open' });
        if (!shift) return res.status(404).json({ message: 'Open a POS shift before generating a Live Shift Summary' });
        const report = await buildShiftReport(req, shift, new Date(), 'open');
        return res.json({ shift, report });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to generate Live Shift Summary' });
    }
};

export const closeShift = async (req: AuthRequest, res: Response) => {
    const countedCash = Number(req.body.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) return res.status(400).json({ message: 'Counted cash must be zero or more' });

    const session = await mongoose.startSession();
    try {
        let closedShift: IPOSShift | null = null;
        await session.withTransaction(async () => {
            const shift = await POSShift.findOne({ ...buildTenantFilter(req.user!), status: 'open' }).session(session);
            if (!shift) throw new Error('There is no open POS shift to close');

            const closedAt = new Date();
            const report = await buildShiftReport(req, shift, closedAt, 'closed', countedCash, session);
            shift.status = 'closed';
            shift.closedAt = closedAt;
            shift.closedBy = new mongoose.Types.ObjectId(req.user!.id);
            shift.closedByName = req.user!.name || 'Staff';
            shift.countedCash = report.totals.countedCash;
            shift.cashDifference = report.totals.cashDifference;
            shift.finalReport = report;
            await shift.save({ session });
            closedShift = shift;
        });
        return res.json({ shift: closedShift, report: (closedShift as IPOSShift | null)?.finalReport });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to close shift' });
    } finally {
        await session.endSession();
    }
};

export const getShiftHistory = async (req: AuthRequest, res: Response) => {
    try {
        const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '12'), 10) || 12));
        const search = String(req.query.search || '').trim();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();
        const filter: Record<string, unknown> = { ...buildTenantFilter(req.user!), status: 'closed' };

        if (from || to) {
            const closedAt: { $gte?: Date; $lte?: Date } = {};
            if (from) {
                const start = new Date(from.includes('T') ? from : `${from}T00:00:00.000`);
                if (Number.isNaN(start.getTime())) return res.status(400).json({ message: 'Invalid history start date' });
                closedAt.$gte = start;
            }
            if (to) {
                const end = new Date(to.includes('T') ? to : `${to}T23:59:59.999`);
                if (Number.isNaN(end.getTime())) return res.status(400).json({ message: 'Invalid history end date' });
                closedAt.$lte = end;
            }
            filter.closedAt = closedAt;
        }

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matcher = new RegExp(escapedSearch, 'i');
            filter.$or = [
                { shiftCode: matcher },
                { registerName: matcher },
                { openedByName: matcher },
                { closedByName: matcher },
            ];
        }

        const [shifts, total] = await Promise.all([
            POSShift.find(filter)
            .sort({ closedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
            POSShift.countDocuments(filter),
        ]);
        return res.json({
            items: shifts,
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to load Shift Closing Report history' });
    }
};
