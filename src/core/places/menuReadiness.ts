import type { OwnerPlaceData } from './manage'

export type SetupTarget = 'info' | 'hours' | 'media' | 'menu' | 'qr'
export interface MenuSetupStep {
  id: string
  title: string
  detail: string
  complete: boolean
  target: SetupTarget
}

/** Advisory only: never changes publication, permissions or the quality score. */
export function menuReadiness(place: Pick<OwnerPlaceData, 'name' | 'address' | 'phones' | 'hours' | 'photos' | 'logoUrl' | 'sections' | 'status'>) {
  // Exactly the same branch scopes that VenuePanel exposes to customers.
  const sections = place.sections.filter(section => section.branchScope === 'shared' || section.branchScope === 'branch')
  const items = sections.flatMap(section => section.items.filter(item => !item.archivedAt))
  const available = items.filter(item => item.available)
  const validPrice = (price: number | null) => price !== null && Number.isFinite(price) && price >= 0
  const missingPrices = available.filter(item => !validPrice(item.price) || item.variants.some(variant => variant.available && !validPrice(variant.price))).length
  const steps: MenuSetupStep[] = [
    { id: 'identity', title: 'نام و راه ارتباطی شعبه', detail: 'نام، آدرس و حداقل یک شماره تماس را بررسی کنید.', complete: !!place.name.trim() && !!place.address.trim() && place.phones.some(phone => !!phone.trim()), target: 'info' },
    { id: 'hours', title: 'ساعت کاری', detail: 'حداقل یک شیفت باز با ساعت شروع و پایان ثبت کنید.', complete: place.hours.some(shift => !shift.closed && !!shift.opensAt && !!shift.closesAt), target: 'hours' },
    { id: 'media', title: 'تصویر واقعی مجموعه', detail: 'یک لوگو یا عکس واقعی از همین شعبه اضافه کنید.', complete: !!place.logoUrl || place.photos.length > 0, target: 'media' },
    { id: 'categories', title: 'دسته‌های منو', detail: 'دسته‌ای برای منوی مشترک یا همین شعبه بسازید.', complete: sections.some(section => !!section.name.trim()), target: 'menu' },
    { id: 'items', title: 'آیتم قابل ارائه', detail: available.length ? `${available.length.toLocaleString('fa-IR')} آیتم موجود در منوی این شعبه دارید.` : 'حداقل یک آیتم غیرآرشیوی را موجود کنید.', complete: available.length > 0, target: 'menu' },
    { id: 'prices', title: 'قیمت آیتم‌های موجود', detail: missingPrices ? `${missingPrices.toLocaleString('fa-IR')} آیتم موجود یا گزینهٔ آن قیمت عددی ندارد؛ اگر قیمت روز است، با مشتری روشن کنید.` : 'قیمت آیتم‌ها و گزینه‌های موجود را پیش از چاپ بررسی کنید.', complete: available.length > 0 && missingPrices === 0, target: 'menu' },
  ]
  return {
    steps,
    completed: steps.filter(step => step.complete).length,
    next: steps.find(step => !step.complete) ?? null,
    // Closed temporarily remains a valid public QR destination in the current policy.
    publicDestination: place.status === 'published' || place.status === 'temporarily_closed',
    temporarilyClosed: place.status === 'temporarily_closed',
  }
}
