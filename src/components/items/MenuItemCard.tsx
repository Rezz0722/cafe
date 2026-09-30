import Link from 'next/link'
import { MapPin, Store } from 'lucide-react'
import type { MenuItemCard as MenuItemCardData } from '@/core/items/queries'
import { itemSlug } from '@/core/items/identity'
import { paths } from '@/routes'
import { fa, toman } from '@/lib/format'
import { MenuItemImage } from '@/components/cafe/MenuItemImage'
import styles from './MenuItemCard.module.css'

export function MenuItemCard({ item }: { item: MenuItemCardData }) {
  const itemHref = paths.item(item.publicId, itemSlug(item.name))

  return (
    <article className={`${styles.card} ${item.available ? '' : styles.unavailable}`}>
      <Link href={itemHref} className={styles.media} aria-label={`دیدن ${item.name}`}>
        <MenuItemImage
          src={item.image?.url ?? null}
          fallbackSrc={null}
          alt={item.image ? `${item.name} در ${item.place.name}` : ''}
          width={item.image?.width}
          height={item.image?.height}
          size={180}
        />
        {!item.image && <span className={styles.noPhoto}>بدون عکس محصول</span>}
      </Link>

      <div className={styles.body}>
        <div className={styles.tags}>
          {item.dishName && <span>{item.dishName}</span>}
          {!item.dishName && item.facetLabel && <span>{item.facetLabel}</span>}
          {!item.available && <span className={styles.soldOut}>ناموجود</span>}
        </div>

        <h2 className={styles.name}>
          <Link href={itemHref}>{item.name}</Link>
        </h2>
        {item.description && <p className={styles.description}>{item.description}</p>}

        <Link href={paths.cafe(item.place.slug)} className={styles.place}>
          <Store size={15} aria-hidden="true" />
          <span>{item.place.name}</span>
        </Link>
        {(item.place.districtName || item.distanceKm != null) && (
          <p className={styles.district}>
            <MapPin size={14} aria-hidden="true" />
            {item.place.districtName ?? 'مشهد'}
            {item.distanceKm != null && (
              <span> · {item.distanceKm < 1 ? `${fa(Math.round(item.distanceKm * 1000))} متر` : `${fa(item.distanceKm.toFixed(1))} کیلومتر`} فاصله مستقیم</span>
            )}
          </p>
        )}

        <div className={styles.foot}>
          <strong>{item.price === null ? 'قیمت روز' : toman(item.price)}</strong>
          {!!item.discountPercent && item.basePrice!=null && <small><del>{toman(item.basePrice)}</del> · {fa(item.discountPercent)}٪ تخفیف کل منو</small>}
          <Link href={itemHref} className={styles.detailLink}>
            جزئیات آیتم
          </Link>
        </div>
      </div>
    </article>
  )
}
