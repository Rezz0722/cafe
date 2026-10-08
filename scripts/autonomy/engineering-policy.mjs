import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function canCarryReview(entry, previousSources, nextSources) {
  return entry.review?.accepted === true && entry.reviewedHash === entry.patchHash && previousSources != null && nextSources != null && hash(previousSources) === hash(nextSources);
}
export function validatePatch(task, patch, originals) {
  if (!patch || typeof patch.summary !== 'string' || !Array.isArray(patch.files) || !patch.files.length || patch.files.length > task.paths.length) throw Error('Empty or invalid patch');
  if (Buffer.byteLength(JSON.stringify(patch)) > 280000) throw Error('Patch exceeds budget');
  const seen = new Set();
  for (const f of patch.files) {
    if (typeof f.path !== 'string' || !task.paths.includes(f.path) || seen.has(f.path) || f.path.includes('..') || f.path.startsWith('/') || /(?:^|\/)(?:\.github|scripts|drizzle|public|node_modules|\.codex|\.git)(?:\/|$)/.test(f.path)) throw Error('Path outside authorization');
    seen.add(f.path);
    if (typeof f.content !== 'string' || !f.content.trim() || f.content.includes('\0') || Buffer.byteLength(f.content) > 120000) throw Error('Invalid file');
    const before = originals[f.path] ?? '';
    if (before === f.content) throw Error('Unchanged file');
    const oldLines = new Set(before.split('\n'));
    const added = f.content.split('\n').filter(line => !oldLines.has(line));
    const newLines = new Set(f.content.split('\n'));
    const removed = before.split('\n').filter(line => !newLines.has(line));
    if (added.length > 180 || removed.length > 180) throw Error('Change budget exceeded');
    const addedText = added.join('\n');
    if (/child_process|node:fs|node:net|node:http|process\.env|DATABASE_URL|SESSION_SECRET|x-api-key|BEGIN .*PRIVATE KEY|eval\s*\(|new Function\s*\(|fetch\s*\(|https?:\/\//i.test(addedText)) throw Error('Sensitive operation outside task');
    if (/[A-Za-z0-9_-]{45,}/.test(addedText)) throw Error('Potential embedded secret');
  }
  if (task.requiredTests.some(p => !seen.has(p))) throw Error('Regression tests required');
  return hash(patch.files);
}
export function selectTask(roadmap, state) {
  return roadmap.tasks.find(t => {
    const e = state.tasks[t.id];
    if (e && ['completed','blocked','deployment-failed','review-rejected','conflict'].includes(e.status)) return false;
    return t.dependsOn.every(id => state.tasks[id]?.status === 'completed');
  }) ?? null;
}
export function ciDecision(rollup) {
  if (!Array.isArray(rollup) || !rollup.length) return 'waiting';
  if (rollup.some(c => ['FAILURE','CANCELLED','TIMED_OUT','ACTION_REQUIRED','STARTUP_FAILURE'].includes(c.conclusion))) return 'failed';
  if (rollup.every(c => c.status === 'COMPLETED' && c.conclusion === 'SUCCESS') && rollup.some(c => c.name === 'verify')) return 'passed';
  return 'waiting';
}
export function canMerge(entry, pr, diskBytes) {
  return entry.review?.accepted === true && entry.reviewedHash === entry.patchHash && pr.headRefOid === entry.headSha && pr.baseRefName === 'production' && pr.state === 'OPEN' && pr.mergeStateStatus === 'CLEAN' && ciDecision(pr.statusCheckRollup) === 'passed' && diskBytes >= 2.5 * 1024 ** 3;
}
