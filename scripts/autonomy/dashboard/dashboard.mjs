import { statusLabel, phaseLabel, safeGithubURL, summarize } from './view-model.mjs'

const $ = id => document.getElementById(id)
const digits = new Intl.NumberFormat('fa-IR')
const dateFormat = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })
let snapshot = null
let busy = false
let timer = null
let lastSuccessfulFetch = null

function date(value) {
  if (value === null || value === undefined || value === '') return 'ثبت نشده'
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? `${dateFormat.format(parsed)} تهران` : 'تاریخ نامعتبر'
}
function node(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = String(text)
  return element
}
function badge(status) {
  const result = node('span', 'badge', statusLabel(status))
  result.dataset.status = String(status || 'unknown')
  return result
}
function appendGithub(container, url, label) {
  const href = safeGithubURL(url)
  if (!href) return
  const anchor = node('a', '', label)
  anchor.href = href
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  container.append(anchor)
}
function collection(value) { return Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [] }
function countClaims(task) {
  const value = task.claims
  if (Array.isArray(value)) return value.length
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}
function render(data) {
  const phases = collection(data.phases)
  const engineering = collection(data.engineering)
  const research = collection(data.research)
  const summary = summarize({ ...data, engineering, research })
  const phaseTitle = id => phases.find(phase => phase.id === id)?.title || String(id || 'فاز ثبت نشده')
  $('code-count').textContent = `${digits.format(summary.completed)} / ${digits.format(summary.total)}`
  $('research-count').textContent = `${digits.format(summary.reviewedResearch)} / ${digits.format(research.length)}`
  $('claims-count').textContent = digits.format(summary.claims)
  $('updated').textContent = `آخرین ثبت: ${date(data.updatedAt)}`
  $('next').textContent = Number(data.nextEligibleAt) > Date.now() ? `عامل پس از ${date(data.nextEligibleAt)} مجاز به اجراست` : 'انتظار زمانی برای عامل ثبت نشده'
  const active = summary.active
  $('active-task').textContent = data.paused ? 'ناظر در حالت توقف است' : active ? String(active.title || phaseTitle(active.phase)) : 'کار کدنویسی فعال در این ثبت دیده نمی‌شود'
  $('active-stage').textContent = active ? `مرحله: ${statusLabel(active.status)} · ${phaseTitle(active.phase)}` : 'نبود کار فعال، سلامت تایمر یا پایان کل پروژه را اثبات نمی‌کند.'
  $('engineering-total').textContent = `${digits.format(engineering.length)} کار ثبت‌شده`
  $('research-total').textContent = `${digits.format(research.length)} بسته ثبت‌شده`
  $('phases').replaceChildren(...phases.map((phase, index) => {
    const item = node('li')
    const phaseStatus = badge(phase.status)
    phaseStatus.textContent = phaseLabel(phase, engineering)
    item.append(node('p', 'phase-number', `مرحله ${digits.format(index + 1)}`), node('h3', '', phase.title || String(phase.id || 'فاز بدون عنوان')), phaseStatus)
    if (phase.status === 'needs-owner-data') item.append(node('p', 'task-reason', 'این مرحله به اطلاعات یا آزمون واقعی مالک وابسته است.'))
    return item
  }))
  if (!phases.length) $('phases').append(node('li', 'empty', 'فازی در این فایل وضعیت ثبت نشده است.'))
  renderTasks('engineering', engineering, false, phaseTitle)
  renderTasks('research', research, true, phaseTitle)
}
function renderTasks(id, tasks, isResearch, phaseTitle) {
  const list = $(id)
  list.replaceChildren(...tasks.map((task, index) => {
    const item = node('li')
    const top = node('div', 'task-top')
    const heading = node('div')
    heading.append(node('h3', 'task-name', task.title || (isResearch ? `بستهٔ پژوهش ${digits.format(index + 1)}` : phaseTitle(task.phase))))
    heading.append(node('p', 'task-meta', isResearch ? `${digits.format(countClaims(task))} پیشنهاد گزارش‌شده` : phaseTitle(task.phase)))
    const taskStatus = badge(task.status)
    if (isResearch && task.status === 'completed') taskStatus.textContent = 'بررسی بسته تکمیل شده'
    top.append(heading, taskStatus)
    item.append(top)
    if (task.reason) item.append(node('p', 'task-reason', task.reason))
    const links = node('div', 'task-links')
    appendGithub(links, task.pr, 'مشاهدهٔ Pull Request')
    appendGithub(links, task.deployRun, 'مشاهدهٔ اجرای انتشار')
    if (links.childElementCount) item.append(links)
    if (task.mergeSha) item.append(node('p', 'task-meta', `شناسهٔ ادغام: ${String(task.mergeSha).slice(0, 12)}`))
    return item
  }))
  if (!tasks.length) list.append(node('li', 'empty', 'هنوز کاری در این بخش ثبت نشده است؛ گزارش آخرین وضعیت را می‌توانید از پایین صفحه دریافت کنید.'))
}
function connection() {
  if (!snapshot) return
  const at = new Date(snapshot.updatedAt).getTime()
  const stale = !Number.isFinite(at) || Date.now() - at > 2 * 60 * 60 * 1000
  $('connection').textContent = snapshot.paused ? 'توقف ناظر در فایل وضعیت ثبت شده' : stale ? 'ثبت وضعیت قدیمی است؛ فعالیت فعلی تأیید نمی‌شود' : 'آخرین فایل وضعیت دریافت شد؛ سلامت تایمر جداگانه بررسی می‌شود'
}
async function refresh() {
  if (busy) return
  busy = true
  $('refresh').disabled = true
  $('main').setAttribute('aria-busy', 'true')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('./status.json', { cache: 'no-store', signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('fetch failed')
    const data = await response.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid snapshot')
    snapshot = data
    lastSuccessfulFetch = Date.now()
    render(data)
    connection()
    $('error').hidden = true
  } catch {
    $('connection').textContent = 'دریافت وضعیت تازه ناموفق بود'
    $('error').textContent = snapshot ? `اطلاعات قبلی حفظ شده است؛ آخرین دریافت موفق ${date(lastSuccessfulFetch)}. با «تازه‌سازی وضعیت» دوباره تلاش کنید.` : 'فایل وضعیت در دسترس نیست. با «تازه‌سازی وضعیت» دوباره تلاش کنید یا گزارش دانلودی را باز کنید.'
    $('error').hidden = false
  } finally {
    clearTimeout(timeout)
    busy = false
    $('refresh').disabled = false
    $('main').setAttribute('aria-busy', 'false')
  }
}
function schedule() {
  clearInterval(timer)
  timer = null
  if (!document.hidden) timer = setInterval(refresh, 30000)
}
$('refresh').addEventListener('click', refresh)
document.addEventListener('visibilitychange', () => { schedule(); if (!document.hidden) refresh() })
if (!document.hidden) refresh()
schedule()
