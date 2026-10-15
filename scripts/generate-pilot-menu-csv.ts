/** Reproducible, non-sensitive Excel fixture using the production CSV serializer. */
import { writeFile } from 'node:fs/promises'
import { buildMenuCsv, buildMenuExport } from '../src/core/places/menuExport'

const sample = {
  slug: 'pilot-example', name: 'کافهٔ نمونهٔ آزمایشی', branchName: 'شعبهٔ نمونه',
  sections: [{
    name: 'نوشیدنی‌های گرم', facetId: null, imageFullUrl: null, branchScope: 'branch',
    items: [
      { publicId: 'sample-latte', name: 'لاته، "ویژه"', description: 'خط اول، با "شیر"\nخط دوم',
        price: 100000, priceUnknown: false, available: true, featured: false, archivedAt: null, imageUrl: null,
        variants: [{ label: 'کوچک', price: 100000, available: true }, { label: 'بزرگ', price: 150000, available: false }] },
      { publicId: 'sample-water', name: 'آب رایگان', description: 'قیمت صفر، نه نامعلوم',
        price: 0, priceUnknown: false, available: true, featured: false, archivedAt: null, imageUrl: null, variants: [] },
      { publicId: 'sample-tea', name: 'چای روز', description: 'قیمت با کافه‌دار بررسی شود',
        price: null, priceUnknown: true, available: false, featured: false, archivedAt: null, imageUrl: null, variants: [] },
      { publicId: 'sample-formula', name: '=SUM(1,1)', description: 'رشتهٔ آزمایشی برای جلوگیری از اجرای فرمول',
        price: 120000, priceUnknown: false, available: true, featured: false,
        archivedAt: new Date('2026-01-01T00:00:00Z'), imageUrl: null, variants: [] },
    ],
  }],
} as unknown as Parameters<typeof buildMenuExport>[0]

const csv = buildMenuCsv(buildMenuExport(sample, new Date('2026-01-01T00:00:00Z')))
await writeFile(new URL('../docs/pilot/SAMPLE_MENU_EXPORT.csv', import.meta.url), csv, 'utf8')
