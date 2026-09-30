/**
 * کپی‌کردن worker مپ‌لایبر به `public/maplibre/`.
 *
 * ═══ چرا این اسکریپت لازم است ═══
 *
 * از نسخه‌ی ۶، مپ‌لایبر worker خودش را داخل باندل جاسازی نمی‌کند؛ در زمان
 * اجرا آدرسش را از `import.meta.url` می‌سازد:
 *
 *     function defaultWorkerUrl() {
 *       const moduleUrl = import.meta.url
 *       if (!/^https?:/.test(moduleUrl)) return ''        // ← اینجا
 *       return new URL(`./maplibre-gl-worker.mjs`, moduleUrl).href
 *     }
 *
 * وقتی Next کد را باندل می‌کند، `import.meta.url` دیگر یک آدرس `http(s)`
 * نیست، پس این تابع **رشته‌ی خالی** برمی‌گرداند و مپ‌لایبر
 * `new Worker('', { type: 'module' })` می‌سازد. رشته‌ی خالی نسبت به آدرس
 * صفحه resolve می‌شود، یعنی مرورگر خودِ صفحه‌ی HTML را به‌عنوان اسکریپت
 * ماژول درخواست می‌کند و با این خطا رد می‌کند:
 *
 *     Failed to load module script: The server responded with a
 *     non-JavaScript MIME type of "text/html".
 *
 * بدون worker، هیچ تایلی رمزگشایی نمی‌شود: نقشه بوم WebGL را می‌سازد،
 * استایل را می‌گیرد، ولی **حتی یک درخواست تایل هم نمی‌فرستد** و رویداد
 * `load` هرگز شلیک نمی‌شود. نتیجه‌ای که کاربر می‌دید: پیام «در حال
 * آماده‌سازی نقشه…» تا ابد، در همه‌ی صفحه‌های دارای نقشه.
 *
 * چاره این است که `setWorkerUrl()` را به یک آدرس واقعیِ هم‌دامنه بدهیم
 * (`src/components/map/CafeMap.tsx` را ببینید) و فایلش را خودمان سرو کنیم.
 *
 * ═══ چرا کپی، و چرا دو فایل ═══
 *
 * `maplibre-gl-worker.mjs` یک import نسبی به همسایه‌اش دارد:
 *
 *     import { … } from "./maplibre-gl-shared.mjs"
 *
 * پس worker باید از پوشه‌ای سرو شود که آن همسایه هم کنارش باشد؛ یک
 * route handler که تنها همان یک فایل را برگرداند کار نمی‌کند. `public/`
 * ساده‌ترین جایی است که این چیدمان را حفظ می‌کند و فایل ثابت را بدون
 * هزینه‌ی سرور سرو می‌کند.
 *
 * کپی در git نمی‌آید (`.gitignore`) چون یک قلمِ تولیدشده از
 * `node_modules` است؛ با `predev` و `prebuild` خودکار ساخته می‌شود تا
 * هرگز از نسخه‌ی نصب‌شده عقب نماند.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

/** فایل‌هایی که worker برای اجرا لازم دارد — خودش و همان همسایه. */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

const OUT_DIR = resolve(process.cwd(), 'public/maplibre')
/** نسخه‌ی کپی‌شده، تا در اجرای بعدی بدانیم کپی تازه است یا نه. */
const STAMP = join(OUT_DIR, '.version')

function main() {
  const pkgPath = require.resolve('maplibre-gl/package.json')
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version
  const distDir = join(dirname(pkgPath), 'dist')

  const versionDir = join(OUT_DIR, `v${version}`)
  const missing = FILES.filter((file) => !existsSync(join(distDir, file)))
  if (missing.length > 0) {
    // نسخه‌ی جدید مپ‌لایبر ممکن است چیدمان dist را عوض کند. در آن حالت
    // بی‌صدا رد شدن بدترین کار است: نقشه بی‌هیچ توضیحی از کار می‌افتد.
    console.error(
      `sync-map-worker: این فایل‌ها در maplibre-gl@${version} پیدا نشدند: ${missing.join(', ')}\n` +
        `  پوشه‌ی dist: ${distDir}\n` +
        '  فهرست FILES در scripts/sync-map-worker.mjs باید با نسخه‌ی جدید هم‌خوان شود.',
    )
    process.exit(1)
  }

  const stamped = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : null
  const copiesPresent = FILES.every(
    (file) => existsSync(join(OUT_DIR, file)) && existsSync(join(versionDir, file)),
  )
  if (stamped === version && copiesPresent) return

  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(versionDir, { recursive: true })
  let bytes = 0
  for (const file of FILES) {
    copyFileSync(join(distDir, file), join(OUT_DIR, file))
    // مسیر versioned کش خراب نسخه‌های قبلی را بدون دست‌زدن به خود worker
    // باطل می‌کند. import نسبی shared نیز داخل همین پوشه باقی می‌ماند.
    copyFileSync(join(distDir, file), join(versionDir, file))
    bytes += statSync(join(OUT_DIR, file)).size
  }
  writeFileSync(STAMP, `${version}\n`, 'utf8')

  console.log(
    `sync-map-worker: worker مپ‌لایبر ${version} در public/maplibre/v${version}/ کپی شد ` +
      `(${FILES.length} فایل، ${Math.round(bytes / 1024)} کیلوبایت)`,
  )
}

main()
