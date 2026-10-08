const labels = Object.freeze({
  pending: 'در صف', planning: 'برنامه‌ریزی', writing: 'در حال کدنویسی',
  reviewing: 'بازبینی مستقل', 'needs-review': 'منتظر بازبینی', publishing: 'ساخت Pull Request',
  'awaiting-ci': 'منتظر نتیجهٔ CI', 'merge-requested': 'در حال ادغام',
  'awaiting-deploy': 'منتظر تأیید انتشار', completed: 'منتشر و تأیید شده',
  'retry-writing': 'اصلاح مجدد کد', blocked: 'نیازمند بررسی',
  'review-rejected': 'بازبینی رد شد', conflict: 'تداخل تغییرات',
  'deployment-failed': 'انتشار ناموفق', 'needs-evidence': 'نیازمند شاهد معتبر',
  'needs-owner-data': 'نیازمند اطلاعات مالک', 'in-progress': 'فاز تکمیل‌نشده',
  researching: 'در حال تحقیق', reviewed: 'بازبینی شده',
});
export function statusLabel(status) { return labels[status] ?? 'وضعیت نامشخص'; }
export function stageIndex(status) {
  return ({pending:-1,planning:0,writing:1,'retry-writing':1,reviewing:2,'needs-review':2,publishing:3,'awaiting-ci':4,'merge-requested':5,'awaiting-deploy':6,completed:7})[status] ?? -1;
}
export function safeGithubURL(value) {
  return typeof value === 'string' && /^https:\/\/github\.com\/Rezz0722\/cafe\/(?:pull\/\d+|actions\/runs\/\d+)$/.test(value) ? value : null;
}
export function summarize(snapshot) {
  const engineering = Array.isArray(snapshot?.engineering) ? snapshot.engineering : [];
  const research = Array.isArray(snapshot?.research) ? snapshot.research : [];
  return {
    completed: engineering.filter(t => t.status === 'completed').length,
    total: engineering.length,
    reviewedResearch: research.filter(t => ['needs-evidence','reviewed','completed'].includes(t.status)).length,
    claims: research.reduce((sum,t) => sum + (Number.isSafeInteger(t.claims) && t.claims > 0 ? t.claims : 0),0),
    active: engineering.find(t => !['pending','completed','blocked','conflict','deployment-failed','review-rejected'].includes(t.status)) ?? null,
  };
}
export function blockerLabel(data) {
 if(data?.paused) return 'ناظر متوقف شده است';
 return ({'disk-below-reserve':'مسدود: فضای آزاد سرور کافی نیست','daily-engineering-budget':'منتظر: سقف چرخه‌های روزانه مصرف شده','quota-reserve':'منتظر: ذخیرهٔ مصرف مدل','quota-unknown':'مسدود: وضعیت مصرف مدل مشخص نیست'})[data?.lastReason] ?? null;
}
export function phaseLabel(phase, engineering = [], data = null) {
  const tasks = engineering.filter(t => t.phase === phase.id);
  if(tasks.length && tasks.every(t => t.status === 'pending')) return statusLabel('pending');
  if(tasks.some(t => ['blocked','conflict','deployment-failed','review-rejected'].includes(t.status))) return statusLabel('blocked');
  if(tasks.length && tasks.every(t => t.status === 'completed')) return statusLabel('completed');
  if(tasks.length && blockerLabel(data)) return 'متوقف تا رفع مانع';
  return statusLabel(phase.status);
}
