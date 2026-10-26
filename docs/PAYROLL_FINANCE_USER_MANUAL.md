# ItemHive User Manual: Payroll, Expenses, Finance and My Payroll

Edition: 20 October 2026. This guide describes the current project screens and workflow rules. Examples use fictional people and PKR amounts. Use your business currency and approved policies for real records.

## 1. Start here: choose the right section

Payroll is for salary setup, employee enrollment, HR review, salary calculation, approval and payment recording.

Expenses is for operating costs such as tea, cleaning and office supplies. Employees submit costs, reviewers approve them and cashiers record payment.

Finance is for accounts, journals, opening balances, accounting reports and closing or reopening a month.

My Payroll is the employee's personal area: their own payslips, salary payments, leave, loan/advance and overtime requests.

### Navigate the application

1. Sign in with your own account.
2. Check the business workspace in the header, especially if you are a Super Admin.
3. Expand Payroll, My Payroll, Expenses or Finance in the left menu.
4. Choose the screen you need. Only screens shared with your account appear.
5. On a phone, open the menu first. Selecting a screen closes it.
6. Use User guide at the top of a workflow screen to return here. Search the manual by task, field or error.

Viewing and taking action require different permissions. Access to a record does not automatically permit approval, payment, reversal or editing.

### Main workflows

- Payroll: settings > salaries and enrollment > HR review > calculate run > submit > authorized approval > record payment > reports.
- Expenses: create > draft or submit > independent review > partial/full payment > history.
- Finance: set up accounts > review opening balances > prepare/post journals > reports > month close.
- My Payroll: submit personal requests > track decisions > view released payslips > check salary payments.

A payment entry records money paid outside ItemHive. It does not transfer money. Approval does not mean payment.

## 2. Roles, permissions and approval responsibilities

Super Admin assigns access in Permission Management. A job title such as Accountant or Cashier does not itself grant access. Financial and personal payroll features require explicit grants.

### Suggested responsibilities

- Employee: own payslips/payments, leave, loan/advance, overtime and own expense submission, according to the permissions shared.
- HR reviewer: only the permitted request families: leave, loan/advance or overtime/attendance. HR: All Request Types is the broad alternative.
- Payroll preparer: salary settings, enrollment, run preparation and calculation. Share the related screens needed for the job.
- Payroll approver: approve submitted runs with Payroll: Approve permission. Super Admin can also approve.
- Salary cashier: record salary payments. Reversal is a separate permission.
- Loan operator: view loan balances and manage disbursement, repayment or cancellation, without necessarily receiving salary access.
- Expense reviewer: approve, reject or return another user's submitted expenses.
- Expense cashier: pay approved expenses. Payment reversal and approved-cost voiding require separate permissions.
- Accountant: accounts, journal preparation and reports. Initial setup/account maintenance require Finance: Setup & Manage Accounts.
- Journal approver: post/reject and reverse eligible journals; journal preparation is separate.
- Period manager: close a month; reopening requires the separate reopening grant.

### Share a feature

1. As Super Admin, open Permission Management.
2. Search by account name, email or business and select the account.
3. Tick only the required screens and actions.
4. Choose Save Permissions.
5. Ask the user to refresh their session if the menu has not updated.
6. Confirm access using the user's own account before daily operation.

Employee-role accounts can receive personal payroll features and own expense submission. Those personal grants do not give business-wide accounting, approval or payment powers.

### Approval rules

Salary runs need one approval from a Super Admin or an admin explicitly granted Payroll: Approve. The approver may also be the creator/preparer; no second administrator or second approval is required. Preparation/view access alone does not grant approval. Approved runs cannot be approved again. Expense, journal and HR creator restrictions still apply.

## 3. First-time setup checklist

1. Confirm the business workspace and identify preparer, approver and cashier.
2. Assign the required permissions.
3. Check employee profiles, joining dates, status and login links.
4. Save Payroll Settings, including currency, timezone and leave rules.
5. If using accounting, set up Finance with a reviewed starting date.
6. Add opening salaries and save employee enrollment.
7. Review attendance, holidays, leave, overtime and existing loans.
8. For existing unpaid salaries, expenses or loans, post reviewed opening balances and complete Opening Balance Allocation before settling them.
9. Check one complete workflow using preparer, reviewer, cashier and employee accounts.

The Finance starting date cannot be changed after setup. Payroll currency and timezone are protected once payroll has been approved. Do not use temporary dates or settings just to enable a button.

## 4. Payroll Settings

Open Payroll > Payroll Settings. Saving changes requires Payroll: Settings & Salaries.

### General and pay rules

- Payroll currency: salary calculation currency; choose a supported currency.
- Business timezone: used for business dates and payroll timing. Asia/Karachi is an example for a Pakistan business.
- Overtime multiplier: the business multiplier for eligible approved overtime.
- Enable payroll: enables the workflow.
- I confirm business currency and timezone: confirms these have been checked.
- Automatic sales commissions: enables the supported commission workflow; employee percentages and eligible sales data still need to be correct.
- Daily/hourly staff paid non-work options: whether approved paid leave, off days and holidays are paid for those salary types.
- Explicitly allow zero base pay: permits zero salary where deliberately required.
- Late penalty per day / Early exit penalty per day: configured deductions for qualifying attendance events.
- Holiday dates: YYYY-MM-DD dates separated by commas.

### Leave entitlements

Review Paid, Annual entitlement, Opening balance and Carry-forward cap for the applicable leave types. Employee salary settings can use a separate leave policy.

1. Review General & pay rules.
2. Expand Leave entitlements and enter approved business rules.
3. Enter Reason for settings change.
4. Choose Save settings.
5. Refresh and confirm the saved values.

Migrate opening salaries helps convert existing HR salary information without salary history. Review its result and incomplete employees. It does not replace checking each employee's dates, rules and saved enrollment.

## 5. Employee profiles and login links

An employee profile existing in Employees does not itself mean the person is enrolled in payroll.

Before enrollment, confirm employee name/code, joining date, active status, department where used and salary/work schedule. For self-service, the login must be linked to the employee in the same business.

### Give an existing employee a login

1. Open Team in the correct workspace with team-management access.
2. Find Employees without a login.
3. Choose Create Login for the existing employee, rather than making a second person.
4. Complete the account form.
5. Ask Super Admin to assign the required My Payroll and expense permissions.
6. Confirm the employee's joining date and salary enrollment.

If My Payroll asks an admin to link the login, have an authorized admin check Team and Employees in that business. Creating an unrelated second profile will not fix the original login link.

## 6. Enroll an employee in payroll

Open Payroll > Employee Salaries, find the employee and choose Salary & enrollment. Viewing alone does not allow saving; salary-setting access is required.

### Enrollment procedure

1. Wait for employee data to load; use Retry after a loading error.
2. Check the employee and joining date.
3. Tick Include in payroll.
4. If an opening salary covering joining is missing, enter Basic salary, salary type and Salary start date.
5. Set the opening salary date to the joining date or an earlier valid date. A later salary alone does not cover the beginning of employment.
6. Check Payment method. Bank requires bank name and bank account.
7. Review the optional work, leave, allowance and deduction sections if the employee needs different rules.
8. Enter Reason for change, for example Initial payroll enrollment.
9. Choose Save & enroll. When needed, opening salary and enrollment save together.
10. Wait for success and confirm the saved status is Enrolled.
11. Reopen the employee or refresh the list to confirm persistence.

### Ticked does not mean saved

The checkbox changes the form. Enrollment becomes effective only after a successful save. Not saved yet or an unsaved-change message means the displayed selection has not been committed.

### Save & enroll is disabled

- Enter Reason for change.
- Supply a valid opening date on or before joining.
- Enter positive basic salary unless zero pay is explicitly allowed.
- Use no more than two decimal places for money.
- Complete both bank fields for Bank.
- Check working days, shift times, break/grace minutes and component values.
- Read the explanation beside or below Save.
- Wait for loading, or Retry if data is not ready.

Last working day (optional) is for an employee whose employment is ending. Leave it blank for current employees. It is not required for enrollment.

## 7. Salary details, schedules and history

Payroll uses the salary version effective on each date being calculated. A future salary is not automatically the current salary.

### Field meanings

- Basic salary: the base for monthly, daily or hourly pay.
- Salary start date: when this version begins.
- Commission percentage: the employee percentage for eligible commissions, where enabled.
- Working days: normal employee workdays.
- Shift start/end: scheduled hours; overnight shifts are supported.
- Break minutes: unpaid break time used in work calculations.
- Grace minutes: configured attendance grace time.
- Leave policy: business defaults or employee-specific rules.

Components have a name, kind, mode and value. Fixed amount uses currency; Percent uses a percentage of earned base. Adjust for days paid controls supported proration of fixed components.

Allowances increase earnings. Deductions reduce take-home pay. Employer contributions affect employer cost and are not necessarily extra money payable to the employee.

### Change salary

1. Open Salary & enrollment and expand Salary history.
2. Save or reset unsaved profile changes first.
3. Choose Change salary, or Copy salary to start from an earlier version.
4. Enter the new effective date and review all values.
5. Enter a clear reason and choose Save salary change.
6. Check Salary history and the current/next salary shown.

Two salary versions cannot start on the same date. New versions preserve earlier history and do not rewrite an approved payroll snapshot.

### Calculation basics

Monthly salary uses actual calendar-day proration. Joining/leaving and effective salary changes can split a month. Daily/hourly staff use payable days or eligible hours and configured non-work rules. Attendance, approved leave/overtime, holidays, commissions and recovery can change the result.

Example: PKR 30,000 for an otherwise fully payable 30-day month has a PKR 1,000 daily share for that month. This is not a fixed daily rate for every month. Review the actual employee breakdown.

## 8. Payroll: review leave requests

Open Payroll > Leave Requests with HR leave-request or broader HR permission.

### Submit for an employee

1. Choose New leave request and select the employee.
2. Enter Start date, End date, Leave type and Reason.
3. Tick Half day only for a single-date half-day request.
4. Submit for review. A different person must approve a manager-created request.

### Review

1. Find the pending request using search/status.
2. Check employee, dates, leave type, fraction and reason.
3. Review entitlement and the effect on attendance/payroll.
4. Choose Approve or Reject and give a decision reason.
5. Confirm the saved status and decision.

Approval checks employment dates, overlaps, entitlement and dates already claimed by approved payroll. Approved leave becomes a payroll input. Submission alone does not make leave approved or paid.

Authorized reviewers can Cancel approval for eligible leave before those dates are included in approved payroll. Once included, use a reviewed payroll adjustment rather than changing paid history.

## 9. Payroll: loans, advances and recovery

A loan/advance moves through request, approval, disbursement and recovery. Approval and payment are separate.

### Review a request

1. Open Payroll > Loan & Advance Requests.
2. Review employee, amount, monthly installment, recovery start month and reason.
3. Installment must be positive and cannot exceed principal.
4. A different authorized reviewer approves or rejects with a reason.
5. Approval creates a loan record with zero outstanding: no cash has moved yet.

### Disburse an approved loan

1. Open Payroll > Loan Payments & Recovery.
2. Find the approved loan and choose disbursement.
3. Review amount, external reference and reason in the movement form.
4. Record the actual disbursement and check the new status/balance.
5. Check Loan movements for the entry.

Current loan movements use cash. ItemHive records the movement; it does not transfer funds. Bank loan disbursement is not implemented in this workflow.

### Recovery, repayment and cancellation

Payroll recovers the configured installment from disbursed loans starting in the selected month, subject to remaining balance. Recovery is committed when the run is approved, not simply when calculated.

For direct repayment, choose repayment on a disbursed loan, enter amount/reference/reason and save. The balance decreases. A zero balance becomes settled.

Only an approved, undisbursed loan can be cancelled. Do not cancel to erase a disbursement. Historical loans without ledger links need reviewed opening allocation before accounting-linked recovery/settlement.

Example: disburse PKR 12,000 with PKR 3,000 monthly recovery. Four valid recoveries clear it if no separate repayments or adjustments change the balance.

## 10. Payroll: overtime and attendance review

Open Payroll > Overtime & Attendance Requests. Employees can submit overtime; attendance-resolution requests are manager-only.

### Overtime

1. Choose New work request and select employee and overtime type where shown.
2. Enter Work date and Extra minutes as whole minutes.
3. Explain the extra work in Reason and submit.
4. Have a different authorized reviewer decide it.
5. Review its salary effect before payroll approval.

Enter 90 for one hour and thirty minutes. Extra minutes must be whole minutes from 1 to 1,440. A late clock-out does not automatically make overtime payable: eligible approved overtime and business rules control payment.

### Attendance resolution

1. Check actual Attendance punches first.
2. Submit a manager attendance request for the work date and explain the resolution.
3. Have an authorized reviewer decide it.
4. Recalculate an unapproved run after source changes.

Do not substitute a request for checking missing/conflicting punches. Approval cannot rewrite dates already claimed by approved payroll.

## 11. Payroll: create, calculate and approve salary runs

Open Payroll > Salary Runs & Approvals. Preparation needs Payroll: Prepare; approval needs Payroll: Approve.

### Create and calculate

1. Finish enrollment, salary setup, attendance and relevant HR decisions.
2. Choose New run.
3. Select Payroll month and Run type. Use regular for ordinary monthly payroll.
4. Select employees, or Select all enrolled employees.
5. Enter Reason and choose Create.
6. Open the run and choose Calculate. Enter the requested reason and confirm.
7. Open each employee's Breakdown. Check salary dates, payable units, attendance, earnings, deductions, recovery and net pay.
8. Correct every exception and Calculate again after changing inputs.
9. Compare gross pay, deductions, net pay and employer cost with the reviewed payroll worksheet.

Regular calculation is allowed only after the covered month ends in the business timezone. Final settlement also requires its covered employment period to end. Do not alter timezone or employment dates to bypass this rule.

### Submit and approve

1. The preparer chooses Submit on a calculated run and enters a reason.
2. A Super Admin or an admin with Payroll: Approve opens the submitted run. This can be the same person who created or prepared it.
3. The reviewer checks employee breakdowns/totals and chooses Approve or Return with a reason.
4. For a return, the preparer corrects the cause and recalculates before resubmitting.
5. After approval, check the released payslips. The cashier can record actual payment.

If sources change after calculation, submission/approval can be blocked. Return and recalculate when salary, attendance, HR decisions, commissions or loan balances changed.

### Run statuses

- Draft: new or returned; not ready for approval.
- Calculated: results exist and need checking.
- Submitted: awaiting one authorized approval.
- Approved: released salary snapshot protected from rewriting.

Only one regular run is allowed for a business/month. Use the appropriate adjustment or final-settlement workflow instead of a second regular run.

## 12. Payroll: adjustments and final settlement

Do not edit an approved run to hide an earlier error. Use reviewed corrections.

### Add an adjustment before approval

1. Open a draft/calculated run.
2. Under Adjustments / final settlement benefits, select employee.
3. Select bonus, reimbursement, deduction, allowance, benefit, encashment or recovery as appropriate.
4. Enter amount and a clear reason. Recovery needs the correct Loan ID where requested.
5. Choose Add adjustment.
6. Recalculate and review before submitting.

### Correct an approved run

1. Identify the approved month, employee and precise difference.
2. Create an adjustment run and select Approved parent run.
3. Add only the reviewed difference. Adjustment runs do not pay monthly base again.
4. Calculate, resolve exceptions, submit and obtain one authorized payroll approval.
5. Record any resulting payable through Salary Payments.

Negative net or invalid recovery can block approval. Do not invent an offset to force approval; ask the payroll administrator to review the correction.

### Final settlement

1. Confirm the real Last working day.
2. Review unpaid salary, loans and approved settlement benefits.
3. Create a final run for the relevant employee/month.
4. Add reviewed settlement items, calculate and inspect covered dates.
5. Obtain one authorized payroll approval, then record payment.

Dates already included in approved payroll cannot be paid again as final-settlement base. Handle separate differences as reviewed adjustments.

## 13. Payroll: record salary payments and reversals

Open Payroll > Salary Payments. Recording and reversal have separate permissions.

### Record payment

1. Find the approved run under Approved runs ready for payment.
2. Choose Open for payment.
3. Check employee net, paid and outstanding.
4. Choose Record payment for the employee.
5. Enter actual amount, payment date, Cash/Bank, external reference and reason where requested.
6. Save and wait for confirmation.
7. Check Payment history and remaining outstanding.

Where Pay all remaining is available, review every balance and payment detail first. Do not use it when only some employees were actually paid.

Partial payments are supported. For net PKR 49,000, a PKR 20,000 payment leaves PKR 29,000. A later PKR 29,000 clears it. Payment above remaining net is blocked.

### Reverse a wrong entry

1. Find the original Payment history entry.
2. Choose Reverse with reversal permission.
3. Enter requested correction information and a clear reason.
4. Confirm the original is marked reversed.
5. Check restored outstanding before entering a replacement.

Reversal changes payment/accounting history, not the approved salary calculation. The reversal date cannot precede the payment; accounting dates must satisfy applicable Finance locks.

If a save response is lost, inspect history before a new payment. Keep the same pending form for retry where possible; a new form can represent a new instruction.

## 14. Payroll Expense & Reports

Open Payroll > Payroll Expense & Reports with reporting permission.

1. Select the month range and available employee/department/report filters.
2. Load and select the required report.
3. Confirm range, currency and scope.
4. Check totals/detail rows.
5. Use Excel, CSV or Print A4 / Save PDF where offered.

Reports include approved payroll cost/register information and related payments, commissions, leave and loans. Check exported content before sharing it.

Gross is earnings before deductions. Net is gross less employee deductions/recovery. Employer cost includes configured employer contributions. Paid includes active recorded payments; reversed entries do not count. Outstanding is the remaining payable.

Payroll reports follow service month. Finance posts new payroll approval on its business approval date. September salary approved in October can therefore appear in September payroll and October accounting movements. Compare date bases first.

## 15. My Payroll: payslips and salary payments

My Payroll shows the linked employee's own records in the current business. My Payslips & Payments must be shared. Personal access does not reveal other employees' salaries.

### View/download a payslip

1. Open My Payroll > My Payslips.
2. Check employee name/code.
3. Search month or run type if needed.
4. Choose View / PDF.
5. Check earnings, deductions, net, paid and outstanding.
6. Review Attendance for worked minutes, overtime and payable units.
7. Use the PDF download action and check the downloaded employee/month.

Only approved runs release employee payslips. Draft/calculated/submitted runs do not. A released payslip does not prove money reached the employee's bank.

### Check salary payments

1. Open My Payroll > My Salary Payments, or My salary payments from the payslip screen.
2. Review Date, Amount, Method, Reference and Status.
3. Search date/method/reference if needed.
4. Read the reversal reason on a reversed entry.
5. Use Export CSV for displayed filtered payment records.
6. If records differ from what you received, contact the cashier with month/reference.

Employees cannot edit salary, approve pay or reverse payments from this personal area.

## 16. My Payroll: request leave

My Leave Requests permission and a linked employee profile are required.

1. Open My Payroll > My Leave Requests and check balances.
2. Choose New leave request.
3. Enter Start date and End date.
4. Select casual, sick, annual, unpaid or other leave.
5. For Half day, use the same start/end date.
6. Enter Reason and submit.
7. Confirm pending status.
8. Check this screen or the bell for the decision and reason.

Example: half-day leave on 12 November 2026 uses 2026-11-12 for both dates and Half day ticked.

Cancel is available while pending. Employees cannot directly cancel approved leave here; contact HR. Dates already included in approved payroll need a reviewed correction.

Displayed balance is an entitlement guide. Approval also checks dates, overlaps, applicable rules and payroll claims. Submission guarantees neither approval nor paid treatment.

## 17. My Payroll: loan, advance and overtime requests

### Request a loan or advance

1. Open My Payroll > My Loan & Advance Requests.
2. Choose New loan / advance request and select loan or advance.
3. Enter Requested amount and Monthly installment.
4. Select Recovery starts month.
5. Enter Reason and submit.
6. Track status and decision reason.
7. Review Approved loans & recovery for principal, recovery, outstanding, start month and status.

Installment must be positive and no greater than principal. An approved loan showing zero outstanding may be awaiting disbursement. Approval alone does not pay cash; ask the loan operator to check.

You can cancel a pending request. You cannot disburse, change recovery records or approve your own request.

### Request overtime

1. Open My Payroll > My Overtime Requests.
2. Choose New work request.
3. Enter Work date and Extra minutes, for example 90 for 1 hour 30 minutes.
4. Enter Reason and submit.
5. Track the review decision.
6. After payroll approval, check the payslip for eligible overtime treatment.

Overtime does not automatically correct attendance punches. Contact HR/attendance administration for clock-in/out problems; attendance-resolution requests are manager-only.

## 18. Expenses: create and submit a cost

Open Expenses > My Expenses with Expenses: Create & Submit Own. An employee can use this without business-wide Finance access.

### Enter the expense

1. Choose New expense.
2. Enter Expense title, Amount and Expense date.
3. Select Category and Currency.
4. After Finance setup, choose an active Expense account appropriate to the cost.
5. Expand Vendor, invoice & notes (optional) for Payee / vendor, Invoice / receipt no. and Notes.
6. Attach an available JPG, PNG, WebP or PDF receipt up to 1 MB.
7. Choose Save draft to finish later, or Submit for approval now.
8. Wait for confirmation and check My Expenses status.

Pressing Enter in a valid expense form submits for approval. Choose Save draft explicitly if not ready for review.

### Field meanings

- Expense date: actual cost/invoice date; keep it accurate even when approval is later.
- Category: operational grouping.
- Expense account: the approved cost's accounting account after Finance setup.
- Payee / vendor: supplier or person being paid.
- Invoice / receipt no.: vendor document reference, not the later payment reference.
- Notes: supporting explanation.
- Receipt: evidence; attachment does not approve or pay the cost.

### Tea example

Enter Tea for the team, 500.00, the purchase date and suitable category. After Finance setup, select the operating account designated by your accountant. Add vendor/receipt where available and submit. Authorized reviewers receive it in Expense Approvals and a review notification. It does not automatically charge cash or the POS drawer.

Do not add a second operating expense for a salary handled by Payroll. Use the business's reviewed procedure for supplier stock purchases or unsupported accounting sources.

## 19. Expenses: approve, reject or return

Open Expenses > Expense Approvals. Another authorized person must review the creator's submitted expense.

### Approve

1. Find the record and choose View or Approve.
2. Check title, amount, currency, creator, invoice date, vendor/reference, account and receipt.
3. Enter decision Reason.
4. Choose Accounting posting date. After Finance setup it must be in an open period, on/after starting date and not earlier than Expense date.
5. Choose Approve expense.
6. Confirm approved status; payment is now permitted.

After Finance setup, approval recognizes the cost and payable once. Payment later settles the payable rather than recording the cost again.

### Reject or return

Choose Reject expense when not accepted. Choose Return for changes when the creator needs to correct details. Give a useful reason, such as Receipt missing: attach the vendor receipt and resubmit.

Both actions use rejected status in the current system. History distinguishes reject from return. The creator can edit their draft/rejected record and resubmit.

### Old invoice, current accounting date

Keep the original Expense date. If the cost is not already represented in opening balances, an authorized reviewer can use a valid later accounting date. Do not recognize the same historical cost twice.

## 20. Expenses: partial or full payment

Open Expenses > Expense Payments with payment permission. The default queue shows outstanding approved costs.

1. Review amount, paid and outstanding.
2. Choose Record payment.
3. Enter the actual positive amount, no greater than outstanding.
4. Choose Payment source.
5. Enter Payment date and Payment reference.
6. Choose Record payment and wait for confirmation.
7. Check View > Payments and updated outstanding.

Payment cannot precede Expense date or its accounting posting date. Accounting-linked entries must also satisfy starting-date and period-lock rules.

### Payment source

- Cash (not POS drawer): cash outside the active till.
- Bank: an external bank movement already made.
- POS drawer: actual paid-out from an open shift in the same business/currency.

POS drawer is unavailable without a suitable open shift. Using Cash for a till payment would omit the paid-out from the shift report.

### Partial payment example

Approve PKR 10,000, pay PKR 4,000, then PKR 6,000. Cost remains PKR 10,000. Outstanding becomes PKR 6,000, then zero. Server checks block active concurrent overpayments.

Paid costs leave the default outstanding queue. Choose Paid or All approved expenses to find their history or reverse an entry.

## 21. Expenses: corrections, receipts and register

### Correct a draft or returned cost

1. Open My Expenses and find your draft/rejected record.
2. Choose Edit and correct its details, receipt or account.
3. Save draft or Submit for approval.

Submitted records are locked until review. A creator can cancel their own draft, submitted or rejected expense. Approved costs require the controlled process below.

### Reverse a payment

1. Open View > Payments and choose Reverse on the active entry.
2. Enter a valid correction date and Reason.
3. Confirm reversed status and restored outstanding.
4. Record a replacement only after checking the new balance.

For a drawer reversal, return cash to the current open shift. The original closed shift snapshot remains unchanged; the return belongs to the current shift.

### Void an approved cost

A different person with Expenses: Void Approved Costs must act. Reverse all active payments first. Open the expense, choose Void approved expense, enter correction date/reason and confirm. Its approval accounting is reversed where applicable and history remains.

An opening-linked historical expense cannot be voided as a new cost. Allocation is permanent; request a reviewed accounting correction rather than looking for an allocation undo button.

### Receipts and duplicates

View includes the receipt, payment breakdown and History. Receipt access follows expense ownership/permissions. Duplicate normalized vendor and invoice/reference identity is blocked within the business. Cancelled documents retain invoice identity; use a reviewed distinct correction reference for a replacement.

### Register and exports

Expense Register needs Finance: View All Expenses. Lists start with all dates so older pending/unpaid records remain visible. Use date, search, category, status and applicable payment filters. Totals follow filters and remain separated by currency.

Export page exports the current page only. Check page size and filters before sharing. Clear filters and refresh when a record seems missing.

## 22. Finance: starting date and Chart of Accounts

Open Finance > Chart of Accounts. View and management have different permissions.

### Set up Finance once

1. Check workspace and the business payroll/accounting currency.
2. Agree the accounting starting date with your accountant.
3. Choose Set up Finance.
4. Enter Accounting starting date and Setup reason.
5. Choose Set up accounts.
6. Review the fixed starting date and default accounts.

Setup creates groups/posting accounts for cash, bank, POS drawer, employee loans, salary/expense payables, payroll liabilities, equity and expenses. It does not replay historical salary, expense or loan records. The starting date cannot be changed later.

### Create an account

1. Choose New account.
2. Enter unique Code and Account name.
3. Choose asset, liability, equity, income or expense.
4. Choose an active nonposting Parent group of the same type, if needed.
5. Tick Posting account to receive journal amounts; leave unticked for an organizing group.
6. Set Active, enter Change reason and Save account.

Groups cannot receive journal lines. Protected control accounts cannot be disabled/retyped. Used codes/types/posting modes have restrictions to preserve history. Deactivate eligible unused custom accounts rather than removing history. Renaming does not rewrite posted journal snapshots.

## 23. Finance: prepare, post and reverse journals

Open Finance > Journals & Opening Balances. View, preparation and post/reverse rights are separate.

### Prepare and submit

1. Choose New journal.
2. Enter Posting date, Currency and Description / reference.
3. Select active posting accounts.
4. Enter a debit OR credit on each line, never both.
5. Add lines as needed: 2 to 100 are supported.
6. Check Debit, Credit and Difference. Totals must be equal and positive; Difference must be zero.
7. Save draft.
8. Check View, Edit if needed, then Submit with a reason.

Manual journals cannot directly change source-controlled employee loan, salary payable or expense payable accounts except reviewed opening balances. Correct automatic salary/expense/loan entries through their source workflows to keep balances aligned.

### Post or reject

1. A different authorized reviewer opens the submitted entry.
2. Check dates, currency, accounts, amounts and description.
3. Choose Post or Reject and give a reason.
4. Check status and History.

Drafts do not appear in posted reports. The preparer can edit/resubmit a rejected entry or cancel their own unposted draft, rejected or submitted journal.

### Reverse

1. Find the posted manual or eligible unallocated opening journal.
2. Choose Reverse with post/reverse permission.
3. Enter date on/after original posting and a clear reason.
4. Confirm and inspect the original plus linked reversal.
5. Prepare any replacement through independent review.

Posted entries cannot be edited or reversed twice. Source-generated entries need source corrections. An opening journal already allocated to historical sources cannot be generically reversed here.

## 24. Finance: opening balances and historical allocation

Use this when Finance begins after the business already has unpaid expenses, unpaid approved salaries or disbursed loans. These are reviewed historical balances, not new current-period costs.

### Opening journal

1. Reconcile cash/bank, unpaid costs/salaries, employee loans and other opening balances outside ItemHive.
2. In Journals & Opening Balances choose New journal.
3. Tick Opening balances (finance start date). Finance setup plus journal preparation permissions are required.
4. Use exactly the Finance starting date and matching currency.
5. Enter reviewed balanced lines and description.
6. Save and submit for another authorized reviewer to post.

### Link sources

1. Pause affected payments and recovery while reconciling/linking.
2. Open Finance > Opening Balance Allocation.
3. Choose Posted opening journal.
4. Select the old unpaid expenses, salary runs and loans it represents.
5. Compare each Selected total to the matching journal control balance. Currency/totals must match exactly.
6. Enter Reason / reference and choose Link balances.
7. Confirm success and source accounting links before resuming settlements.

Only eligible unlinked sources appear. Linking is permanent. Do not duplicate old costs as both new expense entries and opening payables. Do not select unrelated items to force a total match.

After allocation, later salary/expense payments reduce opening payables; loan recovery reduces the linked loan balance without recognizing old cost again. Historical loans must be allocated before new accounting-linked payroll recovery.

For a wrong allocation, stop affected settlement and request an accountant-reviewed correction. There is no general unlink/reverse-allocation button.

## 25. Finance: accounting reports

Open Finance > Accounting Reports. Choose Report, From, To / As of and Currency. Account Ledger also needs Account. Refresh and confirm displayed range before exporting.

### Trial Balance

Shows opening debit-minus-credit, period debits/credits and closing account balances. Closing debit/credit totals should match; check Difference. A balanced report does not prove every required business transaction was entered.

### Income & Expenses

Shows posted period income/expense movements and result. It is complete business profit only when all required income/cost sources have been entered through supported postings or reviewed journals.

### Balance Sheet

Shows assets, liabilities and equity through the end date, with accumulated income less expenses as equity. Balances include posted movements through the end date, not just movements inside From/To.

### Account Ledger

Shows opening balance and individual movements for one account/range. Detail is limited to the first 1,000 rows. Narrow dates if a truncation notice appears; export does not add omitted rows.

### Export and scope

Export CSV uses displayed report data and currency. Currencies remain separate; there is no exchange-rate conversion/consolidation.

New supported expense approvals/payments and payroll approvals/payments/loan movements update Finance after setup. Automatic sales, stock/COGS and customer collection integrations are not included. Review missing sources/opening balances before treating reports as complete statements.

## 26. Finance: close or reopen a month

Open Finance > Period Close. Close and reopen require separate permissions.

### Before close

- Reconcile cash/bank to external evidence.
- Compare expense/salary payable to registers.
- Review loan balances/movements.
- Resolve unposted journals that prevent close.
- Check opening balances/source links.
- Retain the required monthly report pack.

### Close

1. Select Month and Action > Close month.
2. Enter Reason.
3. Choose Review & close.
4. Check confirmation and choose Close month.
5. Confirm closed status.

Months without a closure record are open. Close prevents new accounting postings dated in that month. It does not perform bank reconciliation or certify completeness.

### Reopen

1. Use Finance: Reopen Closed Periods permission.
2. Select the closed month and Reopen month.
3. Enter the approved reason.
4. Choose Review & reopen, review, then Reopen month.
5. Make the correction and review reports.
6. Close again when finished.

Use a valid current-period correction date where appropriate rather than falsifying original invoice dates. Do not reopen just to avoid investigating an error.

## 27. Notifications, loading and saved state

Open the header bell or Show all notifications for the Notifications Center.

### Alerts and recipients

- Expense reviewers: other creators' submitted costs needing approval.
- Expense cashiers: approved expenses still outstanding.
- Expense creators/relevant viewers: approval, rejection, return, cancellation, payment and reversal updates.
- HR reviewers: pending permitted request types.
- Linked employees: own decisions, enrollment changes, released payslips, salary payments/reversals and loan movements.
- Payroll approvers: all eligible submitted salary runs, including their own prepared runs.
- Salary cashiers: unpaid approved runs and relevant reversal updates.
- Run preparers/permitted payroll viewers: approval and return decisions.
- Loan operators: approved loans awaiting payment.
- Journal reviewers: other preparers' submitted manual/opening journals.
- Relevant journal users: posting, rejection, reversal/cancellation updates.
- Period managers: month close/reopen updates by another user.

Financial alerts follow current business and permission rules. The bell prioritizes unread items. The center puts pending work first and offers All, Needs action, Unread, Payroll, Expenses and Finance filters.

### Read and refresh

Opening an alert marks it read and opens the related screen. Mark all read does not approve, pay or resolve work. Read status belongs to the account/workspace in this browser; it does not synchronize across devices.

Alerts refresh after successful workflow changes, on returning to the app and every 30 seconds while visible. Use Refresh/Retry after errors. Background bell refresh does not block a workflow form.

Pending work remains regardless of age. Recent updates cover 30 days, with up to 100 source records per queue. Alerts are not a full audit log; use source screens/History for complete review.

### Loading and unsaved edits

Wait for the main workflow loader and read errors before relying on displayed data. A checkbox or amount edit is not saved until the save succeeds.

Workspace changes can clear forms/selections. A save already sent may finish in the original workspace. Return there and inspect the record before repeating it.

## 28. Worked examples

### Salary: setup through payment

Assume a fully payable month with PKR 50,000 basic, PKR 2,000 allowance, PKR 1,000 employee deduction and PKR 2,000 valid loan recovery, with no other adjustment.

1. Add salary effective on/before joining, tick Include in payroll and Save & enroll.
2. Review attendance, leave, overtime and disbursed loan.
3. Create/calculate regular payroll after month end.
4. Review gross PKR 52,000, deductions/recovery PKR 3,000 and net PKR 49,000.
5. Submit and obtain one authorized payroll approval; the authorized creator/preparer can approve it.
6. The employee receives a released payslip; loan recovery is committed.
7. Record PKR 20,000 actually paid; outstanding becomes PKR 29,000.
8. Record PKR 29,000 when actually paid; outstanding becomes zero.
9. Compare payroll service-month reports to Finance approval/payment dates.

Actual calculation depends on configured rules/components. Do not force these sample totals onto a different month or employee.

### Tea expense and correction

1. The employee enters Tea for the team for PKR 500 and submits it.
2. Another reviewer checks receipt/account and approves with a valid accounting date.
3. After Finance setup, approval records cost PKR 500 and payable PKR 500.
4. The cashier records PKR 200 actually paid; outstanding is PKR 300.
5. A later PKR 300 payment clears outstanding. Cost remains PKR 500.
6. If the PKR 300 entry was wrong, an authorized reverser corrects it with a date/reason. Outstanding returns to PKR 300.
7. Check History and relevant notifications.

If personal money bought the tea, explain it in payee/notes and follow the approved reimbursement process. Identify who is actually owed. Approval does not automatically reimburse the employee.

## 29. Daily, payroll-day and month-end routines

### Daily

1. Review attendance/punch issues and pending HR decisions.
2. Enter operating costs with receipts where available.
3. Obtain independent review.
4. Record actual approved payments from the correct cash, bank or drawer source.
5. Review notifications and unresolved errors.

### Before payroll approval

1. Check employees, joining/leaving dates and saved enrollment.
2. Check salary effective dates, schedules and components.
3. Finish leave/overtime/attendance decisions.
4. Check disbursed loans, balances and start months.
5. Complete needed opening allocations.
6. Calculate after the covered period ends and resolve exceptions.
7. Review employee breakdowns and totals.
8. Obtain one authorized payroll approval, then record actual payments.

### Month end

1. Reconcile cash, bank, expense/salary payable and employee loans.
2. Identify sales, stock, tax or other missing sources needing reviewed journals.
3. Resolve unposted journals and opening links.
4. Review the correct report dates/currency.
5. Retain the required report pack.
6. Close with an authorized account and clear reason.

## 30. Troubleshooting and plain-language terms

### Ticked Include in payroll, but still Not enrolled

Check unsaved status, loading errors and validation. Enter reason, ensure opening salary covers joining, complete Bank details if needed and Save & enroll. Wait for success, then reopen/refresh. A future salary alone does not cover joining.

### Why Last working day?

It limits employment and supports final settlement for a leaving employee. Leave blank for current employees; it is not a normal enrollment requirement.

### Salary or enrollment Save is disabled

Read the explanation below Save. Check reason, dates, positive salary/zero-pay policy, decimal precision, duplicate start dates, Bank fields and work schedule. Wait or Retry loading. Reset changes discards unsaved edits and reloads saved data.

### Page or action is missing

Ask Super Admin for the exact permission. Viewing, preparation, approval, payment and reversal are different. Employee-role users cannot do business-wide approvals. Salary creators/preparers may approve with Payroll: Approve; expense, journal and HR creator restrictions still apply.

### My Payroll says the login is not linked

Ask an authorized admin to check Team/Employees in the same business and confirm the correct person. Personal payroll permissions alone do not establish the profile link.

### Payslip missing or salary looks unpaid

Check workspace/month and approved run status. Only approved runs release payslips. Payment status needs actual recorded payments; approval alone is not paid. Ask the cashier to check month/reference.

### Leave/overtime approval fails

Read the message and check employment dates, overlaps, entitlement, fractions/minutes, payroll claims and reviewer independence. Correct the source issue. Paid payroll dates need reviewed adjustments.

### Run cannot submit or approve

Resolve exceptions. If sources changed, return/recalculate, review and resubmit. Check the covered period has ended. Approval needs a Super Admin or an admin with Payroll: Approve; the creator/preparer is eligible with that permission.

### Approved loan has zero outstanding

Check disbursement. Approval is permission to pay; disbursement increases balance. Recovery/repayment reduces it.

### Expense account missing/inactive

After Finance setup choose an active operating expense posting account. Group, inactive or payroll control accounts are not operating-expense choices. Return submitted records for account correction if needed.

### Duplicate invoice or timed-out save

Inspect records/History before entering another. Duplicate identity and retry keys are checked, but a new form may mean a new instruction. Confirm whether the first save finished.

### Record changed while working

Refresh and review the latest version. Retry only the still-needed action; earlier outstanding may be stale.

### Paid expense disappeared

Default payment queue shows outstanding only. Choose Paid or All approved expenses, clear filters and check workspace/dates.

### Posting date blocked

Check starting date, original source date and month lock. Use a valid correction date or request authorized reopening. Do not falsify source dates.

### Opening journal will not link/reverse

Check posted status, start date, currency and prior allocation. Selected source totals must match control balances. Linking is permanent; linked journals cannot be reversed generically.

### Notification error or old alerts

Refresh/Retry and check workspace/permissions. Allow normal refresh. Recent updates cover 30 days and bounded queues; source screens retain the transaction review. Mark all read changes read state only.

### Glossary

- Effective date: when a salary version begins.
- Enrollment: saved inclusion in payroll.
- Gross: earnings before deductions.
- Net: earnings after employee deductions/recovery.
- Employer cost: salary cost including employer contributions.
- Payable: an amount owed.
- Outstanding: the amount left to pay or recover.
- Accrual: recognizing a cost and amount owed before payment.
- Posting date: accounting date of a movement.
- Cutover/starting date: fixed beginning of the Finance workflow.
- Opening allocation: linking historical sources to a reviewed opening journal.
- Reversal: offsetting a recorded payment/posting while preserving history.
- Void: controlled cancellation of an eligible approved cost.

## 31. Current scope and boundaries

This guide covers the implemented payroll, expense and accounting foundation.

- Cash/Bank entries record external payments; no live bank transfer/refund execution.
- Configured payroll earnings/deductions are supported; statutory tax filing/calculation and automatic remittance are not provided.
- Generic deduction/employer liabilities need accountant-reviewed classification/settlement.
- Loan movement recording currently uses cash.
- Initialization does not recreate old ledger history. Historical balances need reviewed opening journals/allocation.
- Sales, collections, credit/installments, inventory valuation/COGS and supplier purchasing are not automatically integrated into this ledger.
- Bank-statement import/reconciliation, supplier bills/procurement, recurring expenses, itemized expense tax lines, budgets, fixed assets/depreciation and exchange-rate conversion are not implemented here.
- Receipts are stored with expenses; object-store receipt malware scanning is not implemented.
- Opening allocation has no general undo workflow.
- Notifications are in-app with browser-local read status; they are not email, SMS or push delivery.

Have the responsible accountant/payroll administrator review setup, rules, opening balances and reports before operation. Available screens, balanced entries or successful software tests do not certify complete statutory compliance or complete business accounting.
