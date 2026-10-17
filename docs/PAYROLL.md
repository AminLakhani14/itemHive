# ItemHive payroll

Payroll is available at `/payroll`; linked employees use `/my-payroll`. Financial changes require a MongoDB replica set (Atlas or a local replica set) because approval, payments, loan movements and sales commissions use transactions.

## Initial business setup

1. Assign explicit payroll permissions in Permissions. Existing unrestricted admin screen access does not grant payroll access. Give preparers `payroll_view` and `payroll_prepare`, approvers `payroll_view` and `payroll_approve`, payment operators `payroll_view` and `payroll_pay`, and add `payroll_reports`, `payroll_settings`, or `payroll_hr` as needed. A super admin still cannot approve their own prepared run.
2. Open Payroll → Settings, confirm the business currency and timezone, configure leave entitlement/opening balances/carry limits, holidays and pay policies, and enable payroll. Defaults are PKR and Asia/Karachi. Supported currencies use two decimal minor units. Currency/timezone cannot change after the first approved run.
3. Run **Migrate opening salaries**. This is safe to repeat. It creates an opening salary version using the existing salary, joining date and weekly off settings. Existing admin leaves remain approved. It does not reconstruct past salary changes or historical commission attribution.
4. Complete each employee's Payroll profile, joining date, employment end date if applicable, schedule, salary components, commission percentage and payment details; then enroll them. Team-created profiles start unenrolled. Future salary versions take effect on their specified date.
5. Review a trial calculation against attendance, loans and sales before submitting the first real run. Enable commissions only after verifying employee login linkage and the salesperson selector.

## Monthly operation

Create one regular monthly run after the period ends. Daily and hourly staff are included in the same run. Missing punches and leave/punch conflicts require approved attendance review requests or corrected punches; approved overtime is separate. Resolve every exception and negative net amount before submitting.

Calculated lines retain rates, quantities, formulas and source references. Submission checks the source fingerprint and freezes the calculation. A different authorized admin approves or returns it. Approval freezes the payslip, claims paid employment days and posts commission and loan recovery once. Returned runs must be calculated again. Approved runs cannot be edited; use a linked adjustment run. Final settlements use employment end dates, remaining loan balances and explicit reasoned benefit/leave-encashment adjustments. Day claims prevent duplicate base salary between regular and settlement runs.

Monthly salaries use actual calendar days. Paid leave, holidays and off days remain payable for monthly staff. Daily/hourly paid non-work time defaults off. Schedules and salary components are effective dated; recurring fixed/percentage components have explicit proration. Overtime defaults to multiplier 1.0; late/early deductions default disabled. Loans are interest-free and recoverable only after disbursement.

Payments record cash/bank amounts, dates, references and reasons without moving bank money or affecting POS tills. Partial/bulk payments enforce outstanding balances. Reverse a payment with an audited entry instead of deleting it. Payslips are released at approval; their earnings stay frozen while paid/outstanding amounts reflect recorded payments.

Sales commission uses verified salesperson IDs and sale-date salary rates on discounted subtotal excluding tax. Credit/installment sales earn once at sale, not at collection. Drafts, inventory movements and historical unattributed sales do not earn. Reversing a posted sale queues a negative commission adjustment for the next payroll without altering the released slip.

Employee portal identity comes from the signed-in account and current business membership. Personal APIs do not accept another employee ID. Bank account details are masked outside authorized profile preparation. Employees with payroll references must be archived rather than deleted.

## Reports

Payroll register, outstanding salary, payment entries/reversals, attendance impact, commissions, loans, loan movements, department cost/variance, leave balances and audit are available with employee/department/designation/period filters. Register amounts come from approved snapshots. Payment and loan reports use the financial ledgers. Audit displays the latest 500 matching events. Leave balances accrue monthly from configured annual entitlement and include opening/carry rules and approved leave. Employee payslips download as paginated A4 PDF; report tables export Excel/CSV and print on A4 landscape.

There is no statutory tax engine, general accounting ledger, live bank integration, automatic interest or POS till salary payout. Configure tax as a general deduction.

## Validation

From the repository root:

```powershell
npm.cmd run build
cd backend
npm.cmd test
```

Tests start an isolated MongoDB replica set with a randomly named test database; they never connect to the configured production URI. The first run downloads MongoDB into ignored `.cache/mongodb-binaries`. The API suite covers tenant and permission boundaries, salary migration, independent/stale approval, immutable snapshots, day claims, loans, payment retries/reversals/overpayment, commission reversals and reconciled personal/report totals. Calculator tests cover calendar lengths/leap years, effective salary segments, joining/leaving, half-day leave, paid non-work time, hourly breaks, overnight work, overtime, component proration and negative net prevention.

For disposable browser QA, build the backend and run `$env:PAYROLL_PREVIEW='1'; node --test dist/services/payrollWorkflow.test.js`. It hosts synthetic accounts at `127.0.0.1:5051`; point a separate Vite process at that API. Preview accounts and passwords are printed by the test. POST `/__preview/close` to finish and clean up the test database. The preview server exists only in the test file and is never mounted by the production server.

Live business migration, enablement and payroll payments are deliberately not performed by tests. Deployment acceptance should additionally exercise real POS checkout retries/stock, installment completion, scanner hardware, workspace switching, large exports and multi-page PDF layout using representative business data.
