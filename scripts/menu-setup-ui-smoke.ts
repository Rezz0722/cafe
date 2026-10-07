// Isolated component/hook browser test. No database, sessions or production writes.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, firefox, webkit } from 'playwright'

const bundle = await build({
  absWorkingDir: process.cwd(), bundle: true, write: false, outdir: '/virtual', format: 'iife', jsx: 'automatic',
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { MenuSetupChecklist } from './src/components/venue/MenuSetupChecklist';
    import { usePanelTab } from './src/components/admin/usePanelTab';
    import './src/app/tokens.css';
    function Harness() {
      const [dirty, setDirty] = React.useState(false);
      const [tab, select] = usePanelTab(['overview','info','hours','media','menu','qr'], 'overview', () => !dirty || confirm('تغییرات ذخیره‌نشده دارید'));
      const steps = ['identity','hours','media','categories','items','prices'].map((id, i) => ({id, title:['نام و راه ارتباطی شعبه','ساعت کاری','تصویر واقعی مجموعه','دسته‌های منو','آیتم قابل ارائه','قیمت آیتم‌های موجود'][i], detail:'توضیح برای شعبه با نام بسیار طولانی و گزینه‌های منو', complete:false, target:['info','hours','media','menu','menu','menu'][i]}));
      return <><MenuSetupChecklist readiness={{steps,completed:0,next:steps[0],publicDestination:false,temporarilyClosed:false}} onSelect={select}/><button onClick={() => setDirty(!dirty)}>تغییر ذخیره‌نشده</button><output aria-label="بخش انتخاب‌شده">{tab}</output></>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` },
})
const assets = new Map(bundle.outputFiles!.map(file => [file.path.split('/').pop(), file.text]))
const server = createServer((request, response) => {
  const name = request.url?.split('?')[0]?.slice(1)
  if (name && assets.has(name)) {
    response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript')
    response.end(assets.get(name)); return
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end('<!doctype html><html dir="rtl" lang="fa"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/stdin.css"><style>body{margin:0;padding:16px;box-sizing:border-box;background:var(--c-bg);font-family:Arial}#root{max-width:960px;margin:auto}</style><div id="root"></div><script src="/stdin.js"></script></html>')
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address(); assert.ok(address && typeof address !== 'string')
const base = `http://127.0.0.1:${address.port}`, results: object[] = []
await mkdir('var/qa/phase2', { recursive: true })
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch()
    try {
      for (const width of [360, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
        await page.goto(base)
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
        await page.getByRole('heading', { name: 'منوی شعبه‌ات را آماده کن' }).waitFor()
        assert.equal(await page.getByRole('listitem').count(), 6)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        const action = page.getByRole('button', { name: 'تکمیل نام و راه ارتباطی شعبه', exact: true })
        await action.focus()
        assert.notEqual(await action.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
        assert.ok((await action.boundingBox())!.height >= 44)
        await page.keyboard.press('Enter')
        assert.equal(await page.getByLabel('بخش انتخاب‌شده').textContent(), 'info')
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'info')
        await page.goBack(); await page.waitForFunction(() => document.querySelector('output')?.textContent === 'overview')
        await page.getByRole('button', { name: 'تغییر ذخیره‌نشده', exact: true }).click()
        page.once('dialog', dialog => dialog.dismiss())
        await page.getByRole('button', { name: 'تکمیل ساعت کاری', exact: true }).click()
        assert.equal(await page.getByLabel('بخش انتخاب‌شده').textContent(), 'overview')
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'تکمیل ساعت کاری', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('output')?.textContent === 'hours')
        assert.deepEqual(errors, [])
        if (name === 'chromium' && (width === 390 || width === 1440)) await page.screenshot({ path: `var/qa/phase2/setup-${width}-${theme}.png`, fullPage: true })
        results.push({ engine: name, width, theme, pass: true, checks: ['six steps', 'RTL no overflow', '44px action', 'keyboard/focus', 'tab URL', 'browser back', 'unsaved cancel/accept', 'no runtime error'] })
        await page.close()
      }
    } finally { await browser.close() }
  }
  await writeFile('var/qa/phase2/component-browser.json', JSON.stringify({ scope: 'Isolated real component + existing usePanelTab; not authenticated full-page E2E or physical phones', results }, null, 2))
  console.log(`PASS ${results.length} component/hook browser scenarios`)
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
