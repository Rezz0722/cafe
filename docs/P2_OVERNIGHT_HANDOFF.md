# P2 Overnight — Checkpoint / Handoff

Date: 2026-10-16. Production is read-only for this sprint. Do not merge/deploy/migrate or run TopMenu Apply without a separate release authorization.

| Checkpoint | Completed work | Branch / commit | Tests | Open issue / next step |
| --- | --- | --- | --- | --- |
| P2-01 | Signed batch Preview, atomic Apply, role/branch/revision guards, owner overrides, audit, responsive panel | `feat/p2-01-safe-batch-menu` / `47144a2ea7e0fe74a57dafe3be3b3bba1a2dee7f`, PR #71 | Typecheck, lint, build, CI and isolated MariaDB pass | Review #71; no merge in this task |
| P2-03 | Owner guide, pilot playbook, scorecard, Excel/QR/price/issue packs and deterministic sample CSV | `docs/p2-pilot-readiness` / `6bf70110d087785ee67dbd8e4dedb012adaff3b3`, PR #72 | CI and deterministic sample/BOM checks pass | Real Excel, QR, pilot venues pending |
| P2-02 | Existing JSON v1/CSV create-only import with signed Preview, atomic Apply, conflict handling, audit and browser QA | `feat/p2-02-menu-roundtrip` / initial `10a7c26377c66793a9b05eefee0b929e6b5c3d27`, PR #73 stacked on #71 | Typecheck, lint, build, 464 unit pass/11 env skips, 11 isolated integration pass, browser 320/360/430/1440 pass | Verify final CI; rebase/base-change only after #71 merges |

Disposable QA MariaDB was created as `kucafe-p2-batch-qa` on `127.0.0.1:3397` with database `kucafe_menu_import_test`; it must be stopped after final QA and must never be confused with Production. The isolated build directory is `.next-p2` and is ignored. Production GitHub SHA and App/Worker image tags were `4fed25fe3e578c4480fff4b192dbaf2a62e6b3bf` / `sha-4fed25fe3e57` at the last read-only check. No Production write occurred.

Final managerial report: `docs/P2_OVERNIGHT_REPORT_FA.md`. Design details: `docs/P2_01_SAFE_BATCH_MENU_FA.md`, `docs/P2_02_MENU_ROUNDTRIP_FA.md`, and `docs/P2_03_PILOT_READINESS_FA.md` on their respective branches. Do not interpret local browser or CI pass as real cafe/Excel/printed-QR validation.
