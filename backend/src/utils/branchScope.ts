import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose, { Schema } from 'mongoose';
import { branchAdminIds } from './branches';

/**
 * Branch-level data separation.
 *
 * A client business can run several shops (branches). Each shop keeps its own inventory, sales, customers,
 * staff and so on, while Team logins, permissions, departments, fiscal years and settings are shared.
 *
 * `protect` resolves the active branch for each request and runs the rest of the request in that branch's
 * scope. Models that use `branchScopedPlugin` then read and write only the active branch's records, so a
 * handler cannot show one shop's records in another by forgetting a filter.
 *
 * A record without a branch belongs to the business's main (first) branch. That covers records created
 * before the business had branches, and records of a business that still has none.
 */
type BranchMatch = mongoose.Types.ObjectId | { $in: Array<mongoose.Types.ObjectId | null> };

export interface BranchScope {
    /** Condition on `branchId`; undefined when nothing should be filtered. */
    match?: BranchMatch;
    /** Branch stamped on new records. */
    branchId: mongoose.Types.ObjectId | null;
}

const storage = new AsyncLocalStorage<BranchScope>();
export const runInBranchScope = <T>(scope: BranchScope, fn: () => T) => storage.run(scope, fn);
export const currentBranchScope = () => storage.getStore();

/** Runs `fn` with no branch filter, for screens that manage every branch. Await queries inside `fn`. */
export const acrossBranches = <T>(fn: () => Promise<T>) => storage.run({ branchId: null }, fn);

const QUERY_HOOKS = [
    'countDocuments', 'deleteMany', 'deleteOne', 'distinct', 'find', 'findOne', 'findOneAndDelete',
    'findOneAndReplace', 'findOneAndUpdate', 'replaceOne', 'updateMany', 'updateOne',
] as const;

export const branchScopedPlugin = (schema: Schema) => {
    if (!schema.path('branchId')) schema.add({ branchId: { type: Schema.Types.ObjectId, default: null, index: true } });
    schema.pre([...QUERY_HOOKS], function () {
        const scope = storage.getStore();
        if (!scope?.match) return;
        this.and([{ branchId: scope.match }]);
        // Mongoose fills defaults for paths an upsert does not set, so a new record's branch is set explicitly.
        const update = this.getUpdate() as Record<string, any> | null;
        if (!this.getOptions().upsert || !scope.branchId || !update || Array.isArray(update)) return;
        const isReplacement = !Object.keys(update).some((key) => key.startsWith('$'));
        if (isReplacement) {
            if (update.branchId == null) this.setUpdate({ ...update, branchId: scope.branchId });
        } else if (update.$set?.branchId === undefined && update.$setOnInsert?.branchId === undefined) {
            this.setUpdate({ ...update, $setOnInsert: { ...update.$setOnInsert, branchId: scope.branchId } });
        }
    });
    schema.pre('aggregate', function () {
        const match = storage.getStore()?.match;
        if (match) this.pipeline().unshift({ $match: { branchId: match } });
    });
    schema.pre('validate', function () {
        const branchId = storage.getStore()?.branchId;
        if (branchId && this.isNew && this.get('branchId') == null) this.set('branchId', branchId);
    });
    schema.pre('insertMany', function (docs: unknown) {
        const branchId = storage.getStore()?.branchId;
        if (!branchId) return;
        for (const doc of (Array.isArray(docs) ? docs : [docs]) as Array<{ branchId?: unknown }>) {
            if (doc && doc.branchId == null) doc.branchId = branchId;
        }
    });
};

const toId = (id: string) => new mongoose.Types.ObjectId(id);

/** Matches one branch's records. The main branch also owns records without a branch. */
export const branchMatch = (branchId: string, mainBranchId: string): BranchMatch =>
    branchId === mainBranchId ? { $in: [null, toId(branchId)] } : toId(branchId);

export interface BranchAccess {
    mainBranchId: string;
    /** Branches this login may work in, main branch first when allowed. */
    branchIds: string[];
    activeBranchId: string;
}

interface BranchActor { id: string; role: string; branchId?: unknown }

/**
 * Super admins and administrators without branch assignments may use every branch. An administrator
 * assigned to branches uses only those. Staff work in their own branch, or the main branch if it has none.
 */
export const resolveBranchAccess = (business: { branches?: any[] } | null | undefined, actor: BranchActor, requestedBranchId = ''): BranchAccess | null => {
    const allIds = (business?.branches || []).map((branch: any) => String(branch._id));
    if (!allIds.length) return null;
    let branchIds = allIds;
    if (actor.role === 'admin') {
        const assigned = (business!.branches || []).filter((branch: any) => branchAdminIds(branch).includes(actor.id)).map((branch: any) => String(branch._id));
        if (assigned.length) branchIds = assigned;
    } else if (actor.role !== 'super_admin') {
        const own = actor.branchId ? String(actor.branchId) : '';
        branchIds = [allIds.includes(own) ? own : allIds[0]];
    }
    return {
        mainBranchId: allIds[0],
        branchIds,
        activeBranchId: branchIds.includes(requestedBranchId) ? requestedBranchId : branchIds[0],
    };
};

/** The scope for one branch, or read-only access to every allowed branch at once. */
export const buildBranchScope = (access: BranchAccess, allBranches = false): BranchScope => {
    if (!allBranches) {
        return { match: branchMatch(access.activeBranchId, access.mainBranchId), branchId: toId(access.activeBranchId) };
    }
    const ids: Array<mongoose.Types.ObjectId | null> = access.branchIds.map(toId);
    if (access.branchIds.includes(access.mainBranchId)) ids.push(null);
    return { match: { $in: ids }, branchId: null };
};
