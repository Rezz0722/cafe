import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processNextOwnerWork } from './owner-work.mjs';

const id = '1791510000000-12345678-1234-1234-1234-123456789abc';
const paths = ['src/core/search/sort.ts', 'src/core/search/sort.test.ts'];
const plan = {
  decision: 'task', answer: 'درخواست به یک اصلاح کوچک و قابل آزمون تقسیم شد.',
  goal: 'انتخاب صریح ترتیب نتایج جست‌وجو را در همهٔ حالت‌ها حفظ کن.',
  evidence: 'کد موجود هنگام داشتن موقعیت مکانی، مرتب‌سازی صریح را نادیده می‌گیرد.',
  paths, contextPaths: [], requiredTests: ['src/core/search/sort.test.ts'],
  acceptance: ['ترتیب انتخابی کاربر حفظ شود.', 'تست رگرسیون این رفتار اضافه شود.'], smokePaths: ['/search'],
};
test('work request is quota-safe, reviewed, idempotently queued and visibly answered', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-owner-work-'));
  const bridge = join(root, 'bridge'); const stateDir = join(root, 'state');
  const inbox = join(bridge, 'messages'); const replies = join(bridge, 'replies');
  await mkdir(inbox, { recursive: true }); await mkdir(replies); await mkdir(stateDir);
  try {
    await writeFile(join(inbox, `${id}.json`), JSON.stringify({ id, kind: 'work', text: 'اصلاح ترتیب جست‌وجو را انجام بده', createdAt: '2026-10-09T00:00:00Z' }));
    let allowed = false; let calls = 0;
    const setup = {
      bridgeDir: bridge, stateDir, getPaths: async () => paths, getBaseSha: async () => 'a'.repeat(40),
      sourceAt: async () => Object.fromEntries(paths.map(path => [path, 'existing source'])),
      quota: async () => ({}), quotaDecision: () => allowed ? { allowed: true } : { allowed: false, reason: 'quota-reserve', retryAt: 123456 },
      agent: async (role, _prompt, output) => {
        calls++;
        const result = role === 'owner-plan' ? plan : { accepted: true, summary: 'Small and safe', issues: [] };
        await writeFile(output, JSON.stringify(result));
        return result;
      },
      record: () => {},
    };
    assert.deepEqual(await processNextOwnerWork(setup), { status: 'deferred', reason: 'quota-reserve', retryAt: 123456 });
    assert.equal(calls, 0);
    allowed = true;
    const queued = await processNextOwnerWork(setup);
    assert.equal(queued.status, 'queued');
    assert.equal(calls, 2);
    const tasks = JSON.parse(await readFile(join(stateDir, 'owner-work-tasks.json'), 'utf8'));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].sourceMessageId, id);
    const replyFile = join(replies, `${id}.json`);
    assert.equal(JSON.parse(await readFile(replyFile, 'utf8')).workStatus, 'queued');
    await unlink(replyFile);
    assert.equal((await processNextOwnerWork(setup)).status, 'queued');
    assert.equal(calls, 2);
    assert.equal(JSON.parse(await readFile(join(stateDir, 'owner-work-tasks.json'), 'utf8')).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sensitive request gets a visible boundary, not an executable task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-owner-work-sensitive-'));
  const bridge = join(root, 'bridge'); const stateDir = join(root, 'state');
  const inbox = join(bridge, 'messages'); const replies = join(bridge, 'replies');
  await mkdir(inbox, { recursive: true }); await mkdir(replies); await mkdir(stateDir);
  try {
    await writeFile(join(inbox, `${id}.json`), JSON.stringify({ id, kind: 'work', text: 'دیتابیس را حذف کن', createdAt: '2026-10-09T00:00:00Z' }));
    const result = await processNextOwnerWork({
      bridgeDir: bridge, stateDir, getPaths: async () => paths, getBaseSha: async () => { throw Error('must not read'); },
      sourceAt: async () => { throw Error('must not read'); }, quota: async () => ({}), quotaDecision: () => ({ allowed: true }),
      agent: async (_role, _prompt, output) => {
        const planResult = { decision: 'unsafe', answer: 'حذف دیتابیس خارج از محدودهٔ اجرای خودکار است.', goal: '', evidence: '', paths: [], contextPaths: [], requiredTests: [], acceptance: [], smokePaths: [] };
        await writeFile(output, JSON.stringify(planResult)); return planResult;
      }, record: () => {},
    });
    assert.equal(result.status, 'unsafe');
    assert.equal(JSON.parse(await readFile(join(replies, `${id}.json`), 'utf8')).workStatus, 'unsafe');
    await assert.rejects(readFile(join(stateDir, 'owner-work-tasks.json'), 'utf8'), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
