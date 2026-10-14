# ItemHive Payroll and Finance User Manual

## Start here

Payroll, Finance and My Workspace are separate task hubs in the sidebar. Open a card to work on one screen. Use the Home button to return. Cards, direct URLs and API actions follow the account’s permissions. A hidden menu is not the only access check.

Payroll flow: settings → employee salaries → HR requests → salary runs → independent approval → salary payments → reports.

Expense flow: draft → submit → independent approval and cost posting → partial/full payment → review history. Paying a cost does not record the expense again.

Employee flow: My Workspace → choose leave, loan/advance, overtime, expense submission, payslips or salary payments.

## 1. Share features with a client or employee

Only the Super Admin changes assignments at Permission Management. Search by account name, email or business. Select the account, tick the required screens/actions and Save Permissions. Clear financial and self-service permissions to stop sharing these features. Existing administrators do not automatically receive financial approval or payment rights. Super Admin retains access within the selected business workspace.

Employee accounts can receive personal payslips, leave requests, loan/advance requests, overtime requests and expense submission. These features require explicit grants and are not enabled by default. Employees cannot be granted business-wide accounting, approval or payment powers by these checkboxes.

Suggested employee grants: My Payslips & Payments; My Leave Requests; My Loan & Advance Requests; My Overtime Requests; Expenses: Create & Submit Own. Grant only the subset the client purchased or needs. The employee’s login must be linked to an Employee Profile in the same business.

Suggested payroll preparer grants: Payroll View, Prepare and Settings & Salaries. Grant HR Leave Requests, HR Loan & Advance Requests or HR Overtime & Attendance Requests separately. HR All Request Types is a broad alternative. A separate approver needs Payroll Approve. A salary cashier needs Payroll Payments; salary payment reversal is a separate grant. Reports is separate. A loan operator can receive Loans View Balances & Movements and Loans Disburse, Repay & Cancel without access to employee salaries or salary runs.

Suggested finance roles: an expense submitter gets Create & Submit Own; a reviewer gets Approve Expenses; a cashier gets Expense Payments. Reverse Expense Payments and Void Approved Costs are separate grants. A payment-only account cannot inspect other people’s private drafts. An accountant gets Chart of Accounts View, Journals View/Prepare and Accounting Reports. A separate journal reviewer gets Journals Post & Reverse. Finance Setup & Manage Accounts allows initialization, account maintenance and preparing opening balances together with Journals Prepare. Period Close and Period Reopen are separate grants. Existing payment/close grants do not silently include the new reversal/reopening rights.

Viewing a screen does not permit approving, posting, paying, reversing or editing settings. Approving one’s own salary run, HR request, expense or manual journal is blocked. Assign two authorized people for approval workflows. Permission Management’s Allow all is broad; use individual checkboxes for a client.

## 2. Payroll settings and employee salaries

Open Payroll → Payroll Settings. Confirm the business currency and timezone before enabling payroll. Configure overtime, holidays, paid/unpaid leave rules and entitlements. Currency and timezone cannot change after approved payroll. Save with a reason.

Open Employee Salaries → Payroll profile. The saved enrollment status is shown separately from the checkbox. Complete joining/end dates, salary type (monthly/daily/hourly), payment method, working schedule, base salary, allowances, deductions, employer contributions and commission rate. For a new employee, create the opening salary version effective on the joining date; this date and the existing HR salary are prefilled. Give a salary-change reason and Create salary version. Then tick Enroll in payroll, enter a profile-change reason beside Save payroll profile, and save. A checkbox change alone is not saved enrollment. The list refreshes immediately after saving and retains the status after reload. Salary changes preserve prior structures. Employee-specific leave policies override business defaults.

Monthly pay uses calendar-day proration. Attendance, employment dates, approved leave/overtime, holidays, commissions and loan recovery affect calculation. Resolve exceptions before submitting a run. Payroll supports exact amounts to two decimal places in the currently supported currencies.

## 3. Leave requests

Employees open My Workspace → My Leave Requests. Check the displayed balance, choose New leave request, enter dates, leave type and reason, then submit. Half-day leave must cover one date. Pending requests can be cancelled by their employee.

Managers open Payroll → Leave Requests. They can submit on behalf of an employee and review requests. A different authorized admin approves a manager-created request. Approval checks employment dates, overlapping approved leave, paid leave entitlement, work schedules, holidays and dates already claimed by approved payroll. Approval creates the HR leave record used by payroll.

Reject with a reason if the request cannot be accepted. An approved leave/overtime/attendance request can be cancelled only before its dates are included in approved payroll. After approval of payroll, use an adjustment run rather than rewriting paid history.

## 4. Loans and advances

Employees open My Loan & Advance Requests. Choose loan or advance, requested amount, monthly installment, recovery start month and reason. The installment must be positive and cannot exceed the principal. Track the decision and approved loan balance on this screen.

Managers review Loan & Advance Requests. Approval creates an approved loan with zero outstanding balance: no cash has moved yet. Open Loan Disbursements & Recovery to disburse the approved principal and enter a reference/reason. Its balance increases when it is disbursed. The current loan workflow uses cash for loan movements; bank loan disbursements are not implemented.

Monthly payroll recovers the configured installment from disbursed loans from the start month, subject to remaining balance. Direct repayments also reduce the balance. A fully recovered loan becomes settled. Only an undisbursed approved loan can be cancelled. Record a clear external reference; the software records the movement and does not transfer money automatically.

## 5. Overtime and attendance requests

Employees request overtime with a work date, extra minutes and reason. Managers review Overtime & Attendance Requests. Attendance resolutions are manager-only: check actual Attendance punches first. Approvals cannot change dates already included in approved payroll; use an adjustment after payroll approval.

## 6. Salary runs, payments and payroll expense

Open Salary Runs & Approvals. Create a regular monthly run, choose employees and give a reason. Calculate and review every employee’s components and attendance. Correct exceptions and recalculate. Submit; another authorized admin approves. Source changes after calculation require return/recalculation. Approved salary snapshots remain frozen.

Adjustment runs handle corrections to an approved run; final runs handle employment settlement. Do not create a second regular run for the same month. Review loan recovery overrides and commission claims before approval.

Open Salary Payments. Record partial or full salary payments with date, cash/bank method and external reference. Payment cannot exceed the remaining net salary. A reversal requires a reason and restores salary outstanding; it does not change the approved salary calculation. My Payslips and My Salary Payments show the employee’s own released results. Payslips can be downloaded as PDF.

Open Payroll Expense & Reports for approved payroll cost, register, payments, commissions, leave balances and loan movements. Payroll reports follow service month; the ledger posts payroll cost on the local business date of approval. Therefore date totals can differ around month boundaries.

Once finance is initialized, new approvals debit Payroll Expense and credit Salary Payable, Employee Loans for recoveries, Payroll Deductions Payable and Employer Contributions Payable. Recorded salary payments settle Salary Payable through Cash or Bank. Reversals restore that payable. Generic deductions are held in the deductions control account: an accountant must review their real tax, penalty or other treatment and make appropriate journals. No statutory tax calculation or automatic remittance is supplied.

## 7. Initialize finance and Chart of Accounts

Choose the correct business workspace, then Finance → Chart of Accounts → Initialize finance. Choose an accounting starting date and a setup reason. This creates default group and posting accounts for cash, bank, POS drawer, employee loans, expense payable, salary payable, payroll deductions/contributions, equity and expenses. The starting date is fixed after initialization.

Before initialization, expense/payroll transactions remain in their existing registers. Initialization does not replay old records. Review cash/bank balances, unpaid expenses and salary, outstanding employee loans and other opening balances. Enter a balanced opening journal dated exactly on the starting date and have another authorized admin post it. Open Opening Balance Allocation, select that posted journal and the historical expense/salary/loan sources it represents, and give a reconciliation reason. The three control balances must exactly match the selected outstanding amounts and currency. Stop settlements during this review. Allocation is permanent, and the linked opening journal cannot be generically reversed. Later payments and loan recovery then settle reviewed opening balances without recognizing old costs again. Allocate historical loans before including their recovery in new payroll. Do not both import the same historical costs and enter their opening balances.

Create additional accounts with unique codes, one of five types (asset, liability, equity, income, expense), an optional parent group and an explanation. Parent groups must be active, the same type and nonposting. Cycles are blocked. Posting accounts receive amounts; group accounts only organize the chart. Protected control accounts cannot be disabled or retyped. Used codes/types/posting modes cannot be rewritten. Names may change, but existing journal snapshots retain their recorded names. Deactivate unused custom accounts instead of deleting history.

Posting before the starting date or into a closed month is blocked. Financial operations use database transactions; the backend requires a MongoDB replica set. Cash and bank entries record accounting movements, not live transfers.

## 8. Expense submissions and register

Open My Expense Submissions → New expense. Enter title, category, expense date, amount/currency, payee/vendor, invoice/reference and notes. After finance setup, choose an active operating expense posting account. Salary costs belong in Payroll, not a second expense form. Attach a JPG, PNG, WebP or PDF receipt up to 1 MB. Save draft, review it, then Submit.

Edit is available only for your draft or returned/rejected expense. Submit locks editing until review. You can cancel your own draft/submitted/rejected record. A duplicate normalized vendor and invoice/reference is blocked; a payment reference belongs on the payment record. Cancelled documents retain their invoice identity for audit; use a distinct correction reference when replacing one.

Expense Register shows business-wide expenses when shared. Lists start with all dates, so older drafts, pending invoices and unpaid expenses remain visible. Optional filters include date range, search, category and status. Expense Payments starts with Outstanding only; switch to Paid for refunds/reversals or All approved expenses for history. Totals are separated by currency and follow the filters. Export page exports only the current page. Open View for receipts, payment breakdown and history. Receipt access follows the same tenant/ownership rules as the expense.

## 9. Expense approvals, payments and corrections

Open Expense Approvals. Review another person’s submitted expense and receipt. Approve, reject or Return for correction with a reason. On approval, choose an accounting posting date in an open period and on/after the finance starting date; the invoice keeps its original expense date. This supports an older invoice without trying to post into a locked period. Review whether that historical cost is already in opening balances before posting it. The owner edits and resubmits a returned/rejected document. Approving an expense after finance setup records expense cost and the payable exactly once. Approval does not mean payment.

Open Expense Payments. Record amount, date, source and payment reference against an approved expense. Example: approve 10,000; pay 4,000, then 6,000. Cost stays 10,000; outstanding becomes 6,000 and then zero. Payment dates cannot precede the expense date. Concurrent/stale payments and overpayment are blocked.

Cash means cash outside the POS drawer. Bank records an external bank movement. POS drawer requires an open shift in the same currency and records the paid-out against it. For a drawer reversal, return cash to the current open shift. Closed shift snapshots remain unchanged.

Reverse an incorrect payment from View → Payments, giving a date and reason. It restores outstanding and reverses its accounting entry if the original was posted. Reverse all active payments before an independent approver voids an approved expense. Void reverses the expense accrual and preserves its history. Closed periods require a current open correction date or authorized reopening.

Historical approved expenses/payroll without ledger links stay in their registers; later payments do not fabricate a historical accrual. Reconcile and link their remaining balances through Opening Balance Allocation before settling them. The expense detail identifies an approval accrual or an opening balance link. An opening-linked historical expense cannot be voided as a new cost: its migration/correction requires separate accounting review.

## 10. Journals and opening balances

Open Journals & Opening Balances. Choose New journal, date, currency and description. Add account lines with a debit OR credit on each line; amounts must balance and each line must be positive on one side. Two to 100 lines are supported. Group/inactive/foreign-business accounts are blocked. Manual journals cannot directly change source-controlled employee loan or payroll/expense payable accounts, except reviewed opening balances.

Opening journals require Finance Setup and Journals Prepare permission, and must use the accounting starting date. Review source balances before preparing them. Save draft → edit if needed → Submit → another authorized admin Post or Reject. Your unposted draft/rejected/submitted journal can be cancelled with a reason. Posted journals preserve account snapshots and history. Use a dated linked reversal for posted manual/unallocated-opening corrections; its date cannot precede the original accounting date. Reversals can restore balances on a retired custom account, while new postings to inactive accounts are blocked. Automatic entries must be corrected through the source workflow so ledger and subledger remain aligned.

## 11. Accounting reports and period close

Choose Accounting Reports and select currency/date range. Trial Balance displays opening debit-minus-credit balance, period debits/credits and closing balances. Its total closing debits must equal credits. Income & Expenses uses movements within the selected period. Balance Sheet includes all posted movements through the end date and displays accumulated income less expenses as equity. Account Ledger includes opening balance and individual movements. Export CSV uses the displayed report. Ledger detail is capped at 1,000 rows; narrow the range if a truncation notice appears.

Reports include only posted journals. They automatically include new expense approvals/payments and new payroll approvals/payments/loan movements after setup. Sales, stock valuation/COGS, customer collections, supplier purchasing and tax flows are not automatically integrated into this ledger. Until reviewed journals and opening balances cover those sources, financial statements are partial and must not be treated as full-business profit or balance-sheet figures. Currencies are reported separately; no exchange-rate conversion is provided.

Before Period Close, reconcile cash/bank, expense payables, salary payable and employee loans, resolve unposted journals and review source registers. Enter month, Close month and reason. A closed month rejects new accounting postings. Reopen month requires its separate permission and a reason; history remains available. Closing is a posting lock, not an automated bank/subledger reconciliation certificate.

## 12. Common problems

No card or Access Denied: ask the Super Admin for the exact screen/action permission. Financial grants are explicit. Refresh the session after assignment if the menu has not yet updated; API authorization uses current server assignments.

No linked employee: the login and Employee Profile must be linked in the same business. Switching a workspace does not allow an employee to see another business’s records.

Cannot approve own document: assign a second authorized reviewer. Approval is intentionally separate from preparation.

Expense account missing: initialize finance, then edit the draft and choose its operating expense account. Return a submitted legacy draft for correction before approving it.

Expense or payment changed: refresh before repeating. Keep the current payment form open and retry the pending save if the response was lost; refresh the payment history before starting a new payment.

Period closed or date before cutover: choose a valid open correction date or request authorized reopening. Do not change historical source records to bypass the lock.

## 13. Current boundaries and remaining finance scope

Implemented: separate task screens, personal leave/loan/overtime requests, HR decisions, payroll salary setup/enrollment/runs/calculation/loans/payments/reports, client/employee grants including separate HR types, loan operation rights, reversal rights and close/reopen rights, expense drafts/receipts/review/payments/returns/voids, Chart of Accounts, balanced journals/independent posting/reversals, reviewed opening balance allocations, expense and payroll accounting, accounting reports and posting period locks.

Not yet implemented: statutory payroll/tax rules, live bank transfers, bank statement import/reconciliation, automatic sales/credit/installment and inventory ledger integration, suppliers/bills/purchasing, recurring expenses, itemized tax expense lines, budget controls, assets/depreciation, foreign-exchange conversion and secure object-store receipts with malware scanning. Receipts currently reside within tenant-scoped expense documents. Payroll loan movements use cash, and historical subledger settlement needs reviewed opening/adjustment accounting. The broader roadmap remains in FINANCE_MANAGEMENT_PLAN.md.

Do not call the whole finance roadmap complete because these screens exist. Review the implementation audit and validation evidence before client rollout.
