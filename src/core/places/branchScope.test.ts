import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyMenuBranchScope } from './branchScope.ts'

test('دستهٔ عمومی میان شعبه‌ها مشترک می‌ماند', () => {
  assert.equal(classifyMenuBranchScope('نوشیدنی گرم / Coffee', 'قاضی طباطبایی').branchScope, 'shared')
})

test('دستهٔ شعبهٔ فعلی به همان شعبه متصل می‌شود', () => {
  assert.equal(classifyMenuBranchScope('صبحانه (قاضی طباطبائی)', 'قاضی طباطبایی').branchScope, 'branch')
})

test('دستهٔ شعبهٔ دیگر از صفحهٔ فعلی جدا می‌شود', () => {
  for (const name of [
    'صبحانه (شعبات حافظ و ارمیتاژ)',
    'جلاتوبار (انحصاری شعبه ژلاتو)',
    'ساندویچ و برانچ (شعبه ابوذر غفاری و سجاد)',
  ]) {
    assert.equal(classifyMenuBranchScope(name, 'قاضی طباطبایی').branchScope, 'other_branch')
  }
})
