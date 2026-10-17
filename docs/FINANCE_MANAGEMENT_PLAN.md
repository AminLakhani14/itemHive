# ItemHive finance management implementation plan

Status: the initial expense register is implemented at `/expenses` and `/api/expenses`: personal submissions, receipts, independent admin review, partial payments, reversals, audit history and POS drawer paid-outs/refunds. The broader accounting and finance design below remains proposed; no shared ledger or financial statements are implemented.
Prepared: 6 October 2026.

## 1. Objective and proposed defaults

Build a tenant-scoped finance module that connects sales, customer collections, inventory purchases, expenses, payroll, employee reimbursements, loans, and cash/bank movements through one auditable ledger. Users must be able to explain profit, balances, outstanding debts, and cash movements from their source documents.

Proposed defaults, subject to business configuration before activation:

- Accrual accounting for the ledger, with separate cash movement and cash flow reports.
- One functional currency per business in the initial release. Support the decimal precision of that currency; activate only when it matches payroll and the currency confirmed for existing sales. No currency inferred from a user's display preferences.
- Business timezone, fiscal year, monthly accounting periods, configurable expense categories and chart of accounts.
- Another authorized person approves expenses, bills, reimbursements, and manual journals; configurable value thresholds can add a second approval. System postings follow approved source workflows.
- Cash, bank, petty cash, card clearing, and delivery-platform clearing accounts stay separate. Salary and expense payments do not affect POS drawers unless explicitly recorded against an authorized open drawer.
- No live bank transfer, statutory tax calculation/filing, multi-currency revaluation, or consolidated multi-business accounting in the initial scope. Track configured tax amounts and provide exports; jurisdiction-specific rules need a separate requirements decision.

Finance should remain disabled per business until account mappings, opening balances, permissions, and a reviewed cutover are complete.

## 2. Current application and integration gaps

The checkout contains `Transaction`, `CreditPayment`, `InstallmentPlan`, `POSShift`, product purchase costs, payroll workflows and the initial expense register. A shared accounting ledger is still pending.

| Existing area | Reuse | Required finance work |
| --- | --- | --- |
| POS and Order Desk | Sale lines, discounts, tax, salesperson, source, order/shift references | Immutable invoice/payment snapshots, grouped order postings, reversals and settlement allocation |
| Customer credit | Credit sales and collection records | Stable customer IDs, invoice allocation, aging, credits and refund allocation |
| Installments | Sale, advance, schedule and payments | Post the sale once; each collection reduces receivables; preserve payment event identity |
| Products/inventory | Stock movements and purchase costs | Supplier identities, purchase documents, receipt costs, valuation policy and COGS reconciliation |
| POS shifts | Opening float, collections, final report and cash differences | Drawer movement ledger, transfers, paid-outs and controlled variance postings |
| HR/payroll | Approved run snapshots, salary payments, loans and recoveries | Salary accrual, liabilities, employee loan balances, payment/reversal accounting |
| Existing reports | Operational sales and stock reports | Financial reports based on posted journals and explicit reconciliation to operational reports |

Important source constraints: POS checkouts create multiple sale lines, while `paidNow` and `dueAmount` are stored on the first line. Finance must group complete orders and record collections once. Customer credit currently identifies customers with name/CNIC; migration must establish stable IDs without silently merging people. Inventory additions are not sufficient evidence of a supplier bill or payment. Existing transaction deletion must become source cancellation with compensating accounting entries after cutover.

## 3. User-facing modules

| Module | Required capabilities |
| --- | --- |
| Finance dashboard | Revenue, COGS, gross/net profit, operating expenses, cash/bank balances, receivables, payables, salary payable, overdue bills, approval queue and budget alerts; drill down to journals/documents |
| Expenses | Categories, vendor/payee, line items, date, due date, department/cost center, project, attachments, tax, recurring templates, approval, partial payment, refunds and reversals |
| Employee claims | Employee submits receipts; manager/finance reviews; duplicate receipt checks; approved reimbursement payable; reimbursement payment and history |
| Suppliers and bills | Supplier profile, terms, bills, credit notes, outstanding balances, payment allocation, statements, aging and purchase/receipt links |
| Sales and receivables | Finance invoice view linked to POS/Order Desk, customer statements, allocations, aging, refunds, credit notes and authorized write-offs |
| Cash and bank | Accounts, deposits, withdrawals, petty cash, owner contributions/drawings, transfers, card/platform settlements, fees and statement reconciliation |
| Payroll accounting | Approved salary expense/liability, salary settlement, employer costs, employee loans/advances, recoveries and reversal reconciliation |
| General ledger | Chart of accounts, journal drill-down, manual journals, controlled adjustments, opening balances, reversals and trial balance |
| Budgets | Monthly/yearly budgets by account/category/department; warning or controlled block on over-budget approval; actual, committed and forecast amounts shown separately |
| Fixed assets | Capital purchase register, asset class, useful life, depreciation schedules, disposal and linked entries; policies configured by the business |
| Period close | Reconciliation checklist, unresolved posting queue, inventory/payroll checks, lock/reopen with permission and audit |
| Reports | Financial statements, cash flows, expense analysis, aging, settlement/reconciliation, payroll cost, budget variance and audit exports |
| Settings and audit | Fiscal/calendar settings, mappings, approval thresholds, numbering, retention, attachment access, opening balances and complete change history |

Navigation: Finance -> Overview, Expenses, Employee Claims, Suppliers & Bills, Receivables, Cash & Bank, Journals, Budgets, Assets, Reports, Period Close, Settings. Employees receive My Expenses alongside My Payroll. Existing POS and payroll pages keep their workflows and link to finance details when authorized.

## 4. Expense workflow in detail

Support rent, utilities, internet, supplies, marketing, repairs, travel, delivery/platform fees, professional services and miscellaneous expenses. Salary costs originate from payroll; inventory purchases and capital assets use their dedicated document types to prevent duplicate expense recognition.

Expense fields:

- Business ID, document number, version, creator and responsible employee.
- Expense date, posting date, due date, currency, supplier/payee and optional supplier invoice number.
- Lines with description, category/account, quantity, unit amount, discount, tax code/amount, net and gross amounts, department/project and attachment references.
- Payment account/method, references and allocated amounts on separate payment records.
- Status, approval history, reason, recurrence source, journal references and reversal/correction links.

Lifecycle: draft -> submitted -> approved and posted, or returned/rejected. Payment status is computed separately as unpaid, partially paid or paid. A paid expense is still subject to a controlled refund/reversal, not editable history.

Rules:

1. Drafts can be edited or removed; submitted documents require return before editing. Any substantive edit clears previous approvals.
2. Validate active accounts, line totals, attachment policy, approval threshold, duplicate supplier invoice and budget policy on submission and again on approval.
3. Approving an accrued expense records the expense and payable. Paying it reduces the payable. An approved immediate payment can atomically record both steps.
4. Payment requires its own permission and a confirmed funding account. Approval never means money has moved at the bank.
5. Support multiple payments, one payment allocated to multiple bills, prepayments and supplier credits. Block over-allocation and stale concurrent payment requests.
6. Preserve posting snapshots. Corrections use linked credit/reversal documents; a supplier refund must clear the relevant credit or refund receivable rather than create new income.
7. Recurring templates generate drafts using a unique template/period key. They do not automatically approve or pay.
8. Attachments use private tenant-scoped storage, file-type/size validation, malware scanning where available, signed short-lived access and an audit trail. Employees can access only their own claims.
9. A simplified petty-cash form may capture a receipt and amount, but must use the same approval, posting and drawer rules.

## 5. Accounting foundation and posting rules

Every posted journal has balanced debit and credit amounts, business/date/period/currency, source document and event identity, immutable lines, creator/poster and reversal references. Store exact money in validated integer minor units, with deterministic decimal conversion and rounding. Inventory quantities and unit-cost precision are handled separately from currency totals.

Seed configurable accounts for cash, bank, petty cash, card/platform clearing, customer receivables, inventory, supplier payables, salary payable, employee loans/advances, configured tax control accounts, owner equity/drawings, sales, discounts/returns, COGS, payroll and operating expenses. Protected control-account mappings cannot be removed while in use.

| Event | Debit | Credit | Guard |
| --- | --- | --- | --- |
| Completed sale | Cash/card clearing and/or customer receivable | Net sales and configured sales-tax liability | One sale posting per source order; commission is not another sales posting |
| Stock sold | COGS | Inventory | Use sale-time valuation snapshot; pair with sale without guessing from current product price |
| Credit/installment collection | Cash/card clearing | Customer receivable | Never record revenue again; allocate to invoice/installment obligation |
| Return/refund | Sales returns and appropriate tax adjustment | Customer credit/refund payable, receivable reduction or cash, as applicable | Link original quantities/amounts; restore inventory/COGS only for accepted physical returns |
| Expense approval | Expense and configured eligible input-tax account | Expense/supplier payable | Approved immutable lines |
| Expense/bill payment | Payable | Cash/bank | Ledger allocations reconcile to outstanding balance |
| Inventory receipt before bill | Inventory | Goods received not invoiced | Matched receipt; invoice later clears accrual and records tax/price variance |
| Matched supplier inventory bill | Receipt accrual and applicable tax/variance | Supplier payable | No second inventory recognition; direct receipt-and-bill path posts once |
| Payroll approval | Salary/employer-cost expense | Salary payable and deduction liabilities; employee-loan asset for recovery | Mapping reconciles gross, net, employer cost and each deduction without duplicating commissions |
| Salary payment | Salary payable | Cash/bank | Existing payroll payment record is the settlement source |
| Employee loan disbursement | Employee loan receivable | Cash/bank | Approval alone posts no disbursement |
| Employee loan repayment | Cash/bank | Employee loan receivable | Payroll recovery uses the payroll accrual entry instead |
| Transfer | Destination cash/bank account | Source cash/bank account | No income/expense; represent in-transit clearing when settlement dates differ |
| Card/platform settlement | Bank and fees/withholding receivables as configured | Card/platform clearing | Match settled transactions; fees do not reduce recorded gross sales |
| Owner contribution/drawing | Cash/bank or owner drawing | Equity or cash/bank | Not sales or operating expense |
| Depreciation | Depreciation expense | Accumulated depreciation | Unique asset/period posting |

Treat customer deposits, supplier/employee advances, prepaid expenses, external loans, interest and bad-debt write-offs through configured asset/liability/expense accounts. Do not assume every cash inflow is income or every outflow is an expense.

Business must choose and validate inventory valuation before activation. Proposed default is perpetual moving weighted average unless an existing verified costing policy is retained. Define opening cost layers, returns, backdated receipts, negative-stock restrictions, freight allocation and rounding; stock quantity and inventory ledger value must reconcile.

## 6. POS, HR and payroll boundaries

- Draft orders and KOT printing create no finance postings.
- Checkout, inventory movement, commission and finance event creation share the source transaction. Retries return the existing result before stock validation and never post twice.
- A POS opening float is an existing cash balance or transfer, not new income each shift. Shift closure is a reconciliation snapshot, not another sale.
- Paid-outs require an expense/payment or an authorized transfer and an open shift reference. Update the drawer activity version atomically; retain frozen closed-shift reports. Correct closed-shift errors using linked later adjustments.
- Payroll approval posts the approved salary snapshot once. Salary payments settle that liability and payment reversals restore it. HR data changes do not rewrite posted salary expense.
- POS commissions remain tracked by payroll; recognize them through the agreed payroll accrual policy, with disclosure of earned-but-unapproved amounts. If month-end accrual is introduced, reverse it when payroll posts to prevent double expense.
- Employee reimbursements enter through claims, not untracked salary edits. Optional payroll settlement requires explicit linking and must consume the reimbursement payable without recognizing the expense again.
- Payroll/employee advance balances have one authoritative subledger. Finance journals mirror its approved movements rather than creating a second independent loan balance.

## 7. Data model and API design

Tenant-scoped models:

- `FinancePolicy`, `FinanceAccount`, `FinancePeriod`, `FinanceCostCenter`, `FinanceProject`.
- `JournalEntry` with immutable lines, source/event key, status, posting snapshot and reversal links.
- `Expense`, `ExpenseCategory`, `RecurringExpenseTemplate`, `EmployeeExpenseClaim`, `FinanceAttachment`.
- `Supplier`, `SupplierBill`, `SupplierCredit`, `PurchaseOrder`, `GoodsReceipt`; match received/billed/returned quantities.
- `FinanceInvoice` projection, `CustomerCredit`, `FinancePayment`, `PaymentAllocation`, `AccountTransfer`.
- `BankStatementImport`, `BankStatementLine`, `Reconciliation`, `SettlementBatch`, `DrawerMovement`.
- `FinanceBudget`, `FixedAsset`, `DepreciationRun`, `FinanceAudit`, `FinanceEvent`, `FinanceMigration`.

Use references to existing customer/employee/product/source IDs and preserve source snapshots; avoid relying on mutable display names. Materialized balances are rebuildable caches, never the financial source of truth. Expense and supplier bills share payable services so one economic obligation cannot be represented and paid twice.

API groups under `/api/finance`: settings, accounts, periods, expenses, claims, suppliers, bills, credits, receivables, payments, allocations, transfers, statements, reconciliation, settlements, journals, budgets, assets, reports and audit. Explicit actions cover submit, approve, return, post, reverse, reconcile, close and reopen. Personal claim APIs use `/api/me/expenses` and derive employee identity from authentication.

Use validated request schemas, pagination, server-side report filters, optimistic versions and idempotency keys on financial transitions. Unique indexes include business plus document number and business plus source/event identity. Version approval policies and preserve the applied policy on submitted documents.

## 8. Reliability, permissions and audit

- Strict business filtering on every query, reference lookup, upload/download, export and background job. No cross-business joins; super-admin access still requires a selected business.
- Separate permissions: `finance_view`, `finance_expense_create`, `finance_expense_approve`, `finance_pay`, `finance_receivables`, `finance_suppliers`, `finance_reconcile`, `finance_journal_prepare`, `finance_journal_approve`, `finance_budget`, `finance_assets`, `finance_reports`, `finance_settings`, `finance_period_close`, `finance_period_reopen`, `finance_audit`.
- Existing unrestricted admin access does not silently grant financial approval/payment rights. Existing source operations must not require a new finance permission merely to emit mapped system entries.
- MongoDB replica-set transactions protect document transitions, payments, allocations and ledger entries. Period locking must be checked atomically against posting and close to prevent racing backdated entries.
- Automatic postings use a transactional event/outbox record. If async processing is chosen, source success may leave a visible pending finance event; show pending/failed counts, retry idempotently, and block period close until drained. Reports disclose their posting watermark.
- Posted journals/documents cannot be hard-deleted. Reversals reference originals, with reason and user/time; closed-period corrections use an authorized open period.
- Audit policy changes, approvals, rejection/return, posting, payment, allocation, reversal, reconciliation, exports, migration and period reopening. Protect account/bank/receipt data by permission.
- Limit manual direct posting to control accounts; require source-linked settlement or approved adjustment. Restrict changes to reconciled entries.
- Define backup/restore procedures and validate a restore before release. Retention and document evidence policy must be configured for the business.

## 9. Reports and reconciliation

Required reports: profit and loss; balance sheet; trial balance; general ledger; cash flow; cash/bank books; expense register and category/vendor/department analysis; supplier/customer statements and aging; receivables/payables; payroll expense/payable/loan reconciliation; inventory valuation/COGS; budget variance; assets/depreciation; configured tax-control summaries; settlement fees; bank reconciliation; source posting exceptions; audit.

Define each report's basis, date range, timezone, currency, draft/posted status, opening balance, period movements and closing balance. Support PDF/print and CSV/Excel with server-side pagination or bounded background exports. Monetary totals come from posted journal lines and reconcile to drill-down data; never combine accrued expenses and their payments as two costs.

Month-end checks: all source events posted; debit/credit trial balance balances; cash/bank balances reconciled; card/platform outstanding settlements explained; AR/AP allocations reconciled; payroll payable and loan balances match payroll; inventory quantity/value and COGS reconcile; accruals/prepayments/depreciation reviewed; source cancellations processed. Close locks the period. Reopen requires dedicated permission, reason, audit and rerunning the close checks.

## 10. Migration and activation

1. Inventory and reconcile existing sales, customer balances, installments, payroll payments, employee loans, stock quantity/cost and shift cash. Produce a dry-run exception report.
2. Confirm business currency/timezone and establish supplier/customer identities. Preserve duplicates for review rather than guessing merges.
3. Choose a cutover date. Recommended: reviewed opening trial balance plus itemized open AR/AP, unsettled card/platform amounts, unpaid approved salary, employee loans, inventory and assets. Historical sources remain visible but are not automatically recognized again.
4. Define a single cash authority: if opening cash includes historical collections/payroll payments, do not replay them. Unpaid approved payroll must establish an opening liability with an explicit link so later payment settles it exactly once.
5. Allow optional historical backfill only as a separately reviewed dry run with complete source/cost evidence. Report missing grouping, costs, allocations or identities; block ambiguous auto-posting. Never combine overlapping backfill and opening balances.
6. Store tenant/cutover/version manifest, mapping and source fingerprints. Migration must be transactional where possible, checkpointed, resumable and idempotent. Repeated imports cannot duplicate balances or journals.
7. Test shadow postings in a disposable environment, compare totals, then activate per business. Legacy unscoped data is quarantined until business ownership is established.
8. Before any production migration: create a backup, review concrete dry-run totals and exceptions, and obtain approval for that business's cutover. Before live posting rollback, disable new intake and resolve pending events; reverse posted entries instead of deleting them.

## 11. Implementation phases and completion gates

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 1. Source audit and specification | Confirm default policies, source contracts, tax/account mappings, document identities and cutover design | Representative sale, collection, payroll and inventory events map to balanced expected entries |
| 2. Ledger foundation | Models, exact money, periods, accounts, posting/reversal service, permissions, audit and outbox | Tenant/concurrency/idempotency/period-lock tests pass; trial balance and rebuild match |
| 3. Expenses and claims | Categories, attachments, approval, recurrence, payments, refunds and employee portal | Browser walkthrough reconciles claim/expense -> payable -> partial/full payment -> reversal |
| 4. Cash, bank and settlements | Funding accounts, transfers, petty cash, drawer events, statement import/reconciliation, card/platform fees | Cash books and shift/bank reconciliation agree without duplicated opening floats |
| 5. Sales and receivables | POS/Order Desk events, grouped invoices, credit/installment allocations, returns and write-offs | Multi-line sales post once; collections reduce receivables; retry/refund tests preserve stock and balances |
| 6. Purchasing and inventory | Suppliers, purchase orders, receipts, bills/credits, payment allocations and valuation | Receipt/bill timing, returns, price variances, quantities and COGS reconcile |
| 7. Payroll and HR accounting | Salary approval/payment/reversal, loans, commissions and optional reimbursement settlement | Approved payroll snapshots, liability, cash and loan balances reconcile exactly |
| 8. Planning and assets | Budgets, accruals/prepayments, fixed assets, depreciation and period close | No double accrual; recurring and depreciation retries post once; close/reopen controls hold |
| 9. Reports and rollout | All reports/exports, migration tooling, monitoring, recovery and business pilot | Automated tests/builds plus authenticated browser acceptance, reviewed opening balance, restore check and first close pass |

Phases 1-3 provide an initial expense module with accounting foundations. The complete finance scope is finished only after phases 4-9. Do not label the ledger or an expense form alone as complete finance management.

## 12. Acceptance scenarios

- Multi-line discounted/taxed POS sale: order revenue, tax, cash/AR and COGS match checkout exactly; retries create no extra entry or stock movement.
- Credit sale with partial upfront payment, later collection, installment advance/collection: recognized revenue remains unchanged by collections.
- Return before/after collection and after period close: original sale remains traceable, correct refund/customer credit is recorded, stock restored only when accepted.
- Expense 10,000, payments 4,000 then 6,000: expense remains 10,000; payable moves 10,000 -> 6,000 -> 0; cash decreases only on payments. Reverse one payment and liability is restored.
- Duplicate supplier invoice, double-click approval, simultaneous payments and retried recurring job: one obligation and no overpayment.
- Inventory receipt then bill, bill then receipt, partial receipt/billing, return and freight allocation: inventory, accrual and payable match without a second expense.
- Payroll approval, partial payment, full payment, reversal, employee loan disbursement/recovery and commission reversal: every financial balance matches the payroll subledger.
- Cash transfer, opening float, petty-cash paid-out, bank deposit and card/platform settlement fee: no false income and drawer/bank totals agree.
- Backdated salary or product-cost edit: posted accounting remains frozen; authorized adjustments explain changes.
- Foreign-tenant document ID, employee accessing another claim, unauthorized attachment/export, preparer approving own document: denied with no mutation.
- Period close racing a posting, reversal in a locked period, failed event processing, service restart and migration replay: no missing or duplicated financial entry.
- Trial balance, P&L, balance sheet, cash flow, AR/AP aging, payroll and inventory reports reconcile to the same posted dataset, including exports and opening balances.
- Real browser flows cover roles, narrow layouts, validation, workspace switching, attachment access, large reports, printed statements and empty/new-business states. Build and fixture checks do not replace these tests.

## 13. Business decisions to settle before implementation

Confirm the functional currency/fiscal year, inventory costing policy, tax-account treatment, opening-balance/cutover date, cash accounts and POS paid-out policy, approval limits, supplier procurement depth, card/delivery settlement process, asset policies and whether any statutory or bank integrations should be a later project. Until confirmed, use the proposed defaults for design and disposable prototypes only.
