# Phase 3 combined release candidate · 0.3.0-rc.3

Prepared 20 November 2026. This review branch integrates PR #3's Phase 2 release records, PR #4's saved purchase comparisons, and PR #5's CSV preview/import. It preserves the full changes and tests from all three branches, resolves their overlapping files and adds a combined feature test. No hosted migration, real financial entry or app publication is part of this preparation.

## Release behavior

- The private Buy Simulator saves immutable named comparisons, restores original assumptions and explicitly switches to the current plan.
- Transactions parses the documented five-column UTF-8 CSV locally, checks duplicates in the private workspace, and requires confirmation before atomically importing selected rows. Retries/concurrent imports cannot duplicate exact matching ledger entries under the standard isolation tested by CI.
- CSV commit rejects a batch that would exceed the dashboard's supported derived totals, rolling back all rows; the UI retains the preview and explains that nothing was imported.
- CSV posting updates current cash while saved comparisons retain their original assumptions. The combined browser flow verifies both behaviors in the same workspace.
- Both features retain the existing no-store client and background/offline/sign-out lock. The public synthetic demo remains separate.

See PHASE3_SETUP.md and CSV_IMPORT.md for detailed formats, limits and privacy/rollback semantics. Bank-specific column guessing, transfers/loan repayments from CSV and a force-duplicate import option are outside this release.

## Read-only hosted preflight

The Supabase migration list on 20 November contains only `20261117172916`, `20261117174854` and `20261117175808`. Neither Phase 3 migration has been applied. Preflight inspected configuration metadata/advisories, not personal account records.

Security advisors report an existing `auth_leaked_password_protection` WARN: leaked-password protection is disabled. [Supabase documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) says this feature requires Pro or above. The project stays free under the owner's no-paid-services constraint; no plan, Auth settings or third-party password checks were changed. This limitation must remain visible in the release review. Performance advisors reported no WARN/ERROR. Earlier Phase 2 no-warning statements are historical and do not supersede this preflight.

## Concrete release sequence after review

1. Merge this combined PR into main after its latest head/checks are reviewed. It includes the heads of PRs #3/#4/#5; those separate review branches need not be deployed independently. Verify their final GitHub states and main tree after the merge, retaining branches until the integration is confirmed.
2. Recheck the hosted migration list. If the two new versions are absent, apply the reviewed additive migrations in order:
   - `20261120154958_saved_purchase_simulations.sql`
   - `20261120171312_csv_import_preview_and_commit.sql`
   Do not replay existing CREATE statements. Do not run bootstrap.sql or the concurrency harness on managed Supabase.
3. Run Supabase security/performance advisors after DDL. Verify new table/function ACLs and owner isolation with disposable rolled-back assertions; retain the known free-plan Auth warning and intentional private receipt no-policy INFO notices in evidence. Do not send real email or create persistent financial fixtures.
4. Use a clean private build from the approved merged source, the existing publishable configuration and the same project origin. Run lint/typecheck/tests, production build and release verification. Confirm compiled version/source; never deploy the demo or fake-project artifact as private.
5. Publish complete static assets only to the existing `folio-review` Worker, keeping the existing private origin/owner-confirmed Auth callback unchanged. Preserve automatic HTML handling and generated security headers. The `folio` synthetic Worker must remain unchanged.
6. Verify the exact hosted source/version, root, all referenced assets, PWA and security headers. Owner acceptance checks the Update app flow, save/reopen, canonical CSV preview and a disposable confirmed import/cleanup. Existing owner sessions stay origin-scoped; no new account is required.
7. Record the actual deployment/version and checks. Do not enable automatic deployment or start another feature as part of this release.

## Recovery points

Current accepted private Worker version: `ba81d6f6-dd97-42aa-8ad2-78592e4c8c4c`, source `766fa9c`. The original demo remains `5e0cb7ff-e84b-4095-9d17-cff53db0d267`. Recheck those actual versions before publication and save any newer legitimate recovery point.

For an app regression, restore the previous private asset version and verify headers/root. Retain both additive tables and import receipts; the previous app ignores them. A financial import is a separate user-confirmed mutation: asset rollback does not reverse its transactions, and no automatic financial deletion is authorized. A failed import transaction rolls back its whole batch; an uncertain response retries the unchanged request UUID. Keep CSV receipts so old retries remain idempotent.
