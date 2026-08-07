import {
  Beef,
  Cake,
  Candy,
  Carrot,
  CircleDollarSign,
  Citrus,
  Coffee,
  CookingPot,
  Croissant,
  CupSoda,
  Drumstick,
  EggFried,
  Fish,
  Flame,
  Gift,
  Grape,
  Ham,
  IceCreamCone,
  Leaf,
  type LucideIcon,
  Martini,
  Milk,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  Wheat,
  Wind,
} from 'lucide-react'

/**
 * آیکون دسته‌های منو (facet).
 *
 * ═══ چرا نگاشت در کد و اموجی در دیتابیس ═══
 *
 * `FACETS` در `menuTaxonomy.ts` یک فیلد `icon` با اموجی دارد و همان مقدار در
 * جدول `facet` seed شده. عوض‌کردنش یعنی مهاجرت دیتابیس، برای چیزی که فقط
 * ظاهر است.
 *
 * پس داده دست‌نخورده می‌ماند و **رندر** عوض می‌شود: این نگاشت با `facetId` کار
 * می‌کند، نه با اموجی. مزیتش این است که اگر facet جدیدی اضافه شود و اینجا
 * نگاشت نداشته باشد، آیکون پیش‌فرض می‌گیرد نه یک مربعِ خالی.
 *
 * ═══ چرا اموجی کافی نبود ═══
 *
 * هر سیستم‌عامل اموجی را با فونت خودش می‌کشد: 🫖 روی ویندوز ۸ رنگ دارد و روی
 * اندروید تخت است، بعضی‌ها روی نسخه‌های قدیمی‌تر اصلاً پشتیبانی نمی‌شوند و
 * مربعِ خالی (􏿽) می‌دهند. در یک نوار فیلتر که ۳۵ چیپ دارد، این یعنی ۳۵ اندازه
 * و سبکِ متفاوت. آیکون برداری همه‌جا یک شکل و یک ضخامت است و رنگش را از
 * خودِ چیپ می‌گیرد.
 */

const ICONS: Record<string, LucideIcon> = {
  // نوشیدنی
  coffee: Coffee,
  cold_coffee: CupSoda,
  brewed_coffee: Coffee,
  matcha: Leaf,
  tea: Coffee,
  hot_drinks: Milk,
  mocktail: Martini,
  shake: CupSoda,
  smoothie: Grape,
  juice: Citrus,
  soft_drinks: CupSoda,

  // منو
  breakfast: EggFried,
  bakery: Croissant,
  cake_dessert: Cake,
  ice_cream: IceCreamCone,
  pasta: Wheat,
  pizza: Pizza,
  burger: Sandwich,
  sandwich: Sandwich,
  steak: Beef,
  fried: Drumstick,
  salad: Salad,
  appetizer: CookingPot,
  soup: Soup,
  sushi: Fish,
  healthy: Carrot,

  // آشپزی
  persian_food: CookingPot,
  kebab: Ham,
  seafood: Fish,
  main_dish: Utensils,
  fast_food: Pizza,

  // سرویس
  hookah: Wind,
  addons: Plus,
  service: Gift,

  // پرکاربردهای دیگر که ممکن است اضافه شوند
  candy: Candy,
  price: CircleDollarSign,
  grill: Flame,
}

interface Props {
  /** شناسه‌ی facet — نه اموجی‌اش. */
  id: string
  size?: number
  className?: string
}

export function FacetIcon({ id, size = 14, className }: Props) {
  // facetِ ناشناس آیکون عمومی می‌گیرد، نه هیچ — چیپِ بی‌آیکون در ردیفی که
  // بقیه آیکون دارند، شبیه خرابی دیده می‌شود.
  const Icon = ICONS[id] ?? Utensils
  return <Icon size={size} className={className} aria-hidden="true" />
}

export default FacetIcon
