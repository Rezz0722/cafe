/** A roadmap is an owner proposal, not authorization to run arbitrary code. */
const safeText = (value, min, max) => typeof value === 'string' && value.trim().length >= min &&
  value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const decisions = new Set(['candidate', 'needs-evidence', 'needs-decision', 'unsafe']);
const sensitive = /(?:\b(?:admin|auth|login|database|migration|migrate|docker|deploy|secret|sms|billing|payment|infra|delete|remove|purge|schema|api)\b|دیتابیس|پایگاه داده|مهاجرت|حذف|پاکسازی|احراز هویت|پرداخت|پیامک|زیرساخت|سرور|دیپلوی|استقرار|دسترسی مدیر)/iu;

export function validateRoadmapPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !safeText(value.summary, 12, 900) || !Array.isArray(value.phases) ||
      value.phases.length < 1 || value.phases.length > 6 ||
      Buffer.byteLength(JSON.stringify(value)) > 20000) throw Error('Invalid roadmap plan');
  const phases = value.phases.map(phase => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase) ||
        !safeText(phase.title, 3, 100) || !safeText(phase.goal, 12, 700) ||
        !safeText(phase.reason, 8, 500) || !decisions.has(phase.decision) ||
        !Array.isArray(phase.acceptance) || phase.acceptance.length < 1 || phase.acceptance.length > 4 ||
        !phase.acceptance.every(item => safeText(item, 8, 240))) throw Error('Invalid roadmap phase');
    const sensitiveCandidate = phase.decision === 'candidate' &&
      sensitive.test(`${phase.title} ${phase.goal} ${phase.acceptance.join(' ')}`);
    return {
      title: phase.title.trim(), goal: phase.goal.trim(),
      reason: sensitiveCandidate ? 'عملیات حساس است؛ پیش از اجرا به بررسی و تصمیم جداگانه نیاز دارد.' : phase.reason.trim(),
      decision: sensitiveCandidate ? 'needs-decision' : phase.decision,
      acceptance: phase.acceptance.map(item => item.trim()),
    };
  });
  return { summary: value.summary.trim(), phases };
}

export function validateRoadmapReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.accepted !== 'boolean' || !safeText(value.summary, 8, 900) ||
      !Array.isArray(value.issues) || value.issues.length > 6 ||
      !value.issues.every(item => safeText(item, 3, 240)) ||
      Buffer.byteLength(JSON.stringify(value)) > 4000) throw Error('Invalid roadmap review');
  return { accepted: value.accepted, summary: value.summary.trim(), issues: value.issues.map(item => item.trim()) };
}

export function phaseRequest(phase) {
  const text = `${phase.goal}\nمعیار پذیرش: ${phase.acceptance.join('؛ ')}`;
  if (text.length > 2000) throw Error('Roadmap phase request too long');
  return text;
}
