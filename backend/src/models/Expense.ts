import mongoose, { Schema } from 'mongoose';

const PaymentSchema = new Schema({
  key: { type: String, required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  dateKey: { type: String, required: true },
  method: { type: String, enum: ['cash', 'bank', 'pos_drawer'], required: true },
  reference: { type: String, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  shiftId: { type: Schema.Types.ObjectId, ref: 'POSShift' },
  reversedAt: Date,
  reversalReason: String,
  reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reversalShiftId: { type: Schema.Types.ObjectId, ref: 'POSShift' },
}, { timestamps: true });
const HistorySchema = new Schema({
  action: { type: String, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  reason: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });
const ExpenseSchema = new Schema({
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
  key: { type: String, required: true },
  invoiceKey: String,
  accountId: { type: Schema.Types.ObjectId, ref: 'FinanceAccount' },
  journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  accountingOrigin: { type: String, enum: ['approval', 'opening'] },
  title: { type: String, required: true, maxlength: 120 },
  category: { type: String, required: true, maxlength: 80 },
  dateKey: { type: String, required: true },
  postingDateKey: String,
  payee: { type: String, default: '', maxlength: 120 },
  reference: { type: String, default: '', maxlength: 120 },
  notes: { type: String, default: '', maxlength: 1000 },
  currency: { type: String, required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'], default: 'draft' },
  version: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  receipt: { fileName: String, data: String },
  payments: { type: [PaymentSchema], default: [] },
  history: { type: [HistorySchema], default: [] },
}, { timestamps: true });
ExpenseSchema.index({ businessId: 1, key: 1 }, { unique: true });
ExpenseSchema.index({ businessId: 1, invoiceKey: 1 }, { unique: true, partialFilterExpression: { invoiceKey: { $type: 'string' } } });
ExpenseSchema.index({ businessId: 1, dateKey: -1, _id: -1 });
ExpenseSchema.index({ businessId: 1, createdBy: 1, status: 1 });
export default mongoose.model('Expense', ExpenseSchema);
