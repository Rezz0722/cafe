'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createPlaceAction } from '@/app/admin/new/actions'
import { EMPTY_STATE } from '@/app/admin/new/state'
import { FILTER_ATTRIBUTES } from '@/core/taxonomy/attributes'
import { paths } from '@/routes'
import type { District } from '@/core/places/types'
import styles from './NewPlaceForm.module.css'

const SOURCE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'field_visit', label: 'بازدید میدانی', hint: 'خودم رفتم و دیدم — بالاترین اعتماد' },
  { value: 'owner', label: 'اطلاعات مالک', hint: 'کافه‌دار گفته' },
  { value: 'instagram', label: 'اینستاگرام', hint: 'از صفحه‌ی کافه استخراج شده' },
  { value: 'user', label: 'گزارش کاربر', hint: 'کاربر پیشنهاد داده' },
  { value: 'inferred', label: 'حدسی / منبع نامعلوم', hint: 'تأیید نشده' },
]

const VALUE_OPTIONS = [
  { value: 0, label: 'نه' },
  { value: 1, label: 'تاحدی' },
  { value: 2, label: 'بله' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'در حال ثبت…' : 'ثبت کافه'}
    </button>
  )
}

export function NewPlaceForm({ districts }: { districts: District[] }) {
  const [state, formAction] = useActionState(createPlaceAction, EMPTY_STATE)

  const errorFor = (field: string) => state.errors.find((e) => e.field === field)?.message
  const formError = errorFor('form')

  if (state.ok && state.createdSlug) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon} aria-hidden="true">
          ✓
        </div>
        <h2 className={styles.successTitle}>«{state.createdName}» ثبت شد</h2>
        <p className={styles.successText}>
          صفحه‌اش ساخته شد و در جست‌وجو و صفحه‌ی محله‌اش می‌آید.
        </p>
        <div className={styles.successActions}>
          <Link href={paths.cafe(state.createdSlug)} className={styles.successPrimary}>
            دیدن صفحه‌ی کافه
          </Link>
          <a href={`${paths.admin}/new`} className={styles.successSecondary}>
            ثبت کافه‌ی بعدی
          </a>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className={styles.form}>
      {formError && <div className={styles.formError}>{formError}</div>}

      {/*
        هشدار تکراری — مسدودکننده‌ی قطعی نیست. دو کافه با نام مشابه در یک
        محله واقعاً ممکن است (شعبه‌ی دوم)، ولی تصمیم باید آگاهانه باشد.
      */}
      {state.duplicates.length > 0 && (
        <div className={styles.duplicateWarn}>
          <strong>شاید تکراری باشد.</strong> در همین محله این‌ها ثبت شده‌اند:
          <ul className={styles.duplicateList}>
            {state.duplicates.map((d) => (
              <li key={d.slug}>
                <Link href={paths.cafe(d.slug)} target="_blank">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
          <label className={styles.confirmRow}>
            <input type="checkbox" name="confirmDuplicate" value="1" defaultChecked />
            <span>می‌دانم؛ این یک کافه‌ی جداست، ثبتش کن</span>
          </label>
        </div>
      )}

      {/* ── هویت ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>هویت</legend>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>
              نام کافه <b className={styles.req}>*</b>
            </span>
            <input name="name" className={styles.input} required maxLength={120} />
            {errorFor('name') && <span className={styles.error}>{errorFor('name')}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>نام انگلیسی</span>
            <input name="nameEn" className={styles.input} dir="ltr" placeholder="Vien Cafe" />
            <span className={styles.hint}>
              آدرس صفحه از این ساخته می‌شود؛ خالی باشد از نام فارسی می‌سازد.
            </span>
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>
              محله <b className={styles.req}>*</b>
            </span>
            <select name="districtId" className={styles.input} required defaultValue="">
              <option value="" disabled>
                انتخاب کنید…
              </option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errorFor('districtId') && (
              <span className={styles.error}>{errorFor('districtId')}</span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>نوع</span>
            <select name="kind" className={styles.input} defaultValue="cafe">
              <option value="cafe">کافه</option>
              <option value="cafe_restaurant">کافه‌رستوران</option>
              <option value="restaurant">رستوران</option>
            </select>
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>
            آدرس <b className={styles.req}>*</b>
          </span>
          <input
            name="address"
            className={styles.input}
            required
            placeholder="مشهد، بلوار سجاد، نبش سجاد ۱۲"
          />
          {errorFor('address') && <span className={styles.error}>{errorFor('address')}</span>}
        </label>
      </fieldset>

      {/* ── تماس ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>تماس و قیمت</legend>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>تلفن</span>
            <input name="phone" className={styles.input} placeholder="۰۵۱-۳۷۶۵۴۳۲۱" />
            <span className={styles.hint}>
              اگر مطمئن نیستید خالی بگذارید — شماره‌ی غلط از نبودِ شماره بدتر است.
            </span>
            {errorFor('phone') && <span className={styles.error}>{errorFor('phone')}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>اینستاگرام</span>
            <input name="instagram" className={styles.input} dir="ltr" placeholder="cafe_name" />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>سطح قیمت</span>
            <select name="priceTier" className={styles.input} defaultValue="2">
              <option value="1">اقتصادی</option>
              <option value="2">متوسط</option>
              <option value="3">گران</option>
            </select>
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>ساعت باز شدن</span>
            <input name="opensAt" className={styles.input} dir="ltr" placeholder="09:00" />
            {errorFor('opensAt') && <span className={styles.error}>{errorFor('opensAt')}</span>}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>ساعت بسته شدن</span>
            <input name="closesAt" className={styles.input} dir="ltr" placeholder="23:00" />
            {errorFor('closesAt') && <span className={styles.error}>{errorFor('closesAt')}</span>}
          </label>
        </div>
        {errorFor('hours') && <span className={styles.error}>{errorFor('hours')}</span>}
        <span className={styles.hint}>
          فعلاً یک ساعت یکسان برای هر هفت روز ثبت می‌شود. ساعت روزانه و
          استثناها (تعطیلات، ماه رمضان) را بعداً در تب «ساعت کاری» ویرایش کنید.
        </span>
      </fieldset>

      {/* ── ویژگی‌ها ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>ویژگی‌ها</legend>
        <p className={styles.fieldsetNote}>
          همین‌ها هستند که محصول را از گوگل‌مپ متمایز می‌کنند. «تاحدی» یک جواب
          واقعی است — مثلاً پریز هست ولی نه سر همه‌ی میزها.
        </p>

        <div className={styles.attrGrid}>
          {FILTER_ATTRIBUTES.map((attr) => (
            <div key={attr.id} className={styles.attrRow}>
              <div className={styles.attrLabel}>
                {attr.labelFa}
                {attr.hint && <span className={styles.attrHint}>{attr.hint}</span>}
              </div>
              <div className={styles.attrOptions}>
                {VALUE_OPTIONS.map((opt) => (
                  <label key={opt.value} className={styles.radio}>
                    <input
                      type="radio"
                      name={`attr_${attr.id}`}
                      value={opt.value}
                      defaultChecked={opt.value === 0}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* ── توضیحات ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>توضیحات</legend>

        <label className={styles.field}>
          <span className={styles.label}>توضیح کوتاه</span>
          <textarea name="description" className={styles.textarea} rows={2} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>آیتم شاخص</span>
          <input
            name="signatureItem"
            className={styles.input}
            placeholder="اسپرسو سینگل اورجین، چیزکیک نیویورکی"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>نکات دیگر — هر خط یکی</span>
          <textarea
            name="highlights"
            className={styles.textarea}
            rows={3}
            placeholder={'کیک خانگی تازه\nدیوارنگاری هنری'}
          />
          <span className={styles.hint}>
            این‌ها فقط نمایش داده می‌شوند و قابل فیلتر نیستند. چیزی که باید
            فیلتر شود را بالا در «ویژگی‌ها» بزنید.
          </span>
        </label>
      </fieldset>

      {/* ── منبع ── */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>منبع اطلاعات</legend>
        <p className={styles.fieldsetNote}>
          مستقیماً روی اطمینان، امتیاز تازگی و نشان «تأییدشده» اثر می‌گذارد.
          فقط بازدید میدانی به‌عنوان «تأییدشده» ثبت می‌شود.
        </p>
        <div className={styles.sourceGrid}>
          {SOURCE_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.sourceOption}>
              <input
                type="radio"
                name="source"
                value={opt.value}
                defaultChecked={opt.value === 'field_visit'}
              />
              <span>
                <b>{opt.label}</b>
                <em className={styles.sourceHint}>{opt.hint}</em>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <SubmitButton />
        <Link href={paths.admin} className={styles.cancel}>
          انصراف
        </Link>
      </div>
    </form>
  )
}
