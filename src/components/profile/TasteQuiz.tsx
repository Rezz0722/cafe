'use client'

/**
 * فرم سلیقه‌سنجی.
 *
 * سؤال‌ها مرحله‌ای نمایش داده می‌شوند؛ تمام ورودی‌ها در DOM می‌مانند تا
 * رفت‌وبرگشت یا رد کردن یک سؤال پاسخ‌های مرحله‌های دیگر را از بین نبرد.
 *
 * ═══ چرا هیچ سؤالی اجباری نیست ═══
 *
 * پیشنهاد با سه جواب هم بهتر از پیشنهاد بدون جواب است. اجباری‌کردن، کاربر را
 * وادار می‌کند گزینه‌ای را بزند که واقعاً برایش مهم نیست — و آن جوابِ
 * تصادفی، پیشنهاد را بدتر می‌کند نه بهتر.
 */

import { useActionState, useState } from 'react'
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
  const [step, setStep] = useState(0)
  const [answers,setAnswers] = useState(initial)

  return (
    <form action={action} className={styles.form}>
      <p aria-live="polite">سؤال {step+1} از {QUIZ.length} · همهٔ سؤال‌ها اختیاری‌اند</p>
      <progress max={QUIZ.length} value={step+1} aria-label="پیشرفت سلیقه‌سنجی" />
      {QUIZ.map((question,index) => {
        const selected = answers[question.id] ?? []
        return (
          <fieldset key={question.id} className={styles.question} hidden={index!==step}>
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
                    checked={selected.includes(option.id)}
                    onChange={()=>setAnswers(current=>({...current,[question.id]:question.multi?(selected.includes(option.id)?selected.filter(id=>id!==option.id):[...selected,option.id]):[option.id]}))}
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

      <div className={styles.navigation}>{step>0 && <button type="button" onClick={()=>setStep(step-1)}>قبلی</button>}<button type="button" onClick={()=>{setAnswers(current=>({...current,[QUIZ[step].id]:[]}));setStep(Math.min(step+1,QUIZ.length-1))}}>برام مهم نیست</button>{step<QUIZ.length-1 && <button type="button" onClick={()=>setStep(step+1)}>ادامه</button>}</div>
      {step===QUIZ.length-1 && <SaveButton hasAnswers />}
    </form>
  )
}

export default TasteQuiz
