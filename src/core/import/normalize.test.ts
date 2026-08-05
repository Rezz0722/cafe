/**
 * تست نرمال‌سازی ایمپورت.
 *
 * هر تست از یک **رکورد واقعی** در `all-cafe-data/cafes_full_latest.json`
 * می‌آید. جایی که ورودی عجیب است، کامنت می‌گوید کدام کافه بوده — تا اگر روزی
 * تست شکست، بشود اصل داده را دید.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyGeo,
  cleanLine,
  detectKind,
  detectPriceContext,
  makeSlug,
  median,
  normalizePrice,
  parseHours,
  parseInstagramHandle,
  parsePhones,
  parseSocials,
  pickDistrict,
  priceTierFromMedian,
  stripHtml,
} from './normalize'

// ═══ متن ═══

test('stripHtml تگ و موجودیت را پاک می‌کند', () => {
  // «مجنون لانژ»
  assert.equal(stripHtml('<p>جان، نه آنگونه که گفتند و شنیدی</p>'), 'جان، نه آنگونه که گفتند و شنیدی')
  assert.equal(stripHtml('سلام&nbsp;دنیا'), 'سلام دنیا')
  assert.equal(stripHtml('a<br>b'), 'a\nb')
  assert.equal(stripHtml('<p>یک</p><p>دو</p>'), 'یک\nدو')
  assert.equal(stripHtml(null), '')
})

test('stripHtml نیم‌فاصله را نگه می‌دارد', () => {
  // نیم‌فاصله باید بماند: حذفش نوشتار فارسی را غلط می‌کند.
  assert.equal(stripHtml('<p>می‌آید</p>'), 'می‌آید')
})

test('cleanLine خط‌ها را یکی می‌کند', () => {
  assert.equal(cleanLine('<p>یک</p><p>دو</p>'), 'یک دو')
})

// ═══ slug ═══

test('makeSlug از یوزرنیم می‌سازد نه از نام', () => {
  const taken = new Set<string>()
  const slug = makeSlug('jan_majnoon_lounge', 'مجنون لانژ', (s) => taken.has(s))
  assert.equal(slug, 'jan-majnoon-lounge')
})

test('makeSlug نام‌های تکراری را با پسوند جدا می‌کند', () => {
  // «شوگر» سه بار در داده تکرار شده ولی یوزرنیم‌هایشان متفاوت است؛
  // این تست حالتی را پوشش می‌دهد که یوزرنیم نداریم.
  const taken = new Set(['شوگر'])
  const slug = makeSlug(null, 'شوگر', (s) => taken.has(s))
  assert.equal(slug, 'شوگر-2')
})

// ═══ تلفن ═══

test('parsePhones موبایل و ثابت را تشخیص می‌دهد', () => {
  assert.deepEqual(parsePhones('09005925925'), [{ phone: '09005925925', kind: 'mobile' }])
  assert.deepEqual(parsePhones('05138472000'), [{ phone: '05138472000', kind: 'landline' }])
})

test('parsePhones به شماره‌ی ۸ رقمی پیش‌شماره‌ی مشهد اضافه می‌کند', () => {
  // ۱۱ رکورد در داده شماره‌ی ۸ رقمی بی‌کد دارند — بدون 051 قابل تماس نیست.
  assert.deepEqual(parsePhones('38472000'), [{ phone: '05138472000', kind: 'landline' }])
})

test('parsePhones چند شماره را جدا می‌کند', () => {
  const result = parsePhones('09151234567، 05138472000')
  assert.equal(result.length, 2)
  assert.equal(result[0]!.kind, 'mobile')
  assert.equal(result[1]!.kind, 'landline')
})

test('parsePhones ارقام فارسی را می‌فهمد', () => {
  assert.deepEqual(parsePhones('۰۹۱۵۱۲۳۴۵۶۷'), [{ phone: '09151234567', kind: 'mobile' }])
})

test('parsePhones متنِ بی‌شماره را دور می‌ریزد', () => {
  // ۶۴ رکورد در داده متن بدون شماره داشتند.
  assert.deepEqual(parsePhones('ندارد'), [])
  assert.deepEqual(parsePhones(''), [])
  assert.deepEqual(parsePhones(null), [])
})

test('parsePhones شماره‌ی تکراری را یک‌بار برمی‌گرداند', () => {
  assert.equal(parsePhones('09151234567 / 09151234567').length, 1)
})

test('parsePhones خط رزرواسیون را جدا برچسب می‌زند', () => {
  const result = parsePhones('رزرواسیون: 09005925925')
  assert.equal(result[0]!.kind, 'reservation')
})

// ═══ اینستاگرام ═══

test('parseInstagramHandle فقط handle را نگه می‌دارد', () => {
  assert.equal(parseInstagramHandle('instagram.com/jan.plazaa'), 'jan.plazaa')
  assert.equal(parseInstagramHandle('https://instagram.com/jan.plazaa/'), 'jan.plazaa')
  assert.equal(parseInstagramHandle('@jan.plazaa'), 'jan.plazaa')
  assert.equal(parseInstagramHandle(''), null)
  assert.equal(parseInstagramHandle(null), null)
})

// ═══ شبکه‌های اجتماعی ═══

test('parseSocials برچسب فارسی را به نوع نگاشت می‌کند', () => {
  const result = parseSocials('تلگرام: https://t.me/cafegard | وبسایت: https://example.com')
  assert.equal(result.length, 2)
  assert.equal(result[0]!.kind, 'telegram')
  assert.equal(result[1]!.kind, 'website')
})

test('parseSocials دو املای واتساپ را یکی می‌کند', () => {
  assert.equal(parseSocials('واتس اپ: https://wa.me/98915')[0]!.kind, 'whatsapp')
  assert.equal(parseSocials('واتساپ: https://wa.me/98915')[0]!.kind, 'whatsapp')
})

test('parseSocials شماره‌ی رزرواسیون را به tel: تبدیل می‌کند', () => {
  // «مجنون لانژ»: `رزرواسیون: 09005925925` — بدون tel: روی موبایل بی‌فایده است.
  const result = parseSocials('رزرواسیون: 09005925925')
  assert.equal(result[0]!.kind, 'reservation')
  assert.equal(result[0]!.url, 'tel:09005925925')
})

test('parseSocials متن آزادِ بی‌لینک را دور می‌ریزد', () => {
  assert.deepEqual(parseSocials('ندارد'), [])
})

// ═══ ساعت کاری ═══

test('parseHours هفت روز ساده را می‌خواند', () => {
  const { shifts, warnings } = parseHours(
    'شنبه: 16:00-00:30 | یکشنبه: 16:00-00:30 | دوشنبه: 16:00-00:30 | سه‌شنبه: 16:00-00:30 | چهارشنبه: 16:00-00:30 | پنجشنبه: 16:00-01:00 | جمعه: 16:00-01:00',
  )
  assert.equal(shifts.length, 7)
  assert.equal(warnings.length, 0)
  assert.equal(shifts[0]!.dow, 0)
  assert.equal(shifts[0]!.opensAt, '16:00')
  assert.equal(shifts[0]!.closesAt, '00:30')
  assert.equal(shifts[0]!.crossesMidnight, true, 'بستن ۰۰:۳۰ یعنی بعد از نیمه‌شب')
  assert.equal(shifts[6]!.dow, 6)
})

test('parseHours شیفت شکسته را دو ردیف می‌کند', () => {
  // ۴۱۴ روز در داده شیفت شکسته دارند — شمای قبلی این را دور می‌ریخت.
  const { shifts } = parseHours('شنبه: 12:00-16:30 و 20:00-23:30')
  assert.equal(shifts.length, 2)
  assert.equal(shifts[0]!.shiftIndex, 0)
  assert.equal(shifts[0]!.opensAt, '12:00')
  assert.equal(shifts[0]!.closesAt, '16:30')
  assert.equal(shifts[1]!.shiftIndex, 1)
  assert.equal(shifts[1]!.opensAt, '20:00')
  assert.equal(shifts[1]!.crossesMidnight, false)
})

test('parseHours ساعت ۲۴ را نیمه‌شب می‌فهمد', () => {
  const { shifts } = parseHours('شنبه: 08:00-24:00')
  assert.equal(shifts[0]!.closesAt, '00:00')
  assert.equal(shifts[0]!.crossesMidnight, true)
})

test('parseHours ساعت ۲۴:۳۰ را ۰۰:۳۰ روز بعد می‌فهمد', () => {
  // «پنجشنبه: 12:00-16:30 و 20:00-24:30» — واقعی
  const { shifts } = parseHours('پنجشنبه: 20:00-24:30')
  assert.equal(shifts[0]!.closesAt, '00:30')
  assert.equal(shifts[0]!.crossesMidnight, true)
})

test('parseHours ساعت بی‌دقیقه را کامل می‌کند', () => {
  // «8-24» و «11-01» در داده هست.
  const { shifts } = parseHours('شنبه: 8-24')
  assert.equal(shifts[0]!.opensAt, '08:00')
  assert.equal(shifts[0]!.closesAt, '00:00')

  const late = parseHours('شنبه: 11-01')
  assert.equal(late.shifts[0]!.opensAt, '11:00')
  assert.equal(late.shifts[0]!.closesAt, '01:00')
  assert.equal(late.shifts[0]!.crossesMidnight, true)
})

test('parseHours «تعطیل» را روز بسته ثبت می‌کند', () => {
  // ۲۲ مورد در داده.
  const { shifts } = parseHours('جمعه: تعطیل')
  assert.equal(shifts.length, 1)
  assert.equal(shifts[0]!.closed, true)
  assert.equal(shifts[0]!.opensAt, null)
})

test('parseHours ساعت خراب را حدس نمی‌زند بلکه گزارش می‌دهد', () => {
  // «93:0-22» در داده هست — تایپِ برعکسِ ۹:۳۰. حدس‌زدن بدتر از خالی‌گذاشتن است.
  const { shifts, warnings } = parseHours('شنبه: 93:0-22')
  assert.equal(shifts.length, 0)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0]!, /نامعتبر/)
})

test('parseHours روز غایب را «تعطیل» فرض نمی‌کند', () => {
  // تفاوت «نامشخص» و «تعطیل» مهم است: نگفتن یعنی نمی‌دانیم.
  const { shifts } = parseHours('شنبه: 08:00-22:00')
  assert.equal(shifts.length, 1)
  assert.equal(shifts.filter((s) => s.dow === 6).length, 0)
})

test('parseHours رشته‌ی خالی را بی‌خطا رد می‌کند', () => {
  assert.deepEqual(parseHours('').shifts, [])
  assert.deepEqual(parseHours(null).shifts, [])
})

test('parseHours سه شیفت را می‌شمارد', () => {
  const { shifts } = parseHours('شنبه: 08:00-12:00 و 14:00-18:00 و 20:00-23:00')
  assert.equal(shifts.length, 3)
  assert.deepEqual(shifts.map((s) => s.shiftIndex), [0, 1, 2])
})

// ═══ مختصات ═══

test('classifyGeo مشهد را ok می‌داند', () => {
  assert.equal(classifyGeo(36.3490595818824, 59.42971327118581), 'ok')
})

test('classifyGeo مختصات بیرون مشهد را out_of_area می‌کند', () => {
  // «بامبو کافه» روی lat ۲۹٫۲۸ (سیستان) — ژئوکد خراب.
  assert.equal(classifyGeo(29.286398892934763, 60.86425781250001), 'out_of_area')
  // «رستوران و فست فود کاج سبزوار» — واقعاً شهر دیگر.
  assert.equal(classifyGeo(36.21502109399597, 57.69071102142335), 'out_of_area')
})

test('classifyGeo نبودِ مختصات را missing می‌کند', () => {
  assert.equal(classifyGeo(null, null), 'missing')
  assert.equal(classifyGeo(undefined, undefined), 'missing')
  assert.equal(classifyGeo(0, 0), 'missing', 'صفر مختصات نیست، یعنی خالی')
})

test('pickDistrict از متن آدرس محله را پیدا می‌کند', () => {
  // «مشهد - انتهای وکیل آباد - امام رضا ۱ - بین زعفرانیه ۵ و ۷»
  const id = pickDistrict('مشهد - انتهای وکیل آباد - امام رضا ۱', null, null)
  assert.ok(id, 'باید محله‌ای پیدا شود')
})

test('pickDistrict متن را به مختصات ترجیح می‌دهد', () => {
  const fromText = pickDistrict('مشهد، بلوار سجاد', 36.3157, 59.5391)
  assert.equal(fromText, 'sajad')
})

test('pickDistrict بدون آدرس و بدون مختصات null می‌دهد', () => {
  assert.equal(pickDistrict('', null, null), null)
})

test('pickDistrict مختصات بیرون شهر را به محله نمی‌چسباند', () => {
  assert.equal(pickDistrict('', 29.28, 60.86), null)
})

// ═══ قیمت ═══

test('detectPriceContext منوی هزارتومانی را می‌شناسد', () => {
  // «کافه رام»: میانه ۲۲۰ → یعنی ۲۲۰ هزار تومان
  const context = detectPriceContext([90, 150, 220, 280, 390, 640])
  assert.equal(context.thousandUnit, true)
})

test('detectPriceContext منوی تومانی را دست نمی‌زند', () => {
  const context = detectPriceContext([90_000, 150_000, 220_000, 640_000])
  assert.equal(context.thousandUnit, false)
})

test('normalizePrice قیمت هزارتومانی را ×۱۰۰۰ می‌کند', () => {
  const context = { thousandUnit: true }
  assert.deepEqual(normalizePrice(920, context), { price: 920_000, priceUnknown: false })
})

test('normalizePrice در منوی واحدقاطی، قیمت درست را دست نمی‌زند', () => {
  // «کافه رستوران شایر»: ۶۸ آیتم هزارتومانی و ۱۴ آیتم تومانی در یک منو.
  // ضرب‌کردن همه در ۱۰۰۰، آن شیک ۳۲۰٬۰۰۰ را ۳۲۰ میلیون می‌کرد.
  const context = { thousandUnit: true }
  assert.deepEqual(normalizePrice(170, context), { price: 170_000, priceUnknown: false })
  assert.deepEqual(normalizePrice(320_000, context), { price: 320_000, priceUnknown: false })
})

test('normalizePrice صفر را قیمت نمی‌داند', () => {
  // ۸۶۴ آیتم قیمت صفر دارند (نوشابه در منوی هتل‌ها).
  assert.deepEqual(normalizePrice(0, { thousandUnit: false }), { price: null, priceUnknown: true })
})

test('normalizePrice جای‌نگهدارهای ۰٫۱ و ۱ را نامعلوم می‌کند', () => {
  // ۴۱ مورد `0.1` و ۲۳ مورد `1` در داده.
  assert.deepEqual(normalizePrice(0.1, { thousandUnit: false }), { price: null, priceUnknown: true })
  assert.deepEqual(normalizePrice(1, { thousandUnit: false }), { price: null, priceUnknown: true })
})

test('normalizePrice null و undefined را نامعلوم می‌کند', () => {
  assert.deepEqual(normalizePrice(null, { thousandUnit: false }), { price: null, priceUnknown: true })
  assert.deepEqual(normalizePrice(undefined, { thousandUnit: false }), {
    price: null,
    priceUnknown: true,
  })
})

test('normalizePrice قیمت نامعقول بزرگ را رد می‌کند', () => {
  // «عطر زنانه ومن سکرت ۱۱۳٬۵۹۹٬۹۹۹» — این غذا نیست.
  assert.deepEqual(normalizePrice(113_599_999 * 3, { thousandUnit: false }), {
    price: null,
    priceUnknown: true,
  })
})

test('priceTierFromMedian سه رده را از میانه می‌سازد', () => {
  assert.equal(priceTierFromMedian(148_000), 1)
  assert.equal(priceTierFromMedian(297_000), 2)
  assert.equal(priceTierFromMedian(727_000), 3)
  assert.equal(priceTierFromMedian(null), 2, 'بی‌قیمت = رده‌ی میانی، نه ارزان')
})

test('median روی آرایه‌ی خالی null می‌دهد', () => {
  assert.equal(median([]), null)
  assert.equal(median([5]), 5)
  assert.equal(median([1, 2, 3]), 2)
})

// ═══ نوع مجموعه ═══

test('detectKind کاکتوس‌فروشی را کافه نمی‌داند', () => {
  // «گرینو» — دسته‌بندی «کاکتوس»، قیمت‌ها تا ۱۰ میلیون.
  const signal = detectKind('گرینو', ['کاکتوس', 'نمونه کارها'], ['آگاو', 'کاکتوس اچینو'])
  assert.equal(signal.kind, 'shop')
})

test('detectKind عطر و پوشاک را کافه نمی‌داند', () => {
  // «تاپ منو مارکت»
  const signal = detectKind(
    'تاپ منو مارکت',
    ['پوشاک / Clothing', 'عطر و ادکلن / Perfume'],
    ['ژان پل گوتیه', 'استایل سفر'],
  )
  assert.equal(signal.kind, 'shop')
})

test('detectKind کافه‌ی واقعی را کافه می‌داند', () => {
  const signal = detectKind(
    'کافه رام',
    ['صبحانه', 'نوشیدنی های سرد بر پایه قهوه', 'کیک و دسر'],
    ['آفوگاتو', 'املت بیکن', 'کروسان'],
  )
  assert.equal(signal.kind, 'cafe')
})

test('detectKind کافه‌رستوران را از نام می‌شناسد', () => {
  const signal = detectKind('کافه رستوران زمین', ['صبحانه', 'پاستا'], ['لازانیا'])
  assert.equal(signal.kind, 'cafe_restaurant')
})

test('detectKind لانژ را از نام می‌شناسد', () => {
  const signal = detectKind('مجنون لانژ', ['سالاد', 'قلیان'], ['سالاد سزار'])
  assert.equal(signal.kind, 'lounge')
})

test('detectKind منوی خالی را کافه فرض می‌کند نه فروشگاه', () => {
  // ۱۳ مجموعه بی‌منو هستند؛ بی‌منو بودن دلیل «فروشگاه بودن» نیست.
  const signal = detectKind('کافه بی‌منو', [], [])
  assert.notEqual(signal.kind, 'shop')
})
