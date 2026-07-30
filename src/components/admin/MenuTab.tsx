import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { BackChevron, shellStyles } from '@/components/layout/MobileShell'
import { nextId } from '@/data/adminSeed'
import { fa } from '@/lib/format'
import type { MenuCategory, MenuItem } from '@/types'
import { IconChevronForward, IconPencil, IconPlus, IconTrash } from './AdminIcons'
import fields from './adminFields.module.css'
import { MenuItemCard } from './MenuItemCard'
import { MenuItemForm, type MenuItemDraft } from './MenuItemForm'
import styles from './MenuTab.module.css'

interface MenuTabProps {
  categories: MenuCategory[]
  setCategories: Dispatch<SetStateAction<MenuCategory[]>>
}

type MenuView = 'cats' | 'items' | 'form'

interface FormTarget {
  /** The item being edited, or null when adding a new one. */
  item: MenuItem | null
  catId: string
}

/**
 * Three-level menu editor: categories → items → item form. The level is local
 * state; the categories themselves belong to the page so they survive a switch
 * to another tab.
 */
export function MenuTab({ categories, setCategories }: MenuTabProps) {
  const [view, setView] = useState<MenuView>('cats')
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmCatId, setConfirmCatId] = useState<string | null>(null)
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null)

  const activeCat = categories.find((cat) => cat.id === activeCatId) ?? null

  function updateItems(catId: string, map: (items: MenuItem[]) => MenuItem[]) {
    setCategories((prev) =>
      prev.map((cat) => (cat.id !== catId ? cat : { ...cat, items: map(cat.items) })),
    )
  }

  function patchItem(catId: string, itemId: string, patch: Partial<MenuItem>) {
    updateItems(catId, (items) =>
      items.map((item) => (item.id !== itemId ? item : { ...item, ...patch })),
    )
  }

  function openCat(catId: string) {
    setActiveCatId(catId)
    setConfirmCatId(null)
    setView('items')
  }

  function saveNewCat(event: FormEvent) {
    event.preventDefault()
    const name = newCatName.trim()
    if (!name) {
      setAddingCat(false)
      return
    }
    setCategories((prev) => [...prev, { id: nextId('cat'), name, items: [] }])
    setAddingCat(false)
    setNewCatName('')
  }

  function saveRename(event: FormEvent) {
    event.preventDefault()
    const name = renameValue.trim()
    if (!renameId || !name) {
      setRenameId(null)
      return
    }
    setCategories((prev) => prev.map((cat) => (cat.id !== renameId ? cat : { ...cat, name })))
    setRenameId(null)
  }

  function saveItem(draft: MenuItemDraft) {
    const editingId = formTarget?.item?.id ?? null
    const values = { name: draft.name, en: draft.en, desc: draft.desc, price: draft.price }

    setCategories((prev) => {
      if (!editingId) {
        const created: MenuItem = { id: nextId('n'), ...values, active: true, discount: null }
        return prev.map((cat) =>
          cat.id !== draft.catId ? cat : { ...cat, items: [...cat.items, created] },
        )
      }

      // Saving can move the item to another category, so it is pulled out of
      // every category first and then appended to the chosen one.
      let moved: MenuItem | undefined
      const without = prev.map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          if (item.id !== editingId) return true
          moved = item
          return false
        }),
      }))
      const updated: MenuItem = { active: true, discount: null, ...moved, id: editingId, ...values }
      return without.map((cat) =>
        cat.id !== draft.catId ? cat : { ...cat, items: [...cat.items, updated] },
      )
    })

    setActiveCatId(draft.catId)
    setFormTarget(null)
    setView('items')
  }

  /* ===== level 3: item form ============================================== */

  if (view === 'form' && formTarget) {
    return (
      <MenuItemForm
        item={formTarget.item}
        catId={formTarget.catId}
        categories={categories}
        onCancel={() => {
          setFormTarget(null)
          setView('items')
        }}
        onSave={saveItem}
      />
    )
  }

  /* ===== level 2: items inside a category ================================ */

  if (view === 'items' && activeCat) {
    return (
      <div className={styles.itemsTab}>
        <div className={styles.head}>
          <button
            type="button"
            onClick={() => {
              setActiveCatId(null)
              setView('cats')
            }}
            aria-label="بازگشت به دسته‌ها"
            className={shellStyles.iconButton}
          >
            <BackChevron />
          </button>
          <h2 className={shellStyles.screenTitle}>{activeCat.name}</h2>
        </div>

        <ul className={styles.itemList}>
          {activeCat.items.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              onToggleActive={() => patchItem(activeCat.id, item.id, { active: !item.active })}
              onEdit={() => {
                setFormTarget({ item, catId: activeCat.id })
                setView('form')
              }}
              onDelete={() =>
                updateItems(activeCat.id, (items) => items.filter((it) => it.id !== item.id))
              }
              onSetDiscount={(percent) => patchItem(activeCat.id, item.id, { discount: percent })}
              onRemoveDiscount={() => patchItem(activeCat.id, item.id, { discount: null })}
            />
          ))}
        </ul>

        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.plusButton} ${styles.addItemButton}`}
          onClick={() => {
            setFormTarget({ item: null, catId: activeCat.id })
            setView('form')
          }}
        >
          <IconPlus size={19} />
          {`افزودن آیتم به ${activeCat.name}`}
        </button>
      </div>
    )
  }

  /* ===== level 1: category list ========================================== */

  return (
    <div className={styles.catsTab}>
      {addingCat ? (
        <form className={styles.addCatForm} onSubmit={saveNewCat}>
          <input
            className={styles.addCatInput}
            value={newCatName}
            onChange={(event) => setNewCatName(event.target.value)}
            placeholder="نام دستهٔ جدید"
            aria-label="نام دستهٔ جدید"
            autoFocus
          />
          <button type="submit" className={styles.addCatSave}>
            ذخیره
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={`${shellStyles.primaryButton} ${styles.plusButton} ${styles.addCatButton}`}
          onClick={() => {
            setAddingCat(true)
            setNewCatName('')
          }}
        >
          <IconPlus size={19} />
          افزودن دستهٔ جدید
        </button>
      )}

      <ul className={styles.catList}>
        {categories.map((cat) => {
          if (renameId === cat.id) {
            return (
              <li key={cat.id}>
                <form className={styles.renameRow} onSubmit={saveRename}>
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label={`نام دستهٔ ${cat.name}`}
                    autoFocus
                  />
                  <button type="submit" className={styles.renameSave}>
                    ذخیره
                  </button>
                </form>
              </li>
            )
          }

          if (confirmCatId === cat.id) {
            return (
              <li key={cat.id} className={styles.catConfirm}>
                <span className={fields.confirmText}>این دسته و همهٔ آیتم‌هایش حذف شوند؟</span>
                <div className={fields.confirmActions}>
                  <button
                    type="button"
                    className={fields.confirmYes}
                    onClick={() => {
                      setCategories((prev) => prev.filter((c) => c.id !== cat.id))
                      setConfirmCatId(null)
                    }}
                  >
                    حذف
                  </button>
                  <button
                    type="button"
                    className={fields.confirmNo}
                    onClick={() => setConfirmCatId(null)}
                  >
                    انصراف
                  </button>
                </div>
              </li>
            )
          }

          return (
            <li key={cat.id} className={styles.catRow}>
              <button type="button" className={styles.catOpen} onClick={() => openCat(cat.id)}>
                <span className={styles.catName}>{cat.name}</span>
                <span className={styles.catCount}>{`${fa(cat.items.length)} آیتم`}</span>
              </button>
              <button
                type="button"
                className={styles.catEdit}
                aria-label="ویرایش نام دسته"
                onClick={() => {
                  setRenameId(cat.id)
                  setRenameValue(cat.name)
                  setConfirmCatId(null)
                }}
              >
                <IconPencil size={17} />
              </button>
              <button
                type="button"
                className={styles.catDelete}
                aria-label="حذف دسته"
                onClick={() => setConfirmCatId(cat.id)}
              >
                <IconTrash size={17} />
              </button>
              <button
                type="button"
                className={styles.catChevron}
                aria-label="ورود به دسته"
                onClick={() => openCat(cat.id)}
              >
                <IconChevronForward size={20} strokeWidth={2.2} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
