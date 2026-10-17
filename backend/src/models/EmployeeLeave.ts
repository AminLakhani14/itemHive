import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export const LEAVE_TYPES = ['casual', 'sick', 'annual', 'unpaid', 'other'] as const;
export type LeaveType = typeof LEAVE_TYPES[number];

export interface IEmployeeLeave extends Document {
    fraction: number;
    payrollRequestId?: mongoose.Types.ObjectId;
    employeeId: mongoose.Types.ObjectId;
    /** Inclusive YYYY-MM-DD range. */
    startDate: string;
    endDate: string;
    leaveType: LeaveType;
    reason: string;
    createdBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const EmployeeLeaveSchema: Schema<IEmployeeLeave> = new Schema(
    {
        fraction: { type: Number, enum: [0.5, 1], default: 1 },
        payrollRequestId: { type: Schema.Types.ObjectId },
        employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        leaveType: { type: String, enum: LEAVE_TYPES, default: 'casual' },
        reason: { type: String, default: '', trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    },
    { timestamps: true }
);

EmployeeLeaveSchema.index({ businessId: 1, startDate: 1, endDate: 1 });
EmployeeLeaveSchema.index({ businessId: 1, employeeId: 1, startDate: 1 });

EmployeeLeaveSchema.plugin(branchScopedPlugin);
export default mongoose.model<IEmployeeLeave>('EmployeeLeave', EmployeeLeaveSchema);
