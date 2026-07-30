import { useState } from 'react'
import cafePhoto from '@/assets/cafe-photo.webp'
import styles from './CafePhoto.module.css'

interface CafePhotoProps {
  alt: string
  /** Overrides the shared stock photo once real imagery is available. */
  src?: string
  /** Copy for the empty state, e.g. «عکس کافه». */
  placeholder?: string
  loading?: 'lazy' | 'eager'
}

/**
 * Venue photo with a graceful empty state. The design mockups used an
 * `<image-slot>` element for this; here a failed or missing `src` falls back to
 * the labelled placeholder instead of a broken image icon.
 */
export function CafePhoto({
  alt,
  src = cafePhoto,
  placeholder = 'عکس کافه',
  loading = 'lazy',
}: CafePhotoProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={styles.wrap}>
      {!failed && (
        <img
          className={styles.img}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {failed && <div className={styles.placeholder}>{placeholder}</div>}
    </div>
  )
}
