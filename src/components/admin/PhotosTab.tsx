'use client'

import type { Dispatch, SetStateAction } from 'react'
import { shellStyles } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { nextId } from '@/data/adminSeed'
import { IconImage, IconPlus, IconTrash } from './AdminIcons'
import fields from './adminFields.module.css'
import styles from './PhotosTab.module.css'

interface PhotosTabProps {
  /** Gallery slots the owner has added; ids only until uploads exist. */
  photos: string[]
  setPhotos: Dispatch<SetStateAction<string[]>>
}

export function PhotosTab({ photos, setPhotos }: PhotosTabProps) {
  function addPhoto() {
    setPhotos((prev) => [...prev, nextId('ph')])
  }

  return (
    <div className={styles.tab}>
      <h2 className={`${fields.sectionTitle} ${styles.coverTitle}`}>عکس کاور</h2>
      <div className={styles.cover}>
        <CafePhoto alt="" placeholder="تپ کن تا عکس کاور رو عوض کنی" loading="eager" />
      </div>

      <h2 className={`${fields.sectionTitle} ${styles.galleryTitle}`}>گالری کافه</h2>

      {photos.length > 0 ? (
        <div className={styles.grid}>
          {photos.map((id) => (
            <div key={id} className={styles.tile}>
              <CafePhoto alt="" placeholder="عکس" />
              <button
                type="button"
                className={styles.removeButton}
                aria-label="حذف"
                onClick={() => setPhotos((prev) => prev.filter((photoId) => photoId !== id))}
              >
                <IconTrash size={15} strokeWidth={2.2} />
              </button>
            </div>
          ))}
          <button type="button" className={styles.addTile} onClick={addPhoto}>
            <IconPlus size={24} strokeWidth={2} />
            افزودن عکس
          </button>
        </div>
      ) : (
        <div className={fields.emptyBox}>
          <div className={styles.emptyIcon}>
            <IconImage size={32} strokeWidth={1.8} />
          </div>
          <div className={fields.emptyTitle}>هنوز عکسی اضافه نکردی</div>
          <div className={`${fields.emptyText} ${styles.emptyText}`}>
            بذار مشتری‌ها فضای گرم کافه‌ات رو ببینن!
          </div>
          <button type="button" className={shellStyles.primaryButton} onClick={addPhoto}>
            اولین عکس رو اضافه کن
          </button>
        </div>
      )}
    </div>
  )
}
