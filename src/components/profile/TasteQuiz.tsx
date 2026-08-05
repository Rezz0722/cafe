'use client'

/**
 * فرم سلیقه‌سنجی.
 *
 * ═══ چرا یک فرم و نه چند گام ═══
 *
 * شش سؤال کوتاه در یک صفحه، از شش صفحه‌ی پشت‌سرهم بهتر است: کاربر کل چیزی که
 * از او خواسته می‌شود را می‌بیند و می‌داند کِی تمام می‌شود. فرم چندگامی
 * برای فرم‌های بلند است، نه برای شش سؤال.
 *
 * ═══ چرا هیچ سؤالی اجباری نیست ═══
 *
 * پیشنهاد با سه جواب هم بهتر از پیشنهاد بدون جواب است. اجباری‌کردن، کاربر را
 * وادار می‌کند گزینه‌ای را بزند که واقعاً برایش مهم نیست — و آن جوابِ
 * تصادفی، پیشنهاد را بدتر می‌کند نه بهتر.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { QUIZ, type QuizAnswers } from '@/core/taste/quiz'
import { saveTasteAction } from '@/app/profile/actions'
import { EMPTY_ACTION_STATE } from '@/app/profile/state'
import styles from './TasteQuiz.module.css'

function SaveButton({ hasAnswers }: { hasAnswers: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.save} disabled={pending || !hasAnswers}>
      {pending ? 'در حال ذخیره…' : 'ذخیره و دیدن پیشنهادها'}
    </button>
  )
}

export function TasteQuiz({ initial }: { initial: QuizAnswers }) {
  const [state, action] = useActionState(saveTasteAction, EMPTY_ACTION_STATE)

  return (
    <form action={action} className={styles.form}>
      {QUIZ.map((question) => {
        const selected = initial[question.id] ?? []
        return (
          <fieldset key={question.id} className={styles.question}>
            <legend className={styles.legend}>
              {question.title}
              {question.hint && <span className={styles.hint}>{question.hint}</span>}
            </legend>

            <div className={styles.options}>
              {question.options.map((option) => (
                <label key={option.id} className={styles.option}>
                  <input
                    type={question.multi ? 'checkbox' : 'radio'}
                    name={question.id}
                    value={option.id}
                    defaultChecked={selected.includes(option.id)}
                  />
                  <span className={styles.optionBody}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      })}

      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.ok && state.message && <p className={styles.success}>{state.message}</p>}

      <p className={styles.note}>
        هیچ سؤالی اجباری نیست. هر چه بیشتر جواب بدهی پیشنهادها دقیق‌تر می‌شوند، و
        هر وقت بخواهی می‌توانی عوضشان کنی.
      </p>

      <SaveButton hasAnswers />
    </form>
  )
}

export default TasteQuiz
