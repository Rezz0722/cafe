import styles from './SearchStates.module.css'

export default function SearchLoading() {
  return (
    <main className={styles.state} aria-busy="true" aria-label="در حال بارگذاری نتایج">
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
      <span className={styles.screenReader} role="status">در حال آماده‌کردن نتایج…</span>
    </main>
  )
}
