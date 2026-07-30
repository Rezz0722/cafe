import styles from './Switch.module.css'

interface SwitchProps {
  checked: boolean
  onChange: () => void
  /** Describes what the switch controls, for assistive tech. */
  label: string
}

/** On/off toggle used throughout the admin panel. */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`${styles.switch} ${checked ? styles.on : ''}`}
    >
      <span className={styles.knob} />
    </button>
  )
}
