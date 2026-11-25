I am continuing development of my private personal-finance PWA, Folio, in this Business workspace.

Repository https://github.com/Quant-17/personal-finance-pwa
Private app https://folio-review.sid-17061999.workers.dev/

Read BUSINESS_WORKSPACE_HANDOFF.md and AGENTS.md from the repository, then consult the relevant architecture, data model and feature documents. Start from the current main branch. Verify the repository and live release because the handoff is dated 25 November 2026. Its baseline is private v0.7.0-rc.1, approved source 70658637c06aa2825b7cfdde9b0d6a0254cad86e, with application work merged through PR #35.

Use the existing Supabase project and Cloudflare Workers deployment identified in the handoff. Check that this workspace has the necessary repository and connector permissions. Do not recreate financial infrastructure as part of connecting this workspace.

Preserve the iPhone-first UI, Overview-first launch, vertical Sections menu, full transaction section, local SBI/Kotak PDF statement review, remembered rules, reconciliations, loans, subscriptions, investments, forecasts and both simulators. Keep integer-paise/decimal-safe accounting, actual-versus-planned distinctions, saved-comparison history, owner RLS and retry safeguards. The Gmail/Google receipt integration was intentionally removed.

Use synthetic data for development and verification. Real financial figures and schedules live in private app records. Do not import template statements, export/delete/restore my real workspace, infer opening figures or expose credentials during acceptance tests. Raw PDFs and passwords stay on the device. Keep future implementation scoped to my next request, with a review PR and appropriate checks.

Give me a short confirmation of the verified starting state and any actual connection blocker. Then continue with the next task I provide. The handoff itself does not request another feature or deployment.
