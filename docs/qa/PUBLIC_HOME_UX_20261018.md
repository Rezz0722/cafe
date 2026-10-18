# Public homepage UX — QA (2026-10-18)

Baseline: `dde8f4e723944d75cddc171c7c6c08c8ec850f7d`. The approved Hero and PR #84 “مشاهده همه تجربه‌ها” CTA are unchanged.

- Removed the homepage-only “قیمت‌های ثبت‌شده را ببین” panel, its `listPopularDishes(8)` query, and unused styles. Dish taxonomy, “چی بخوریم؟” links, and café-page comparison remain unchanged.
- The food category grid now fills the available width. The district hub has an unmistakable mobile CTA after the district rail; the desktop heading link remains. The evidence-based recommendation heading now reads “از این کافه‌ها شروع کن”.

Evidence: [before (390px, dark)](public-ux-home/before/home-390-dark.jpg), [after (390px, dark)](public-ux-home/after/home-390-dark.jpg), [before (390px, light)](public-ux-home/before/home-390-light.jpg), [after (390px, light)](public-ux-home/after/home-390-light.jpg). Additional 360px/1440px screenshots and viewport metrics are in the same folders. At 390px dark, document height changed from 5232px to 5058px with 0px horizontal overflow.

Validation on the isolated production build: Typecheck pass, ESLint pass, Next.js build pass, 477 unit tests pass / 0 fail / 16 pre-existing skips. Existing `home-ui:smoke` passed at 320px, 360px, 390px, 430px and desktop. The screenshot sweep passed 12 homepage/search viewport-theme visits with no page errors or document overflow.

Review cards, secondary text and safe-area spacing were inspected in both themes; no additional low-risk correction was supported by the evidence. No data write, schema change or TopMenu Apply was performed.
