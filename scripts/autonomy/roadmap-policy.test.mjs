import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseRequest, validateRoadmapPlan, validateRoadmapReview } from './roadmap-policy.mjs';

const candidate = {
  title: 'بهبود کارت‌های جست‌وجو', goal: 'نمایش واضح‌تر اطلاعات کارت‌های نتیجه در موبایل',
  reason: 'تغییر محدود در UI و تست رگرسیون قابل بررسی است.', decision: 'candidate',
  acceptance: ['اطلاعات کارت در عرض موبایل خوانا باشد.'],
};

test('roadmap decomposition is bounded and refuses sensitive executable candidates', () => {
  const plan = validateRoadmapPlan({ summary: 'درخواست به دو فاز کم‌ریسک و حساس تقسیم شد.', phases: [
    candidate, { ...candidate, title: 'حذف کافه', goal: 'حذف یک رکورد کافه از دیتابیس', decision: 'needs-decision' },
  ] });
  assert.equal(plan.phases.length, 2);
  assert.match(phaseRequest(plan.phases[0]), /معیار پذیرش/);
  assert.equal(validateRoadmapPlan({ summary: 'طرح معتبر با یک فاز حساس.', phases: [{ ...candidate, goal: 'حذف کافه از دیتابیس' }] }).phases[0].decision, 'needs-decision');
  assert.throws(() => validateRoadmapPlan({ summary: 'طرح با تعداد بیش از حد فاز.', phases: Array(7).fill(candidate) }));
  assert.throws(() => validateRoadmapPlan({ summary: 'طرح با متن غیرمجاز در فاز.', phases: [{ ...candidate, goal: 'متن نامعتبر\u0000 در طرح' }] }));
});

test('independent roadmap review is structurally validated', () => {
  assert.equal(validateRoadmapReview({ accepted: true, summary: 'فازها درست تفکیک شدند.', issues: [] }).accepted, true);
  assert.throws(() => validateRoadmapReview({ accepted: 'yes', summary: 'متن نامعتبر', issues: [] }));
});
