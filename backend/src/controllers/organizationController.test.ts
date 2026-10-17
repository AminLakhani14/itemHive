import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Business from '../models/Business';
import {
    branchAdminSchema,
    branchAdministratorsSchema,
    branchEmployeesSchema,
    departmentSchema,
    fiscalYearSchema,
} from './organizationController';

test('organization input schemas reject unsafe or incomplete records', () => {
    assert.ok(departmentSchema.validate({ name: 'H' }).error);
    assert.ok(fiscalYearSchema.validate({ name: 'FY 2027', startDate: '2027-07-01', endDate: '2027-06-30', isCurrent: false }).error);
    assert.ok(branchAdminSchema.validate({ name: 'Branch Admin', email: 'not-an-email', password: 'short' }).error);
    assert.ok(branchAdministratorsSchema.validate({ adminUserIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011'] }).error);
    assert.ok(branchEmployeesSchema.validate({ employeeIds: ['not-an-id'] }).error);
});

test('a business branch supports several administrators while retaining the legacy primary administrator', () => {
    const first = new mongoose.Types.ObjectId();
    const second = new mongoose.Types.ObjectId();
    const business = new Business({
        name: 'Client',
        slug: 'organization-test-client',
        branches: [{
            name: 'Main', location: 'Main Road', phone: '+92 300 1234567', city: 'Karachi',
            countryCode: 'PK', country: 'Pakistan', adminUserId: first, adminUserIds: [first, second],
        }],
        departments: [{ name: 'Finance', description: 'Finance team', isActive: true }],
        fiscalYears: [{ name: 'FY 2027', startDate: '2026-07-01', endDate: '2027-06-30', isCurrent: true }],
    });
    assert.equal(business.validateSync(), undefined);
    assert.deepEqual(business.branches[0].adminUserIds.map(String), [String(first), String(second)]);
    assert.equal(business.departments[0].name, 'Finance');
    assert.equal(business.fiscalYears[0].isCurrent, true);
});
