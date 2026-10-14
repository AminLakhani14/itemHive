import { Router } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { protect, type AuthRequest } from '../middleware/auth';
import { financialAccess, canFinancial } from '../middleware/financialAccess';
import { validate } from '../middleware/validate';
import { FinanceAccount, FinancePeriod, FinancePolicy, JournalEntry } from '../models/Finance';
import { accountSeeds, financeTenant, lockFinance, snapshotLines, postSource, businessDate } from '../services/financeService';
import { policyFor } from '../services/payrollService';
import { validDate } from '../services/payrollCalculator';
import { openingCandidates, linkOpening } from '../services/openingBalances';

const router = Router(); router.use(protect);
const id = Joi.string().hex().length(24);
const text = Joi.string().trim().min(1).max(500);
const date = Joi.string().custom((v, h) => validDate(v) ? v : h.error('any.invalid'));
const currencies = ['PKR', 'USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'INR', 'AED'];
const tenant = (req: AuthRequest) => financeTenant(req.user!.businessId);
const handler = (fn: (req: AuthRequest, res: any) => Promise<unknown>) => async (req: AuthRequest, res: any) => {
  try { await fn(req, res); } catch (e: any) { res.status(e.code === 11000 ? 409 : e.status || 400).json({ message: e.code === 11000 ? 'Duplicate finance record. Refresh and retry.' : e.message }); }
};
const history = (req: AuthRequest, action: string) => ({ action, actorId: req.user!.id, at: new Date(), reason: req.body.reason || '' });
router.get('/opening-sources', financialAccess('finance_settings'), handler(async (req, res) => res.json({ ...await openingCandidates(req.user!.businessId), journals: await JournalEntry.find({ ...tenant(req), source: 'opening', status: 'posted', reversedBy: { $exists: false }, openingLinks: { $exists: false } }).select('dateKey currency description lines').lean() })));
router.post('/opening-sources', financialAccess('finance_settings'), validate(Joi.object({ journalId: id.required(), expenseIds: Joi.array().items(id).unique().max(500).required(), runIds: Joi.array().items(id).unique().max(500).required(), loanIds: Joi.array().items(id).unique().max(500).required(), reason: text.required() })), handler(async (req, res) => res.json(await linkOpening(req.user!.businessId, req.user!.id, req.body))));
router.get('/accounts', financialAccess('finance_accounts', 'finance_settings', 'finance_journal_prepare', 'finance_journal_approve', 'finance_journal_view', 'finance_reports'), handler(async (req, res) => {
  res.json({ accounts: await FinanceAccount.find(tenant(req)).sort({ code: 1 }).lean(), policy: await FinancePolicy.findOne(tenant(req)).select('-lock').lean() });
}));
router.post('/initialize', financialAccess('finance_settings'), validate(Joi.object({ cutoverDate: date.required(), reason: text.required() })), handler(async (req, res) => {
  if (req.body.cutoverDate > businessDate((await policyFor(req.user!.businessId)).timeZone)) throw new Error('Accounting starting date cannot be in the future');
  await mongoose.connection.transaction(async session => {
    if (await FinancePolicy.exists(tenant(req)).session(session)) throw new Error('Finance is already initialized; the starting date is fixed');
    await FinancePolicy.create([{ ...tenant(req), cutoverDate: req.body.cutoverDate, initializedBy: req.user!.id }], { session });
    const parents = new Map<string, mongoose.Types.ObjectId>();
    for (const seed of accountSeeds) {
      const [code, name, type, systemKey, posting, parentCode] = seed;
      const [a] = await FinanceAccount.create([{ ...tenant(req), code, name, type, posting, ...(systemKey ? { systemKey } : {}), ...(parentCode ? { parentId: parents.get(parentCode) } : {}), history: [history(req, 'created')] }], { session });
      parents.set(code, a._id);
    }
  }); res.status(201).json({ message: 'Finance initialized. Enter reviewed opening balances through an opening journal.' });
}));
const accountBody = { code: Joi.string().trim().pattern(/^[A-Za-z0-9.-]{1,20}$/).required(), name: text.max(120).required(), type: Joi.string().valid('asset', 'liability', 'equity', 'income', 'expense').required(), parentId: id.allow('', null).default(null), posting: Joi.boolean().required(), active: Joi.boolean().required(), reason: text.required() };
async function saveAccount(req: AuthRequest, editing: boolean) {
  return mongoose.connection.transaction(async session => {
    const policy = await FinancePolicy.findOneAndUpdate(tenant(req), { $inc: { lock: 1 } }, { new: true, session });
    if (!policy) throw new Error('Initialize finance first');
    const a = editing ? await FinanceAccount.findOne({ ...tenant(req), _id: req.params.id }).session(session) : new FinanceAccount(tenant(req));
    if (!a) throw new Error('Account not found');
    if (editing && a.version !== req.body.version) throw new Error('Account changed; refresh first');
    const used = editing && await JournalEntry.exists({ ...tenant(req), 'lines.accountId': a._id }).session(session);
    if (a.systemKey && (!req.body.active || !req.body.posting || req.body.type !== a.type || req.body.code !== a.code)) throw new Error('Control account code, type and posting status are protected');
    if (used && (req.body.type !== a.type || req.body.posting !== a.posting || req.body.code !== a.code)) throw new Error('Used account code, type and posting status cannot change');
    if (editing && (!req.body.active || req.body.type !== a.type || req.body.posting) && await FinanceAccount.exists({ ...tenant(req), parentId: a._id, active: true }).session(session)) throw new Error('A group with active children cannot be deactivated, retyped or made a posting account');
    let parent = req.body.parentId;
    const visited = new Set<string>([String(a._id)]);
    while (parent) {
      if (visited.has(String(parent))) throw new Error('Account hierarchy cannot contain a cycle');
      visited.add(String(parent));
      const p = await FinanceAccount.findOne({ ...tenant(req), _id: parent, active: true, type: req.body.type, posting: false }).session(session);
      if (!p) throw new Error('Parent must be an active group account of the same type');
      parent = p.parentId;
    }
    const { reason, version, ...body } = req.body;
    Object.assign(a, { ...body, parentId: req.body.parentId || undefined }); a.version++;
    a.history.push(history(req, editing ? 'updated' : 'created')); await a.save({ session }); return a;
  });
}
router.post('/accounts', financialAccess('finance_settings'), validate(Joi.object(accountBody)), handler(async (req, res) => res.status(201).json(await saveAccount(req, false))));
router.put('/accounts/:id', financialAccess('finance_settings'), validate(Joi.object({ ...accountBody, version: Joi.number().integer().min(0).required() })), handler(async (req, res) => res.json(await saveAccount(req, true))));
router.get('/journals', financialAccess('finance_journal_view', 'finance_journal_prepare', 'finance_journal_approve'), handler(async (req, res) => {
  const parsed = Joi.object({ from: date, to: date, status: Joi.string().valid('draft', 'submitted', 'posted', 'rejected', 'cancelled'), page: Joi.number().integer().min(0).default(0), limit: Joi.number().integer().min(1).max(100).default(20) }).validate(req.query);
  if (parsed.error) throw new Error(parsed.error.message);
  const q = parsed.value; if (q.from && q.to && q.from > q.to) throw new Error('Invalid date range');
  const filter = { ...tenant(req), ...(q.status ? { status: q.status } : {}), ...(q.from || q.to ? { dateKey: { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) } } : {}) };
  res.json({ rows: await JournalEntry.find(filter).sort({ dateKey: -1, _id: -1 }).skip(q.page * q.limit).limit(q.limit).lean(), total: await JournalEntry.countDocuments(filter) });
}));
router.post('/journals', financialAccess('finance_journal_prepare'), validate(Joi.object({
  key: text.required(), dateKey: date.required(), currency: Joi.string().valid(...currencies).required(), description: text.required(), opening: Joi.boolean().default(false),
  lines: Joi.array().items(Joi.object({ accountId: id.required(), debitMinor: Joi.number().integer().min(0).max(100_000_000_000).required(), creditMinor: Joi.number().integer().min(0).max(100_000_000_000).required() })).min(2).max(100).required(),
})), handler(async (req, res) => {
  const entry = await mongoose.connection.transaction(async session => {
    const existing = await JournalEntry.findOne({ ...tenant(req), key: 'manual:' + req.body.key }).session(session);
    if (existing) {
      const sameLines = JSON.stringify(existing.lines.map(l => ({ accountId: String(l.accountId), debitMinor: l.debitMinor, creditMinor: l.creditMinor }))) === JSON.stringify(req.body.lines);
      if (!sameLines || existing.dateKey !== req.body.dateKey || existing.currency !== req.body.currency || existing.description !== req.body.description || String(existing.createdBy) !== req.user!.id || (existing.source === 'opening') !== req.body.opening) throw new Error('Journal key already used for different details');
      return existing;
    }
    const policy = await lockFinance(req.user!.businessId, req.body.dateKey, session);
    if (req.body.opening && (!canFinancial(req, 'finance_settings') || req.body.dateKey !== policy.cutoverDate)) throw new Error('Opening journals require Finance Setup permission and the starting date');
    const lines = await snapshotLines(req.user!.businessId, req.body.lines, session, req.body.opening);
    const [j] = await JournalEntry.create([{ ...tenant(req), ...req.body, key: 'manual:' + req.body.key, source: req.body.opening ? 'opening' : 'manual', lines, createdBy: req.user!.id, history: [history(req, 'created')] }], { session }); return j;
  }); res.status(201).json(entry);
}));
router.put('/journals/:id', financialAccess('finance_journal_prepare'), validate(Joi.object({
  key: text.required(), dateKey: date.required(), currency: Joi.string().valid(...currencies).required(), description: text.required(), opening: Joi.boolean().default(false),
  lines: Joi.array().items(Joi.object({ accountId: id.required(), debitMinor: Joi.number().integer().min(0).max(100_000_000_000).required(), creditMinor: Joi.number().integer().min(0).max(100_000_000_000).required() })).min(2).max(100).required(),
  version: Joi.number().integer().min(0).required(), reason: text.required(),
})), handler(async (req, res) => {
  res.json(await mongoose.connection.transaction(async session => {
    const j = await JournalEntry.findOne({ ...tenant(req), _id: req.params.id, createdBy: req.user!.id, status: { $in: ['draft', 'rejected'] } }).session(session);
    if (!j || j.version !== req.body.version) throw new Error('Only your current draft/rejected journal can be edited');
    const policy = await lockFinance(req.user!.businessId, req.body.dateKey, session);
    if (req.body.opening && (!canFinancial(req, 'finance_settings') || req.body.dateKey !== policy.cutoverDate)) throw new Error('Opening journals require Finance Setup permission and starting date');
    j.lines = await snapshotLines(req.user!.businessId, req.body.lines, session, req.body.opening) as any;
    j.dateKey = req.body.dateKey; j.currency = req.body.currency; j.description = req.body.description; j.source = req.body.opening ? 'opening' : 'manual'; j.status = 'draft'; j.version++; j.history.push(history(req, 'edited')); await j.save({ session }); return j;
  }));
}));
router.post('/journals/:id/decision', financialAccess('finance_journal_prepare', 'finance_journal_approve'), validate(Joi.object({ version: Joi.number().integer().min(0).required(), action: Joi.string().valid('submit', 'post', 'reject', 'reverse', 'cancel').required(), reason: text.required(), dateKey: date.optional() })), handler(async (req, res) => {
  res.json(await mongoose.connection.transaction(async session => {
    const j = await JournalEntry.findOne({ ...tenant(req), _id: req.params.id }).session(session);
    if (!j || j.version !== req.body.version) throw new Error('Journal changed or not found');
    const action = req.body.action;
    if (action === 'reverse') {
      if (j.openingLinks) throw new Error('This opening journal is allocated to historical sources and cannot be reversed while those links are in use');
      if (!canFinancial(req, 'finance_journal_approve') || j.status !== 'posted' || j.reversedBy || !['manual', 'opening'].includes(j.source)) throw new Error('Reverse an unreversed manual/opening journal, or reverse its source document');
      if (!req.body.dateKey) throw new Error('Reversal date is required');
      if (req.body.dateKey < j.dateKey) throw new Error('Reversal date cannot precede the original accounting date');
      const reversal = await postSource({ businessId: req.user!.businessId, actorId: req.user!.id, key: `reverse:${j.key}`, dateKey: req.body.dateKey, currency: j.currency, description: req.body.reason, source: 'reversal', sourceId: String(j._id), lines: j.lines.map(l => ({ accountId: l.accountId, debitMinor: l.creditMinor, creditMinor: l.debitMinor })) }, session);
      reversal.reversalOf = j._id; await reversal.save({ session }); j.reversedBy = reversal._id;
    } else {
      if (!['manual', 'opening'].includes(j.source)) throw new Error('System journals are controlled by their source document');
      if (action === 'cancel') {
        if (!canFinancial(req, 'finance_journal_prepare') || String(j.createdBy) !== req.user!.id || j.status === 'posted' || j.status === 'cancelled') throw new Error('Only the preparer can cancel an unposted journal');
        j.status = 'cancelled';
      } else if (action === 'submit') {
        if (!canFinancial(req, 'finance_journal_prepare') || String(j.createdBy) !== req.user!.id || !['draft', 'rejected'].includes(j.status)) throw new Error('Only the preparer can submit a draft/rejected journal');
        j.status = 'submitted';
      } else {
        if (!canFinancial(req, 'finance_journal_approve') || j.status !== 'submitted' || String(j.createdBy) === req.user!.id) throw new Error('Another authorized admin must review a submitted journal');
        if (action === 'post') { await lockFinance(req.user!.businessId, j.dateKey, session); j.lines = await snapshotLines(req.user!.businessId, j.lines, session, j.source === 'opening') as any; j.status = 'posted'; j.postedBy = new mongoose.Types.ObjectId(req.user!.id); j.postedAt = new Date(); }
        else j.status = 'rejected';
      }
    }
    j.version++; j.history.push(history(req, action)); await j.save({ session }); return j;
  }));
}));
router.get('/reports', financialAccess('finance_reports'), handler(async (req, res) => {
  const p = Joi.object({ from: date.required(), to: date.required(), currency: Joi.string().valid(...currencies).required(), accountId: id.optional() }).validate(req.query);
  if (p.error) throw new Error(p.error.message); const q = p.value;
  if (q.from > q.to) throw new Error('Invalid date range');
  const base = { ...tenant(req), status: 'posted', currency: q.currency, dateKey: { $lte: q.to } };
  const rows = await JournalEntry.aggregate([{ $match: base }, { $unwind: '$lines' }, { $group: { _id: '$lines.accountId', code: { $last: '$lines.code' }, name: { $last: '$lines.name' }, type: { $last: '$lines.type' },
    openingMinor: { $sum: { $cond: [{ $lt: ['$dateKey', q.from] }, { $subtract: ['$lines.debitMinor', '$lines.creditMinor'] }, 0] } },
    debitMinor: { $sum: { $cond: [{ $gte: ['$dateKey', q.from] }, '$lines.debitMinor', 0] } }, creditMinor: { $sum: { $cond: [{ $gte: ['$dateKey', q.from] }, '$lines.creditMinor', 0] } },
    balanceMinor: { $sum: { $subtract: ['$lines.debitMinor', '$lines.creditMinor'] } },
  } }, { $sort: { code: 1 } }]);
  const ledger = q.accountId ? await JournalEntry.aggregate([{ $match: { ...base, dateKey: { $gte: q.from, $lte: q.to } } }, { $unwind: '$lines' }, { $match: { 'lines.accountId': new mongoose.Types.ObjectId(q.accountId) } }, { $sort: { dateKey: 1, _id: 1 } }, { $limit: 1001 }, { $project: { key: 1, dateKey: 1, description: 1, source: 1, sourceId: 1, lines: 1 } }]) : [];
  res.json({ rows, ledger: ledger.slice(0, 1000), ledgerTruncated: ledger.length > 1000, currency: q.currency, policy: await FinancePolicy.findOne(tenant(req)).select('-lock').lean() });
}));
router.get('/periods', financialAccess('finance_period_close', 'finance_period_reopen'), handler(async (req, res) => res.json(await FinancePeriod.find(tenant(req)).sort({ month: -1 }).lean())));
router.post('/periods', financialAccess('finance_period_close', 'finance_period_reopen'), validate(Joi.object({ month: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).required(), closed: Joi.boolean().required(), reason: text.required() })), handler(async (req, res) => {
  if (!canFinancial(req, req.body.closed ? 'finance_period_close' : 'finance_period_reopen')) throw Object.assign(new Error('This period action has not been shared with your account'), { status: 403 });
  res.json(await mongoose.connection.transaction(async session => {
    const policy = await FinancePolicy.findOneAndUpdate(tenant(req), { $inc: { lock: 1 } }, { new: true, session }); if (!policy) throw new Error('Initialize finance first');
    if (req.body.closed && await JournalEntry.exists({ ...tenant(req), status: { $in: ['draft', 'submitted', 'rejected'] }, dateKey: { $gte: req.body.month + '-01', $lte: req.body.month + '-31' } }).session(session)) throw new Error('Resolve unposted journals before closing this month');
    return FinancePeriod.findOneAndUpdate({ ...tenant(req), month: req.body.month }, { $set: { closed: req.body.closed, reason: req.body.reason, actorId: req.user!.id }, $push: { history: history(req, req.body.closed ? 'closed' : 'reopened') } }, { upsert: true, new: true, session });
  }));
}));
export default router;
