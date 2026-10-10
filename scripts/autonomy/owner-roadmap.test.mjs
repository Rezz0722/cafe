import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processNextOwnerRoadmap } from './owner-roadmap.mjs';

const id = '1791510000000-12345678-1234-1234-1234-123456789abc';
const phase = (number, decision = 'candidate') => ({
  title: `بهبود رابط کاربری ${number}`,
  goal: `نمایش بهتر متن کارت‌های محصول در بخش شمارهٔ ${number}`,
  reason: 'تغییر محدود UI است و با تست رگرسیون بررسی می‌شود.',
  decision, acceptance: ['متن در موبایل بدون خروج از کارت خوانا باشد.'],
});

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), name));
  const bridge = join(root, 'bridge');
  const inbox = join(bridge, 'messages');
  const replies = join(bridge, 'replies');
  const stateDir = join(root, 'state');
  await mkdir(inbox, { recursive: true });
  await mkdir(replies);
  await mkdir(stateDir);
  await writeFile(join(inbox, `${id}.json`), JSON.stringify({
    id, kind: 'roadmap', text: 'دو بهبود مستقل برای رابط کاربری محصول',
    createdAt: '2026-10-09T00:00:00.000Z', actorId: 'owner',
  }));
  return { root, bridge, inbox, replies, stateDir };
}

test('reviewed roadmap queues one safe child at a time and survives repeat ticks', async () => {
  const files = await fixture('kucafe-roadmap-intake-');
  try {
    const plan = { summary: 'دو بهبود کوچک رابط کاربری به ترتیب اجرا می‌شوند.', phases: [phase(1), phase(2)] };
    let calls = 0;
    const setup = {
      bridgeDir: files.bridge, stateDir: files.stateDir, engineering: {},
      quota: async () => ({}), quotaDecision: () => ({ allowed: true }),
      record: () => {},
      agent: async (role, _prompt, output) => {
        calls++;
        const value = role === 'roadmap-plan' ? plan : { accepted: true, summary: 'تقسیم فازها امن است.', issues: [] };
        await writeFile(output, JSON.stringify(value));
        return value;
      },
    };
    const first = await processNextOwnerRoadmap(setup);
    assert.equal(first.status, 'in-progress');
    assert.equal(calls, 2);
    let children = (await readdir(files.inbox)).filter(name => name !== `${id}.json`);
    assert.equal(children.length, 1);
    const firstChild = JSON.parse(await readFile(join(files.inbox, children[0]), 'utf8'));
    assert.equal(firstChild.sourceRoadmapId, id);
    assert.equal(firstChild.kind, 'work');
    assert.equal((await processNextOwnerRoadmap(setup)).status, 'in-progress');
    assert.equal((await readdir(files.inbox)).length, 2);
    const firstTask = 'owner-12345678-1234-1234-1234-123456789abd';
    await writeFile(join(files.replies, children[0]), JSON.stringify({ id: firstChild.id, kind: 'work', workStatus: 'queued', taskId: firstTask }));
    setup.engineering[firstTask] = { status: 'completed' };
    assert.equal((await processNextOwnerRoadmap(setup)).status, 'in-progress');
    children = (await readdir(files.inbox)).filter(name => name !== `${id}.json`);
    assert.equal(children.length, 2);
    const secondName = children.find(name => name !== `${firstChild.id}.json`);
    const secondChild = JSON.parse(await readFile(join(files.inbox, secondName), 'utf8'));
    const secondTask = 'owner-12345678-1234-1234-1234-123456789abe';
    await writeFile(join(files.replies, secondName), JSON.stringify({ id: secondChild.id, kind: 'work', workStatus: 'queued', taskId: secondTask }));
    setup.engineering[secondTask] = { status: 'completed' };
    assert.equal((await processNextOwnerRoadmap(setup)).status, 'completed');
    const roadmapReply = JSON.parse(await readFile(join(files.replies, `${id}.json`), 'utf8'));
    assert.deepEqual(roadmapReply.phases.map(item => item.status), ['completed', 'completed']);
    assert.equal(calls, 2);
    const nextId = '1791510000001-12345678-1234-1234-1234-123456789abc';
    await writeFile(join(files.inbox, `${nextId}.json`), JSON.stringify({
      id: nextId, kind: 'roadmap', text: 'بهبود بعدی رابط کاربری',
      createdAt: '2026-10-09T00:01:00.000Z', actorId: 'owner',
    }));
    assert.equal((await processNextOwnerRoadmap(setup)).roadmapId, nextId);
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('sensitive phase stays visible without generating an executable message', async () => {
  const files = await fixture('kucafe-roadmap-sensitive-');
  try {
    const result = await processNextOwnerRoadmap({
      bridgeDir: files.bridge, stateDir: files.stateDir, engineering: {}, record: () => {},
      quota: async () => ({}), quotaDecision: () => ({ allowed: true }),
      agent: async (role, _prompt, output) => {
        const value = role === 'roadmap-plan' ? {
          summary: 'حذف کافه به تصمیم جداگانه و امکان بازیابی نیاز دارد.',
          phases: [{ ...phase(1, 'needs-decision'), title: 'حذف کافه', goal: 'حذف رکورد کافه از پایگاه داده' }],
        } : { accepted: true, summary: 'توقف عملیات حساس درست است.', issues: [] };
        await writeFile(output, JSON.stringify(value));
        return value;
      },
    });
    assert.equal(result.status, 'needs-decision');
    assert.deepEqual(await readdir(files.inbox), [`${id}.json`]);
  } finally { await rm(files.root, { recursive: true, force: true }); }
});

test('quota wait preserves the roadmap without fabricating a plan', async () => {
  const files = await fixture('kucafe-roadmap-quota-');
  try {
    const result = await processNextOwnerRoadmap({
      bridgeDir: files.bridge, stateDir: files.stateDir, engineering: {}, record: () => {},
      quota: async () => ({}), quotaDecision: () => ({ allowed: false, reason: 'quota-reserve', retryAt: 123456 }),
      agent: async () => { throw Error('model must not run'); },
    });
    assert.deepEqual(result, { status: 'deferred', reason: 'quota-reserve', retryAt: 123456 });
    assert.deepEqual(await readdir(files.replies), []);
  } finally { await rm(files.root, { recursive: true, force: true }); }
});
