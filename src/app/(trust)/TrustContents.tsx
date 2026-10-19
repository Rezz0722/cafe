import styles from './trust.module.css'

export function TrustContents({ sections }: { sections: { id: string; title: string }[] }) {
  return <nav className={styles.contents} aria-label="فهرست مطالب این صفحه">
    <details>
      <summary>در این صفحه</summary>
      <ul>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul>
    </details>
  </nav>
}
