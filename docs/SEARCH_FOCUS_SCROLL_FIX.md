# Search submit focus-scroll race

The production Phase 0 browser matrix reproduced Firefox search submission
timeouts on desktop (including a no-JS journey). A minimized public diagnostic
recorded pointerdown on BUTTON at y=632, then pointerup on DIV: the button moved
from y=609 to y=572 during focus scrolling. No submit or navigation request was
emitted, and no runtime exception occurred. This is distinct from HTTP 502.

Changing only document scroll behavior to auto while a search form has focus
kept the click target stationary and passed six controlled Firefox desktop
repetitions. The production fix is scoped to `form[role=search]:focus-within`;
normal anchor scrolling outside forms and explicit menu animations remain.

Regression journey: `KUCAFE_QA_ENGINE=firefox KUCAFE_QA_WIDTHS=390,1440 npm run
phase0:ui-smoke -- https://kucafe.ir`, plus `scripts/search-nojs-smoke.ts`.
The former failed on the original production CSS before the fix. Public QA
reports retain the before/after event evidence. This change does not claim to
fix React hydration, server errors, SMS delivery or Android WebOTP.

Rollback: revert the scoped CSS rule through a protected production PR.
