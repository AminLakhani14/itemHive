import mongoose, { Model } from 'mongoose';
import Product from '../models/Product';
import Transaction from '../models/Transaction';
import InstallmentPlan from '../models/InstallmentPlan';
import CreditPayment from '../models/CreditPayment';
import InventoryRequest from '../models/InventoryRequest';
import StickyNote from '../models/StickyNote';
import User from '../models/User';
import AppSetting from '../models/AppSetting';
import Business from '../models/Business';
import Customer from '../models/Customer';
import Category from '../models/Category';
import POSShift from '../models/POSShift';
import OrderDraft from '../models/OrderDraft';
import Employee from '../models/Employee';
import InventoryMaterial from '../models/InventoryMaterial';
import InventoryVendors from '../models/InventoryVendors';
import { PayrollRun } from '../models/Payroll';
import { ensureLegacyBusiness } from './tenancy';
import { adoptUnbranchedRecords } from './branchData';

const dropLegacyIndex = async (model: Model<unknown>, indexName: string) => {
    const indexes = await model.collection.indexes().catch((error: { codeName?: string }) => {
        if (error.codeName === 'NamespaceNotFound') return [];
        throw error;
    });
    if (indexes.some((index) => index.name === indexName)) {
        await model.collection.dropIndex(indexName);
    }
};

export const ensureTenantIndexes = async () => {
    if (mongoose.connection.readyState !== 1) return;

    const legacyBusiness = await ensureLegacyBusiness();
    const missingBusiness = { $or: [{ businessId: { $exists: false } }, { businessId: null }] };
    const legacyBusinessUpdate = { $set: { businessId: legacyBusiness._id } };

    await Promise.all([
        Product.updateMany(missingBusiness, legacyBusinessUpdate),
        Transaction.updateMany(missingBusiness, legacyBusinessUpdate),
        CreditPayment.updateMany(missingBusiness, legacyBusinessUpdate),
        InstallmentPlan.updateMany(missingBusiness, legacyBusinessUpdate),
        InventoryRequest.updateMany(missingBusiness, legacyBusinessUpdate),
        StickyNote.updateMany(missingBusiness, legacyBusinessUpdate),
        User.updateMany(missingBusiness, legacyBusinessUpdate),
        AppSetting.updateMany(missingBusiness, legacyBusinessUpdate),
    ]);

    const businesses = await Business.find().select('_id name');
    await Promise.all(
        businesses.map((business) =>
            Product.updateMany(
                {
                    businessId: business._id,
                    $or: [{ businessName: { $exists: false } }, { businessName: '' }, { businessName: null }],
                },
                { $set: { businessName: business.name } }
            )
        )
    );

    await dropLegacyIndex(Product, 'id_1');
    await dropLegacyIndex(Product, 'sku_1');
    await dropLegacyIndex(Transaction, 'id_1');
    await dropLegacyIndex(InstallmentPlan, 'planCode_1');
    // Replaced by a partial index so employees added from Team can have a blank CNIC.
    await dropLegacyIndex(Employee as unknown as Model<unknown>, 'businessId_1_cnic_1');

    // Branches of one business keep separate records, so these unique values repeat across branches.
    // Records saved before a business had branches are given its main branch first.
    const branchedBusinesses = await Business.find({ 'branches.0': { $exists: true } }).select('branches._id')
        .lean<Array<{ _id: mongoose.Types.ObjectId; branches: Array<{ _id: mongoose.Types.ObjectId }> }>>();
    for (const business of branchedBusinesses) await adoptUnbranchedRecords(business._id, business.branches[0]._id);
    await Promise.all([
        Product.collection.createIndex({ businessId: 1, branchId: 1, id: 1 }, { unique: true }),
        Product.collection.createIndex({ businessId: 1, branchId: 1, sku: 1 }, { unique: true }),
        Category.collection.createIndex({ businessId: 1, branchId: 1, normalizedName: 1 }, { unique: true }),
        InventoryMaterial.collection.createIndex({ businessId: 1, branchId: 1, nameKey: 1, unitKey: 1 }, { unique: true }),
        Customer.collection.createIndex({ businessId: 1, branchId: 1, cnic: 1 }, { unique: true }),
        InventoryVendors.collection.createIndex({ businessId: 1, branchId: 1 }, { unique: true }),
        POSShift.collection.createIndex({ businessId: 1, branchId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } }),
        PayrollRun.collection.createIndex({ businessId: 1, branchId: 1, month: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: 'regular' } }),
    ]);
    for (const [model, indexName] of [
        [Product, 'businessId_1_id_1'], [Product, 'businessId_1_sku_1'], [Category, 'businessId_1_normalizedName_1'],
        [InventoryMaterial, 'businessId_1_nameKey_1_unitKey_1'], [Customer, 'businessId_1_cnic_1'], [InventoryVendors, 'businessId_1'],
        [POSShift, 'businessId_1_status_1'], [PayrollRun, 'businessId_1_month_1_kind_1'],
    ] as const) await dropLegacyIndex(model as unknown as Model<unknown>, indexName);

    await Transaction.collection.createIndex({ businessId: 1, id: 1 }, { unique: true });
    await InstallmentPlan.collection.createIndex({ businessId: 1, planCode: 1 }, { unique: true });

    // Match the actual tenant-scoped read patterns. These are compound indexes
    // so MongoDB can filter and sort without scanning an entire collection.
    await Promise.all([
        Product.collection.createIndex({ businessId: 1, name: 1 }),
        Product.collection.createIndex({ businessId: 1, category: 1 }),
        Transaction.collection.createIndex({ businessId: 1, timestamp: -1 }),
        Transaction.collection.createIndex({ businessId: 1, type: 1, timestamp: -1 }),
        Transaction.collection.createIndex({ businessId: 1, paymentMethod: 1, type: 1, timestamp: -1 }),
        Transaction.collection.createIndex({ businessId: 1, shiftId: 1, source: 1, type: 1 }),
        // Checkout idempotency looks up these fields before and after a sale.
        Transaction.collection.createIndex({ businessId: 1, orderId: 1, source: 1, id: 1 }),
        CreditPayment.collection.createIndex({ businessId: 1, timestamp: -1 }),
        CreditPayment.collection.createIndex({ businessId: 1, customerName: 1, customerCnic: 1, timestamp: -1 }),
        CreditPayment.collection.createIndex({ businessId: 1, shiftId: 1 }),
        Customer.collection.createIndex({ businessId: 1, updatedAt: -1 }),
        InstallmentPlan.collection.createIndex({ businessId: 1, createdAt: -1 }),
        InstallmentPlan.collection.createIndex({ businessId: 1, 'schedule.shiftId': 1 }),
        InventoryRequest.collection.createIndex({ businessId: 1, createdAt: -1 }),
        InventoryRequest.collection.createIndex({ businessId: 1, requestedBy: 1, createdAt: -1 }),
        InventoryRequest.collection.createIndex({ businessId: 1, requestedBy: 1, status: 1, 'productData.sku': 1 }),
        StickyNote.collection.createIndex({ businessId: 1, user: 1, pinned: -1, updatedAt: -1 }),
        POSShift.collection.createIndex({ businessId: 1, closedAt: -1 }),
        OrderDraft.collection.createIndex({ businessId: 1, updatedAt: -1 }),
    ]);
};
