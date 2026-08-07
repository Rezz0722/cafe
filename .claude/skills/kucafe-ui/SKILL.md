---
name: kucafe-ui
description: Design system rules for کو کافه (KuCafe) — RTL Persian UI, the token set in src/app/tokens.css, CSS Modules conventions, mobile-first density, and touch-target/typography floors. Load BEFORE writing or editing any .module.css file, any component's visual markup, or when a request mentions layout, spacing, "too much empty space", mobile experience, sheets/menus, or Persian typography.
---

# کو کافه UI

Persian, RTL, mobile-majority, offline-capable. Next.js App Router + CSS Modules.
No Tailwind, no CSS-in-JS, no component library. Every visual value comes from a
token in [tokens.css](../../../src/app/tokens.css).

## Hard rules

1. **Never hard-code a color, radius, shadow, or font size.** Use the token. If
   no token fits, add one to `tokens.css` — don't inline a hex.
   `#fff` is the single exception: it is the legitimate ink on `--c-primary`.
2. **Logical properties only.** `inset-inline-start`, `margin-inline`,
   `padding-inline-end`, `text-align: start/end`, `border-start-start-radius`.
   `left`/`right`/`margin-left` mirror wrong under `dir="rtl"` and are bugs.
3. **Numbers pass through `fa()`** from `@/lib/format`, money through `toman()`.
   Any element showing digits gets `font-variant-numeric: tabular-nums` so
   columns don't jitter.
4. **Latin text inside Persian gets `direction: ltr`** on its own element
   (English names, phone numbers, URLs, coordinates, time inputs).
5. **CSS Modules, one file per component, kebab-comment sections in Persian**
   matching the existing files (`/* ── تیتر ─── */`). Class names are camelCase.

## Density — the recurring failure

The pattern that keeps producing complaints: a section that is *technically
informative* but spends 300px of scroll on it. Before adding a block, ask what
decision it changes. If none, it is decoration and costs the user their scroll.

- One row of 7 label/value pairs is worse than 2 rows of merged equals. Collapse
  repetition (identical weekdays, identical prices) before rendering.
- 5+ sibling action buttons is a soup. Promote one, fold the rest into a sheet.
- Chip lists that wrap to 3+ lines are a wall, not a summary. Cap and count.
- A heading + note + list where the list has ≤3 short entries: drop the note.

## Type scale

`--fs-xs 12 · --fs-sm 13.5 · --fs-base 14.5 · --fs-md 16 · --fs-lg 19 ·
--fs-xl 22 · --fs-2xl 28 · --fs-3xl 36 · --fs-hero 52`

Dana runs small for its metrics — **never below `--fs-xs` (12px)** for anything a
user must read, and body copy stays at `--fs-base` or above. Persian needs more
leading than Latin: `line-height: 1.8` for paragraphs, `1.5` for headings, never
below `1.4`. Weights available: 400 / 500 / 600 / 700 / 800 / 900. Headings are
800; labels and pills are 700; body is 400.

## Color pairings that are safe

| Surface | Ink |
| --- | --- |
| `--c-surface` | `--c-ink`, secondary `--c-ink-2`, tertiary `--c-muted` |
| `--c-primary` | `#fff` |
| `--c-primary-soft` | `--c-primary-strong` |
| `--c-accent-soft` | `--c-accent-text-strong` |
| `--c-open-bg` | `--c-open` |
| `--c-closed-bg` | `--c-closed` |
| `--c-pastel-green` | `--c-pastel-green-text`, body `--c-pastel-green-body` |

`--c-muted-3` and lighter are for hints and disabled state only — never for
content. **State is never carried by color alone**: the open/closed pill says
"باز است" in words as well as green.

## Touch and motion

- Tap targets ≥ 44×44px on anything a thumb hits. A 28px icon button in a
  sticky bar is a miss-tap generator; pad it out.
- Sticky bars offset by `var(--header-h)` + `var(--view-as-h)`, never a literal.
- Transitions use `--t-fast` (0.15s) for hover, `--t-base` (0.2s) for open/close.
  Wrap anything that moves in `@media (prefers-reduced-motion: reduce)` and
  disable it there.
- Focus is visible: `box-shadow: 0 0 0 3px var(--c-primary-soft)` with
  `border-color: var(--c-primary)`, matching `.input:focus` in the panels.

## Breakpoints in use

`900px` (two-column → one), `760px` (header collapses to a drawer, `--page-pad`
tightens), `640px` (form rows stack), `520px` (page gutter 12px, thumbs shrink).
Reuse these four. A fifth breakpoint means the layout wants
`minmax()`/`auto-fit` instead of a query.

## Mobile menus and pickers

A list of 3+ choices on mobile is a **bottom sheet**, not a dropdown: fixed to
`inset-inline: 0; inset-block-end: 0`, rows ≥ 48px, a scrim behind it, closes on
scrim click and Escape, and traps nothing (no focus-trap library here — just
return focus to the trigger). Above 640px the same component may render as an
anchored popover. Both need `role="menu"` / `role="dialog"` and
`aria-expanded` on the trigger.

## Checklist before finishing a visual change

- [ ] No literal hex, px radius, or px shadow outside `tokens.css`
- [ ] No physical direction properties
- [ ] Digits Persian + tabular
- [ ] Reads at 360px wide without horizontal scroll
- [ ] Tap targets ≥ 44px
- [ ] Focus ring present on every interactive element
- [ ] Nothing renders an empty container when its data is missing — the whole
      block is conditional, so an absent field costs zero space
