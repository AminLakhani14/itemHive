import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import { getUsers } from './userController';
import { buildTeamUsersPipeline } from '../utils/teamUsers';

const actorId = '507f1f77bcf86cd799439011';

test('combined column filters cannot widen an admin scope or inject regex expressions', () => {
    const pipeline = buildTeamUsersPipeline({
        actorId, actorRole: 'admin', account: 'a.*@mail', business: 'Pen & Paper', role: 'super_admin', userLimit: '0',
    });
    const stages = pipeline as Array<Record<string, any>>;
    const clauses = stages[0].$match.$and;
    assert.equal(clauses[0].createdBy.toHexString(), actorId);
    assert.equal(clauses[0].role, 'user');
    assert.ok(clauses.some((clause: Record<string, unknown>) => clause.role === 'super_admin'));
    const accountPattern = clauses.find((clause: Record<string, unknown>) => clause.$or).$or[0].name;
    const expression = new RegExp(accountPattern.$regex, accountPattern.$options);
    assert.ok(expression.test('a.*@mail'));
    assert.ok(!expression.test('anything@mail'));
    const businessFilter = stages.find((stage) => stage.$match?.['_teamBusiness.name']);
    assert.ok(new RegExp(businessFilter!.$match['_teamBusiness.name'].$regex).test('Pen & Paper'));
    const zeroLimit = clauses.find((clause: Record<string, unknown>) => clause.$expr);
    assert.equal(zeroLimit.role, 'admin');
    assert.deepEqual(zeroLimit.$expr.$eq, [{ $ifNull: ['$userCreationLimit', 0] }, 0]);
});

test('business grouping has a stable order in both directions and excludes stored password hashes', () => {
    for (const businessSort of ['asc', 'desc']) {
        const stages = buildTeamUsersPipeline({ actorId, actorRole: 'super_admin', businessSort, userLimit: '-' }) as Array<Record<string, any>>;
        const sort = stages.find((stage) => stage.$sort)!.$sort;
        assert.equal(sort._teamBusinessNameSort, businessSort === 'asc' ? 1 : -1);
        // Separate businesses with identical names still form distinct groups.
        assert.deepEqual(Object.keys(sort), ['_teamBusinessNameSort', 'businessId', '_teamAccountNameSort', '_id']);
        assert.deepEqual(stages[0].$match.$and, [{ role: { $ne: 'admin' } }]);
        const projection = stages[stages.length - 1].$project;
        assert.equal(projection.password, undefined);
        assert.equal(projection.visiblePassword, 1);
    }
});

test('sorting and column filters run before pagination and total count uses the same filtered set', async (t) => {
    let observed: Array<Record<string, any>> = [];
    t.mock.method(User, 'aggregate', async (pipeline: Array<Record<string, any>>) => {
        observed = pipeline;
        return [{ users: [], count: [] }];
    });
    // An empty result still runs the shared enrichment reads.
    const Business = (await import('../models/Business')).default;
    const AppSetting = (await import('../models/AppSetting')).default;
    const Employee = (await import('../models/Employee')).default;
    t.mock.method(Business, 'find', () => ({ select: async () => [] }));
    t.mock.method(AppSetting, 'find', () => ({ select: async () => [] }));
    t.mock.method(Employee, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
    let body: any;
    const res = { json: (value: unknown) => { body = value; }, status: () => res } as unknown as Response;
    const req = { user: { id: actorId, role: 'super_admin' }, query: { page: '2', limit: '10', business: 'ItemHive', role: 'user' } } as unknown as AuthRequest;
    await getUsers(req, res);
    const facetIndex = observed.findIndex((stage) => stage.$facet);
    assert.ok(observed.findIndex((stage) => stage.$sort) < facetIndex);
    assert.ok(observed.findIndex((stage) => stage.$match?.['_teamBusiness.name']) < facetIndex);
    assert.deepEqual(observed[facetIndex].$facet.users, [{ $skip: 10 }, { $limit: 10 }]);
    assert.deepEqual(observed[facetIndex].$facet.count, [{ $count: 'total' }]);
    assert.equal(body.total, 0);
    assert.deepEqual(body.users, []);
});

test('invalid role, limit and sort filters are rejected before querying users', async (t) => {
    const aggregate = t.mock.method(User, 'aggregate', async () => []);
    for (const query of [{ role: 'owner' }, { userLimit: '-1' }, { userLimit: '1.5' }, { userLimit: '9999999999999999999' }, { businessSort: '$where' }]) {
        let status = 200;
        const res = { status: (value: number) => { status = value; return res; }, json: () => {} } as unknown as Response;
        await getUsers({ user: { id: actorId, role: 'super_admin' }, query } as unknown as AuthRequest, res);
        assert.equal(status, 400);
    }
    assert.equal(aggregate.mock.callCount(), 0);
});
