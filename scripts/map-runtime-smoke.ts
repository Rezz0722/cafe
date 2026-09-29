import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'

const base=process.argv[2]??'http://127.0.0.1:9092'
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--enable-unsafe-swiftshader']})
await mkdir('var/qa/map-runtime',{recursive:true})
try {
 for(const asset of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs']) {
  const response=await browser.newContext().then(async context=>{try{return await context.request.get(`${base}/maplibre/v6.9.0/${asset}`)}finally{await context.close()}})
  assert.equal(response.status(),200)
  assert.match(response.headers()['content-type']??'',/(application|text)\/javascript/)
 }
 for(const path of ['/cafe/ramouz-cafe','/','/search?view=map']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  const page=await context.newPage(),errors:string[]=[],workers:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  page.on('response',response=>{if(response.url().includes('/maplibre/')&&response.url().endsWith('.mjs')){workers.push(response.url());if(response.status()!==200||!/(application|text)\/javascript/.test(response.headers()['content-type']??''))errors.push(`worker response: ${response.status()} ${response.headers()['content-type']}`)}})
  page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()}: ${response.url()}`)})
  page.setDefaultTimeout(60000)
  await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:120000})
  if(path==='/'){
   await page.getByRole('navigation',{name:'دسترسی سریع موبایل'}).getByRole('link',{name:'نقشه',exact:true}).click()
   await page.waitForURL(/view=map/)
  }
  const reserve=page.locator('[class*="LazyCafeMap_reserve"]').first()
  if(await reserve.count())await reserve.scrollIntoViewIfNeeded()
  await page.locator('.maplibregl-canvas, [data-map-renderer="2d"]').first().waitFor()
  await page.locator('.maplibregl-marker, [data-map-pin]').first().waitFor()
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="status"]')).some(element=>element.textContent?.includes('جزئیات نقشه')),{},{timeout:60000})
  if(!await page.locator('[data-map-renderer="2d"]').count())assert.ok(workers.length>=2,'both worker and shared module must load')
  assert.deepEqual(errors,[])
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','map must not lock scrolling')
  await page.screenshot({path:`var/qa/map-runtime/${path==='/'?'home':path.startsWith('/search')?'search':'cafe'}-390.png`})
  await context.close();console.log(`✓ ${path}: rendered map, marker, JavaScript worker MIME, no console errors or scroll lock`)
 }
 // Slow map data must not obscure the place marker behind a full loading overlay.
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
 const page=await context.newPage()
 await page.route('**/map/*.geojson',async route=>{await new Promise(resolve=>setTimeout(resolve,9000));await route.continue().catch(()=>{})})
 await page.goto(`${base}/cafe/ramouz-cafe`,{waitUntil:'domcontentloaded',timeout:120000})
 await page.locator('[class*="LazyCafeMap_reserve"]').scrollIntoViewIfNeeded()
 await page.locator('.maplibregl-marker, [data-map-pin]').first().waitFor({timeout:20000})
 assert.equal(await page.locator('[class*="CafeMap_loading"]').count(),0,'full map overlay must end before GeoJSON completes')
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="status"]')).some(element=>element.textContent?.includes('جزئیات نقشه')),{},{timeout:60000})
 await context.close();console.log('✓ Slow map data: place marker usable before full data, nonblocking progress ends')
 const noGl=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
 await noGl.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2'||type==='webgl'||type==='experimental-webgl')return null;return Reflect.apply(original,this,[type,...args])} as typeof original})
 const fallback=await noGl.newPage()
 await fallback.goto(`${base}/cafe/ramouz-cafe`,{waitUntil:'domcontentloaded',timeout:120000})
 await fallback.locator('[class*="LazyCafeMap_reserve"]').scrollIntoViewIfNeeded()
 await fallback.locator('[data-map-renderer="2d"] [data-map-pin]').first().waitFor({timeout:30000})
 await fallback.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="status"]')).some(element=>element.textContent?.includes('جزئیات نقشه')),{},{timeout:30000})
 const before=Number(await fallback.locator('[data-map-renderer="2d"]').getAttribute('data-map-zoom'))
 await fallback.getByRole('button',{name:'بزرگ‌نمایی',exact:true}).click()
 await fallback.waitForTimeout(350)
 assert.ok(Number(await fallback.locator('[data-map-renderer="2d"]').getAttribute('data-map-zoom'))>before)
 assert.notEqual(await fallback.evaluate(()=>document.body.style.overflow),'hidden')
 await fallback.screenshot({path:'var/qa/map-runtime/no-webgl-390.png'})
 await noGl.close();console.log('✓ WebGL unavailable: local 2D map, valid cafe pin and zoom without scroll lock')
} finally {await browser.close()}
