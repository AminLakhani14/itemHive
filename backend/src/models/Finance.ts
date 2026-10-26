import mongoose, { Schema } from 'mongoose';
const tenant = { businessId: { type: Schema.Types.ObjectId, required: true } };
const integer = { type: Number, required: true, validate: Number.isSafeInteger, min: 0 };
const accountSchema = new Schema({
  ...tenant, code: { type: String, required: true }, name: { type: String, required: true },
  type: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
  parentId: Schema.Types.ObjectId, posting: { type: Boolean, default: true }, active: { type: Boolean, default: true },
  systemKey: String, version: { type: Number, default: 0 }, history: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });
accountSchema.index({ businessId: 1, code: 1 }, { unique: true });
accountSchema.index({ businessId: 1, systemKey: 1 }, { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } });
export const FinanceAccount = mongoose.model('FinanceAccount', accountSchema);
const policySchema = new Schema({ ...tenant, cutoverDate: { type: String, required: true }, lock: { type: Number, default: 0 }, initializedBy: Schema.Types.ObjectId }, { timestamps: true });
policySchema.index({ businessId: 1 }, { unique: true });
export const FinancePolicy = mongoose.model('FinancePolicy', policySchema);
const periodSchema = new Schema({ ...tenant, month: { type: String, required: true }, closed: { type: Boolean, default: false }, reason: String, actorId: Schema.Types.ObjectId, history: { type: [Schema.Types.Mixed], default: [] } }, { timestamps: true });
periodSchema.index({ businessId: 1, month: 1 }, { unique: true });
export const FinancePeriod = mongoose.model('FinancePeriod', periodSchema);
const lineSchema = new Schema({ accountId: { type: Schema.Types.ObjectId, required: true }, code: String, name: String, type: String, debitMinor: integer, creditMinor: integer }, { _id: false });
const journalSchema = new Schema({
  ...tenant, key: { type: String, required: true }, dateKey: { type: String, required: true }, currency: { type: String, required: true },
  description: { type: String, required: true }, source: { type: String, default: 'manual' }, sourceId: String,
  status: { type: String, enum: ['draft', 'submitted', 'posted', 'rejected', 'cancelled'], default: 'draft' },
  lines: { type: [lineSchema], required: true }, createdBy: { type: Schema.Types.ObjectId, required: true },
  postedBy: Schema.Types.ObjectId, postedAt: Date, reversalOf: Schema.Types.ObjectId, reversedBy: Schema.Types.ObjectId,
  version: { type: Number, default: 0 }, history: { type: [Schema.Types.Mixed], default: [] },
  openingLinks: Schema.Types.Mixed,
}, { timestamps: true });
journalSchema.index({ businessId: 1, key: 1 }, { unique: true });
journalSchema.index({ businessId: 1, status: 1, dateKey: 1 });
export const JournalEntry = mongoose.model('JournalEntry', journalSchema);
export const financeModels = [FinanceAccount, FinancePolicy, FinancePeriod, JournalEntry];
