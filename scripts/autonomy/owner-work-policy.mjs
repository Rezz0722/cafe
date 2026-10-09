/** Deterministic gate between an authenticated text request and the coding queue. */
const safeRoots = [
  'src/components/home/', 'src/components/search/', 'src/components/ui/',
  'src/core/search/',
];
const safeStems = [
  'src/components/cafe/CafeCard', 'src/components/cafe/CafePopover',
  'src/components/cafe/DirectionsBar', 'src/components/cafe/HoursCard',
  'src/components/cafe/MapServiceIcon', 'src/components/cafe/MenuBrowser',
  'src/components/cafe/MenuItemImage', 'src/components/cafe/PlaceCardView',
  'src/components/cafe/PlaceGallery', 'src/components/items/MenuItemCard',
  'src/core/menu/swipe',
];
const safePath = path => typeof path === 'string' && (safeRoots.some(root => path.startsWith(root)) || safeStems.some(stem => path.startsWith(`${stem}.`))) &&
  !path.includes('..') && !path.includes('node_modules') && /\.(?:ts|tsx|module\.css)$/.test(path);
const safeText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const safeList = (value, min, max, valid) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(valid) && new Set(value).size === value.length;

export function safeOwnerFileList(paths) {
  return [...new Set(paths)].filter(safePath).sort().slice(0, 900);
}

export function validateOwnerPlan(plan, availablePaths) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !['task', 'needs-data', 'research-needed', 'unsafe'].includes(plan.decision) || !safeText(plan.answer, 8, 1200)) throw Error('Invalid owner plan');
  if (plan.decision !== 'task') return { decision: plan.decision, answer: plan.answer.trim() };
  const available = new Set(safeOwnerFileList(availablePaths));
  const isFile = path => safePath(path) && available.has(path);
  const isNewAdjacentTest = path => safePath(path) && /\.test\.tsx?$/.test(path) && !available.has(path) &&
    plan.paths.some(source => {
      if (!isFile(source) || /\.test\.tsx?$/.test(source)) return false;
      const stem = source.replace(/(?:\.tsx?|\.module\.css)$/, '');
      return path === `${stem}.test.ts` || path === `${stem}.test.tsx`;
    });
  const isTaskPath = path => isFile(path) || isNewAdjacentTest(path);
  if (!safeText(plan.goal, 20, 800) || !safeText(plan.evidence, 20, 1200) ||
      !safeList(plan.paths, 2, 5, isTaskPath) || !safeList(plan.contextPaths, 0, 5, isFile) ||
      !safeList(plan.requiredTests, 1, 2, path => isTaskPath(path) && /\.test\.tsx?$/.test(path) && plan.paths.includes(path)) ||
      !safeList(plan.acceptance, 2, 5, item => safeText(item, 10, 240)) ||
      !safeList(plan.smokePaths, 1, 2, path => ['/', '/search'].includes(path))) throw Error('Owner task outside safe code scope');
  if (plan.paths.some(path => plan.contextPaths.includes(path))) throw Error('Duplicate source/context path');
  const implementation = plan.paths.filter(path => !/\.test\.tsx?$/.test(path));
  if (!implementation.length) throw Error('No implementation path');
  return {
    decision: 'task', answer: plan.answer.trim(), goal: plan.goal.trim(), evidence: plan.evidence.trim(),
    paths: plan.paths, contextPaths: plan.contextPaths, requiredTests: plan.requiredTests,
    acceptance: plan.acceptance, smokePaths: plan.smokePaths,
  };
}

export function validateDynamicTask(task, availablePaths) {
  if (!task || typeof task !== 'object' || task.phase !== 'owner-work' ||
      !/^owner-[0-9a-f-]{36}$/.test(task.id) ||
      !/^\d{13}-[0-9a-f-]{36}$/.test(task.sourceMessageId) ||
      !/^[a-f0-9]{64}$/.test(task.approvedContextHash) ||
      !Array.isArray(task.dependsOn) || task.dependsOn.length > 1 ||
      task.dependsOn.some(id => !/^owner-[0-9a-f-]{36}$/.test(id))) throw Error('Invalid dynamic task identity');
  validateOwnerPlan({ ...task, decision: 'task', answer: 'Validated owner request' }, availablePaths);
  return task;
}
