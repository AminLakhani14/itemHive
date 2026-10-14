# Payroll and finance implementation audit — 2026-10-13

## Implemented scope

Payroll, Finance and My Workspace are task hubs with separate protected URLs. Payroll screens cover employee salaries/enrollment, settings, each HR request family, loan movements, runs/approval, salary payments and reports. Finance screens cover accounts, opening allocation, personal submissions, the expense register, approval, settlement, journals, accounting reports and period control. The manual is searchable in-app and downloadable.

Chart of Accounts provides five account types, group/posting hierarchy, default accounts, custom codes, protected mappings, active status, optimistic versions and change history. Finance setup has an explicit immutable starting date. Manual/opening journals require balanced integer minor units, active tenant accounts and independent approval. Posted amounts remain immutable. Linked reversals and period locks protect corrections. Retired custom accounts can receive a reversal of their original posting, while new postings are blocked.

Expense approval recognizes cost/payable; payment settles the payable without a second cost; payment reversal restores it. Payroll approval maps frozen employer cost, net salary, loan recovery, deductions and employer contributions to matching accounts. Salary payment settles salary payable. Loan issue/repayment mirrors actual cash movements. Source mutations and journals commit together in MongoDB transactions. Starting/opening balances are reviewed and explicitly allocated; history is not automatically replayed.

## Concrete defects corrected

| Finding | Resulting behavior |
| --- | --- |
| Restricted financial accounts landed on a denied dashboard after login | Home resolves to an allowed payroll/finance/personal hub, with profile fallback |
| Balance Sheet CSV omitted the equity result displayed on screen | CSV includes accumulated income less expenses; spreadsheet text exports guard formula-leading user text |
| Payroll combined settings, HR, runs and settlement on one screen | Separate routes and task cards show a numbered operational flow |
| Enrollment checkbox could be mistaken for saved state; reason was buried below salary controls | Separate saved-status badge, unsaved-change notice and nearby profile reason/save action |
| Payroll list ignored the profile-saved event | List refreshes immediately after saving enrollment/salary; saved enrollment persists after reload |
| Salary-settings-only admins could open the route but failed compensation/profile reads | Matching API grants and page-specific reads; opening salary defaults to joining date and HR base salary |
| Salary payment screen required navigating back to runs to start payment | Approved-run selection is available on the settlement screen |
| Expense queues implicitly filtered the current month | All dates by default; old drafts/pending approvals/unpaid invoices remain visible |
| Paid expenses crowded the payment queue; refund history was hard to find | Outstanding-only default plus unpaid/partial/paid/all filters; paid history retains reversal actions |
| Invoice date was the only accounting date | Independent open-period posting date preserves the original invoice date |
| Browser currency defaults rounded fractional PKR display | Payroll/finance values explicitly show two decimal places |
| Draft edit payload included fields beyond editable data | Explicit draft/profile request fields keep server-owned state out of writes |
| Personal features lacked explicit grants; permission editor could preselect financial grants for legacy accounts | Personal features require grants; existing financial permissions remain explicit, and user grants are restricted to personal features |
| HR/loan access implied broader payroll access, and payment/close grants implied corrections | Separate HR request families, loan view/manage, salary/expense reversals, expense void and period reopen rights |
| Financial payment viewers could query private drafts; search could widen a combined visibility predicate | Server visibility is action-scoped and search intersects it |
| Invoice duplication, request retry and stale/concurrent financial changes could confuse workflows | Tenant invoice keys, idempotent HR/source events, optimistic profile versions and transactional settlement guards |
| Historical payable settlement could create a second cost or omit ledger settlement | Reviewed opening allocation links specific historical salary/expense/loan balances |

## Verification

Latest backend validation: `npm.cmd test` compiled the backend and passed **43 tests**, with no skips. These run a disposable MongoDB replica set and genuine authenticated HTTP requests, not the configured business database. Coverage includes salary setup/enrollment/list persistence, tenant isolation, fine-grained grants, independent HR/journal review, invoice duplication, retries, simultaneous payments, payroll cost/recovery/payment reconciliation, old-invoice queues, opening allocations, retired-account reversals, earlier-reversal rejection, period-close races and POS drawer paid-out/refund reconciliation with frozen closed-shift reports.

Frontend production build passed using the existing lockfile versions. A missing declared dependency was restored; `package.json` and the frontend lockfile were not changed for this repair. `git diff --check` passed. Existing bundle-size notices are not acceptance failures.

Browser verification used synthetic employee, reviewer and salary-settings-only accounts in a disposable workspace. Observed flows: employee leave/loan creation, independent review, expense draft create/edit/submit/approve, partial payment and reversal, old-invoice full settlement and paid history, permission-denied direct route, Chart of Accounts display, balanced accounting reports, leave-only navigation and request review, rendered manual topics, and opening salary → enrollment → immediate list update → reload persistence. The final manual search/download and latest landing redirect were not browser-verified because browser control timed out. The enrollment screenshot is in `artifacts/payroll-finance-qa/enrollment-after-save.jpg`.

This is local source/build/disposable-browser evidence. The configured `localhost:5050` backend and `localhost:5173` frontend were not responding during the check. No real business enrollment, expenses, permissions, opening balances, production migration, bank transfers, commit or remote deployment were performed. An authenticated walkthrough of the actual client workspace is still required to verify its data/configuration and deployed version.

## Remaining boundaries

This is a working payroll/expense/accounting foundation, not completion of every phase in `FINANCE_MANAGEMENT_PLAN.md`. Automatic sales/credit/installment/inventory postings, supplier procurement, bank statement reconciliation, statutory taxes, recurring expenses, itemized expense tax lines, assets/depreciation, budgets, FX and secure object-store receipt scanning remain outside the implemented scope. Generic payroll deductions/employer liabilities need accountant-reviewed classification and settlement. Loan movements currently use cash. Allocated opening journals are intentionally not generically reversible; historical allocation corrections need a reviewed correction workflow. Reports disclose that uncovered business sources are not automatically included.

Before client rollout, deploy frontend/backend together, grant only the chosen features/actions, review the starting date and opening reconciliation, verify backup/restore, and run the real-workspace acceptance flows. Do not infer a complete production go-live from the automated test count.
