import { Router, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { protect, requireScreenAccess, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import Expense from '../models/Expense';
import POSShift from '../models/POSShift';
import { minor, validDate } from '../services/payrollCalculator';
import { policyFor } from '../services/payrollService';

const router = Router();
router.use(protect, requireScreenAccess('expenses'));
const text = Joi.string().trim().max(1000);
const date = Joi.string().custom((v, h) => validDate(v) ? v : h.error('any.invalid'));
const key = Joi.string().trim().min(8).max(100);
const version = Joi.number().integer().min(0).required();
const currencies = ['PKR', 'USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'INR', 'AED'];
const categories = ['Rent', 'Utilities', 'Supplies', 'Repairs', 'Transport', 'Marketing', 'Delivery fees', 'Professional services', 'Other'];
const body = {
  title: text.max(120).min(1).required(), category: text.max(80).min(1).required(), dateKey: date.required(),
  payee: text.max(120).allow('').default(''), reference: text.max(120).allow('').default(''), notes: text.allow('').default(''),
  currency: Joi.string().valid(...currencies).required(), amount: Joi.number().positive().max(1_000_000_000).precision(2).required(),
  receipt: Joi.object({ fileName: text.max(160).required(), data: Joi.string().max(1_400_000).pattern(/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/).required() }).allow(null).default(null),
};
const can = (req: AuthRequest, permission: string) => req.user!.role === 'super_admin' || (req.user!.role === 'admin' && !!req.user!.screenPermissions?.includes(permission as any));
const permissions = (req: AuthRequest) => ({ viewAll: can(req, 'finance_view') || can(req, 'finance_expense_approve') || can(req, 'finance_pay'), approve: can(req, 'finance_expense_approve'), pay: can(req, 'finance_pay') });
const tenant = (req: AuthRequest) => ({ businessId: new mongoose.Types.ObjectId(req.user!.businessId) });
const scope = (req: AuthRequest) => ({ ...tenant(req), ...(!permissions(req).viewAll ? { createdBy: new mongoose.Types.ObjectId(req.user!.id) } : {}) });
const history = (req: AuthRequest, action: string, reason = '') => ({ action, reason, actorId: new mongoose.Types.ObjectId(req.user!.id), actorName: req.user!.name, at: new Date() });
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const handler = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
  try { await fn(req, res); } catch (e: any) { res.status(e.code === 11000 ? 409 : e.status || 400).json({ message: e.code === 11000 ? 'Duplicate expense. Refresh and retry.' : e.message }); }
};
const summary = (e: any) => {
  const paidMinor = e.payments.filter((p: any) => !p.reversedAt).reduce((sum: number, p: any) => sum + p.amountMinor, 0);
  return { ...e, paidMinor, outstandingMinor: e.status === 'approved' ? e.amountMinor - paidMinor : 0, paymentStatus: paidMinor === e.amountMinor ? 'paid' : paidMinor ? 'partially_paid' : 'unpaid' };
};
const payload = (b: any) => ({ title: b.title, category: b.category, dateKey: b.dateKey, payee: b.payee, reference: b.reference, notes: b.notes, currency: b.currency, amountMinor: minor(b.amount), receipt: b.receipt });

router.get('/meta', handler(async (req, res) => {
  const policy = await policyFor(req.user!.businessId);
  const shift = permissions(req).pay ? await POSShift.findOne({ ...tenant(req), status: 'open' }).select('shiftCode currency').lean() : null;
  res.json({ ...permissions(req), currency: policy.currency, currencies, categories, shift });
}));
const querySchema = Joi.object({
  page: Joi.number().integer().min(0).default(0), limit: Joi.number().integer().min(1).max(100).default(20),
  from: date, to: date, status: Joi.string().valid('draft', 'submitted', 'approved', 'rejected', 'cancelled'),
  category: text.max(80), search: text.max(120),
});
router.get('/', handler(async (req, res) => {
  const parsed = querySchema.validate(req.query, { stripUnknown: true });
  if (parsed.error) fail(parsed.error.message);
  const q = parsed.value;
  const filter: any = scope(req);
  if (q.from || q.to) filter.dateKey = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  if (q.status) filter.status = q.status;
  if (q.category) filter.category = q.category;
  if (q.search) { const regex = new RegExp(String(q.search).replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = ['title', 'payee', 'reference', 'createdByName'].map(f => ({ [f]: regex })); }
  const [rows, total, totals] = await Promise.all([
    Expense.find(filter).select('-receipt.data -history').sort({ dateKey: -1, _id: -1 }).skip(Number(q.page) * Number(q.limit)).limit(Number(q.limit)).lean(),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $set: { paidMinor: { $sum: { $map: { input: { $filter: { input: '$payments', as: 'p', cond: { $not: ['$$p.reversedAt'] } } }, as: 'p', in: '$$p.amountMinor' } } } } }, { $group: {
      _id: '$currency', approvedMinor: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amountMinor', 0] } },
      paidMinor: { $sum: '$paidMinor' }, pendingMinor: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, '$amountMinor', 0] } },
    } }]),
  ]);
  res.json({ rows: rows.map(summary), total, totals: totals.map(t => ({ currency: t._id, approvedMinor: t.approvedMinor, paidMinor: t.paidMinor, pendingMinor: t.pendingMinor, outstandingMinor: t.approvedMinor - t.paidMinor })) });
}));
router.get('/:id', handler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Expense not found', 404);
  const e = await Expense.findOne({ ...scope(req), _id: req.params.id }).lean();
  if (!e) fail('Expense not found', 404);
  res.json(summary(e));
}));
router.post('/', validate(Joi.object({ ...body, key: key.required() })), handler(async (req, res) => {
  const existing = await Expense.findOne({ ...tenant(req), key: req.body.key });
  if (existing) {
    if (String(existing.createdBy) !== req.user!.id || Object.entries(payload(req.body)).some(([k, v]) => JSON.stringify((existing.toObject() as any)[k] ?? null) !== JSON.stringify(v))) fail('Expense key already used for different details', 409);
    return res.json(summary(existing.toObject()));
  }
  const e = await Expense.create({ ...tenant(req), ...payload(req.body), key: req.body.key, createdBy: req.user!.id, createdByName: req.user!.name, history: [history(req, 'created')] });
  res.status(201).json(summary(e!.toObject()));
}));
router.put('/:id', validate(Joi.object({ ...body, version })), handler(async (req, res) => {
  const e = await Expense.findOneAndUpdate({ ...tenant(req), _id: req.params.id, createdBy: req.user!.id, status: { $in: ['draft', 'rejected'] }, version: req.body.version }, { $set: { ...payload(req.body), status: 'draft' }, $inc: { version: 1 }, $push: { history: history(req, 'edited') } }, { new: true });
  if (!e) fail('Expense changed or is no longer editable', 409);
  res.json(summary(e!.toObject()));
}));
router.post('/:id/decision', validate(Joi.object({ version, action: Joi.string().valid('submit', 'approve', 'reject', 'cancel').required(), reason: text.allow('').default('') })), handler(async (req, res) => {
  const { action, reason } = req.body;
  const review = ['approve', 'reject'].includes(action);
  if (review && !permissions(req).approve) fail('Expense approval permission required', 403);
  if (review && !reason.trim()) fail('Decision reason is required');
  const filter: any = { ...tenant(req), _id: req.params.id, version: req.body.version, status: { $in: action === 'submit' ? ['draft', 'rejected'] : action === 'cancel' ? ['draft', 'submitted', 'rejected'] : ['submitted'] } };
  filter.createdBy = review ? { $ne: new mongoose.Types.ObjectId(req.user!.id) } : new mongoose.Types.ObjectId(req.user!.id);
  const status = { submit: 'submitted', approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[action as string];
  const e = await Expense.findOneAndUpdate(filter, { $set: { status, ...(action === 'approve' ? { approvedBy: req.user!.id, approvedAt: new Date() } : {}) }, $inc: { version: 1 }, $push: { history: history(req, action, reason) } }, { new: true });
  if (!e) fail(review ? 'Expense changed, or requires another admin to review it' : 'Expense changed or cannot be updated', 409);
  res.json(summary(e!.toObject()));
}));

async function drawer(req: AuthRequest, session: mongoose.ClientSession, currency: string) {
  const shift = await POSShift.findOneAndUpdate({ ...tenant(req), status: 'open', currency }, { $inc: { activityVersion: 1 } }, { new: true, session });
  if (!shift) fail('Open a POS shift with the same business currency first', 409);
  return shift!;
}
router.post('/:id/payments', validate(Joi.object({ key: key.required(), version, amount: Joi.number().positive().max(1_000_000_000).precision(2).required(), dateKey: date.required(), method: Joi.string().valid('cash', 'bank', 'pos_drawer').required(), reference: text.min(1).max(120).required() })), handler(async (req, res) => {
  if (!permissions(req).pay) fail('Expense payment permission required', 403);
  const result = await mongoose.connection.transaction(async session => {
    const e = await Expense.findOne({ ...tenant(req), _id: req.params.id }).session(session);
    if (!e) fail('Expense not found', 404);
    const p = e!.payments.find(p => p.key === req.body.key);
    if (p) {
      if (p.amountMinor !== minor(req.body.amount) || p.method !== req.body.method || p.dateKey !== req.body.dateKey || p.reference !== req.body.reference) fail('Payment key already used for different details', 409);
      return summary(e!.toObject());
    }
    if (e!.status !== 'approved' || e!.version !== req.body.version) fail('Expense changed or is not approved', 409);
    const amountMinor = minor(req.body.amount);
    if (amountMinor > summary(e!.toObject()).outstandingMinor) fail('Payment exceeds outstanding balance');
    const shift = req.body.method === 'pos_drawer' ? await drawer(req, session, e!.currency) : null;
    e!.payments.push({ key: req.body.key, amountMinor, dateKey: req.body.dateKey, method: req.body.method, reference: req.body.reference, actorId: new mongoose.Types.ObjectId(req.user!.id), actorName: req.user!.name, ...(shift ? { shiftId: shift._id } : {}) });
    e!.version++; e!.history.push(history(req, 'payment', req.body.reference)); await e!.save({ session });
    return summary(e!.toObject());
  });
  res.json(result);
}));
router.post('/:id/payments/:paymentId/reverse', validate(Joi.object({ version, reason: text.min(1).required() })), handler(async (req, res) => {
  if (!permissions(req).pay) fail('Expense payment permission required', 403);
  const result = await mongoose.connection.transaction(async session => {
    const e = await Expense.findOne({ ...tenant(req), _id: req.params.id }).session(session);
    if (!e) fail('Expense not found', 404);
    const p = e!.payments.id(String(req.params.paymentId));
    if (!p) fail('Payment not found', 404);
    if (p!.reversedAt) return summary(e!.toObject());
    if (e!.version !== req.body.version) fail('Expense changed. Refresh and retry', 409);
    if (p!.method === 'pos_drawer') p!.reversalShiftId = (await drawer(req, session, e!.currency))._id;
    p!.reversedAt = new Date(); p!.reversedBy = new mongoose.Types.ObjectId(req.user!.id); p!.reversalReason = req.body.reason;
    e!.version++; e!.history.push(history(req, 'payment reversal', req.body.reason)); await e!.save({ session });
    return summary(e!.toObject());
  });
  res.json(result);
}));
export default router;
