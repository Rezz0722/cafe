import test from 'node:test';
import assert from 'node:assert/strict';
import { safeOwnerFileList, validateOwnerPlan, validateDynamicTask } from './owner-work-policy.mjs';

const paths = ['src/core/search/sort.ts', 'src/core/search/sort.test.ts', 'src/components/home/Hero.tsx', 'src/core/auth/session.ts', 'scripts/deploy.sh'];
const plan = {
  decision: 'task', answer: 'این تغییر کوچک قابل آزمون است.',
  goal: 'ترتیب نتایج جست‌وجو را در حالت مرتب‌سازی صریح حفظ کن.',
  evidence: 'رفتار موجود در فایل ترتیب جست‌وجو با انتخاب کاربر ناسازگار است.',
  paths: ['src/core/search/sort.ts', 'src/core/search/sort.test.ts'],
  contextPaths: ['src/components/home/Hero.tsx'], requiredTests: ['src/core/search/sort.test.ts'],
  acceptance: ['مرتب‌سازی صریح کاربر حفظ شود.', 'تست رگرسیون برای مسیر تغییر اضافه شود.'], smokePaths: ['/search'],
};
test('owner plan is bounded to existing low-risk source and regression tests', () => {
  assert.deepEqual(safeOwnerFileList(paths), paths.slice(0, 3).sort());
  assert.equal(validateOwnerPlan(plan, paths).decision, 'task');
  const newTest = { ...plan, paths: ['src/components/home/Hero.tsx', 'src/components/home/Hero.test.tsx'], contextPaths: [], requiredTests: ['src/components/home/Hero.test.tsx'] };
  assert.equal(validateOwnerPlan(newTest, paths).decision, 'task');
  assert.throws(() => validateOwnerPlan({ ...newTest, paths: ['src/components/home/Hero.tsx', 'src/components/home/Unrelated.test.tsx'], requiredTests: ['src/components/home/Unrelated.test.tsx'] }, paths));
  assert.throws(() => validateOwnerPlan({ ...plan, paths: ['src/core/auth/session.ts', 'src/core/search/sort.test.ts'] }, paths));
  assert.equal(safeOwnerFileList(['src/core/experience/admin.ts', 'src/core/items/queries.ts', 'src/components/cafe/ReviewForm.tsx']).length, 0);
  assert.throws(() => validateOwnerPlan({ ...plan, requiredTests: [] }, paths));
  assert.throws(() => validateOwnerPlan({ ...plan, contextPaths: ['scripts/deploy.sh'] }, paths));
  assert.equal(validateOwnerPlan({ decision: 'needs-data', answer: 'اطلاعات کافی برای مسیر اجرایی موجود نیست.' }, paths).decision, 'needs-data');
  assert.equal(validateDynamicTask({ ...plan, id: 'owner-12345678-1234-1234-1234-123456789abc', phase: 'owner-work', sourceMessageId: '1791510000000-12345678-1234-1234-1234-123456789abc', approvedContextHash: 'a'.repeat(64), dependsOn: [] }, paths).phase, 'owner-work');
});
