import mongoose, { type Model } from 'mongoose';
import Product from '../models/Product';
import Category from '../models/Category';
import InventoryMaterial from '../models/InventoryMaterial';
import InventoryRequest from '../models/InventoryRequest';
import InventoryRequestReceipt from '../models/InventoryRequestReceipt';
import InventoryVendors from '../models/InventoryVendors';
import Transaction from '../models/Transaction';
import POSShift from '../models/POSShift';
import OrderDraft from '../models/OrderDraft';
import Customer from '../models/Customer';
import CreditPayment from '../models/CreditPayment';
import InstallmentPlan from '../models/InstallmentPlan';
import Expense from '../models/Expense';
import DigitalMenu from '../models/DigitalMenu';
import StickyNote from '../models/StickyNote';
import Employee from '../models/Employee';
import Attendance from '../models/Attendance';
import EmployeeLeave from '../models/EmployeeLeave';
import { PayrollCommission, PayrollDayClaim, PayrollLoan, PayrollLoanMovement, PayrollPayment, PayrollRequest, PayrollRun } from '../models/Payroll';
import { acrossBranches } from './branchScope';

/** Every model that uses branchScopedPlugin. */
export const BRANCH_SCOPED_MODELS: Model<any>[] = [
    Product, Category, InventoryMaterial, InventoryRequest, InventoryRequestReceipt, InventoryVendors,
    Transaction, POSShift, OrderDraft, Customer, CreditPayment, InstallmentPlan, Expense, DigitalMenu,
    StickyNote, Employee, Attendance, EmployeeLeave,
    PayrollRun, PayrollDayClaim, PayrollPayment, PayrollRequest, PayrollLoan, PayrollLoanMovement, PayrollCommission,
] as Model<any>[];

/** Records saved before a business had branches belong to its main branch; this records that explicitly. */
export const adoptUnbranchedRecords = (businessId: mongoose.Types.ObjectId | string, mainBranchId: mongoose.Types.ObjectId | string) =>
    acrossBranches(async () => {
        const filter = { businessId: new mongoose.Types.ObjectId(String(businessId)), branchId: null };
        const update = { $set: { branchId: new mongoose.Types.ObjectId(String(mainBranchId)) } };
        await Promise.all(BRANCH_SCOPED_MODELS.map((model) => model.updateMany(filter, update).exec()));
    });
