'use server'

/**
 * اکشن‌های پنل کافه‌دار.
 *
 * ═══ گاردِ مشترک: `requirePlaceAccess` ═══
 *
 * هر اکشن اول بررسی می‌کند که این کاربر **همین مکان** را اداره می‌کند. بدون
 * این بررسی، کافه‌داری که شناسه‌ی مکان را در فرم عوض کند می‌تواند منوی کافه‌ی
 * دیگری را ویرایش کند — و این نوع باگ در لاگ هم دیده نمی‌شود.
 *
 * ادمین به همه‌ی مکان‌ها دسترسی دارد، ولی در حالت «مشاهده به‌عنوان»
 * **هیچ نوشتنی** مجاز نیست.
 */

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { VIEW_AS_READONLY } from '@/core/auth/impersonation'
import {
  createUser,
  findUserById,
  findUserByPhone,
  findUserByUsername,
  getPlaceRole,
  grantPlaceRole,
  isUsernameTaken,
  revokePlaceRole,
} from '@/core/auth/userRepo'
import { canGrantPlaceRole, canManagePlaceUsers, canWritePlace } from '@/core/auth/authorization'
import { generatePassword, hashPassword } from '@/core/auth/password'
import {publicActionError} from '@/core/security/actionError'
import { cleanUserText } from '@/core/security/input'
import { normalizePhone } from '@/core/auth/phone'
import {
  bulkSetAvailability,
  addPlacePhotos,
  createMenuItem,
  createMenuItemVariant,
  createMenuSection,
  deleteArchivedMenuItem,
  deleteEmptyMenuSection,
  duplicateMenuItem,
  moveMenuItem,
  moveMenuItemVariant,
  moveMenuSection,
  movePlacePhoto,
  replacePlaceAttributes,
  replacePlaceHours,
  replyToReview,
  recordAudit,
  updateMenuItem,
  updateMenuItemVariant,
  updateMenuSection,
  setMenuItemArchived,
  setMenuSectionArtwork,
  setPlaceCover,
  setPlaceLogo,
  deletePlacePhoto,
  deleteMenuItemVariant,
  updatePlaceInfo,
  type Actor,
  type AttributeInput,
  type HourShiftInput,
} from '@/core/places/manage'
import { FILTER_ATTRIBUTES } from '@/core/taxonomy/attributes'
import { invalidateReferenceCache } from '@/core/places/queries'
import { getModerationPolicy } from '@/core/settings/policies'
import { getDb, afterDbCommit } from '@/db/client'
import { media as mediaTable, menuItem as menuItemTable, menuItemVariant as menuItemVariantTable, menuSection as menuSectionTable, place as placeTable, placePhoto as placePhotoTable, review as reviewTable } from '@/db/schema'
import { and, eq, inArray, isNotNull, notLike, sql } from 'drizzle-orm'
import { paths } from '@/routes'
import { storeUploadedImage } from '@/core/media/upload'
import { hashUrl } from '@/core/media/store'
import { CATEGORY_ARTWORK_BY_ID } from '@/core/taxonomy/categoryArtwork'
import { samePlaceRevision } from '@/core/places/revision'
import type { VenueActionState } from './state'
import { runManagedWrite } from '@/core/places/managedWrite'
import { makePricePlan, parsePriceSelection, applyPricePlan, restorePriceChange } from '@/core/places/menuPrices'
import { createOffer, issueCode, redeemCode, broadcastOffer } from '@/core/club/service'
import { saveVenueDiscount, cancelVenueDiscount } from '@/core/club/venueDiscounts'
import { changeClubOffer } from '@/core/club/manage'
import {toEnDigits} from '@/lib/format'
import { applyVenueMenuImport, previewVenueMenuImport } from '@/core/import/venueMenuImport'
import { manageQrChannel } from '@/core/qr/channels'

export async function venueQrAction(_previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(async () => {
    const access = await requirePlaceAccess(num(form, 'placeId'))
    if (!access.ok) return { ok: false, error: access.error }
    const operation = str(form, 'operation')
    if (operation === 'pause' && str(form, 'confirmed') !== 'yes') return { ok: false, error: 'توقف دسترسی QR چاپ‌شده را تأیید کنید.' }
    try {
      await manageQrChannel({ placeId: access.placeId, revision: str(form, 'revision'), operation, label: str(form, 'label'), kind: str(form, 'kind'), id: num(form, 'qrId') || 0 }, access.actor)
      afterDbCommit(() => revalidatePath(paths.ownerPanel))
      return { ok: true, qrAppliedRevision: Number(str(form, 'revision')) + 1, message: operation === 'create' ? 'QR ساخته شد؛ اکنون فایل چاپ را دریافت کنید.' : operation === 'pause' ? 'QR متوقف شد؛ لینک چاپ‌شده تا فعال‌سازی دوباره باز نمی‌شود.' : 'همان QR دوباره فعال شد؛ چاپ مجدد لازم نیست.' }
    } catch (error) { return { ok: false, error: publicActionError(error, 'تغییر QR انجام نشد.') } }
  })
}

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

async function libraryCategoryArtworkMediaId(artworkId: string): Promise<number | null> {
  const artwork = CATEGORY_ARTWORK_BY_ID.get(artworkId)
  if (!artwork) return null
  const sourceUrl = `builtin://menu-category/${artwork.id}`
  const urlHash = hashUrl(sourceUrl)
  const localPath = artwork.path.replace(/^\/+/, '')
  const db = getDb()
  await db.insert(mediaTable).values({
    urlHash,
    sourceUrl,
    localPath,
    kind: 'menu_section',
    format: 'webp',
    width: 720,
    height: 720,
    status: 'ok',
    attempts: 1,
    fetchedAt: new Date(),
  }).onDuplicateKeyUpdate({ set: { localPath, status: 'ok', error: null } })
  const [row] = await db.select({ id: mediaTable.id }).from(mediaTable).where(eq(mediaTable.urlHash, urlHash)).limit(1)
  return row?.id ?? null
}

/** فقط تصویری قابل استفادهٔ مجدد است که واقعاً روی یک دستهٔ عمومی باشد. */
async function sharedCategoryArtworkMediaId(mediaId: number | null): Promise<number | null> {
  if (!mediaId) return null
  const [row] = await getDb()
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .innerJoin(menuSectionTable, eq(menuSectionTable.mediaId, mediaTable.id))
    .where(and(
      eq(mediaTable.id, mediaId),
      eq(mediaTable.status, 'ok'),
      isNotNull(mediaTable.localPath),
      notLike(mediaTable.sourceUrl, 'builtin://menu-category/%'),
      inArray(menuSectionTable.branchScope, ['shared', 'branch']),
    ))
    .limit(1)
  return row?.id ?? null
}

export async function manageClubOfferAction(_previous:VenueActionState,form:FormData):Promise<VenueActionState>{
  return runManagedWrite(async()=>{
    const access=await requirePlaceAccess(num(form,'placeId'))
    if(!access.ok)return {ok:false,error:access.error}
    if(!canManagePeople(access))return {ok:false,error:'فقط مالک یا مدیر سیستم می‌تواند پیشنهاد را مدیریت کند.'}
    try{
      const offerId=num(form,'offerId')??0,operation=str(form,'operation')
      const before=await changeClubOffer(access.placeId,offerId,operation,{title:str(form,'title'),description:str(form,'description'),discountLabel:str(form,'discountLabel'),expiresAt:str(form,'expiresAt')})
      await recordAudit(access.actor,`club.offer.${operation}`,'place',access.placeId,before,{offerId})
      afterDbCommit(()=>{revalidatePath(paths.ownerPanel);revalidatePath(paths.profile)})
      return {ok:true,message:operation==='cancel'?'پیشنهاد و کدهای مصرف‌نشده آن متوقف شدند.':'پیشنهاد ذخیره شد.'}
    }catch(error){return {ok:false,error:publicActionError(error,'عملیات انجام نشد.')}}
  })
}

function num(form: FormData, key: string): number | null {
  const raw = toEnDigits(str(form, key)).replace(/[٬,]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === 'true'
}

async function createClubOfferActionImpl(_prev:VenueActionState,form:FormData):Promise<VenueActionState>{const access=await requirePlaceAccess(num(form,'placeId'));if(!access.ok)return{ok:false,error:access.error};if(!canManagePeople(access))return{ok:false,error:'فقط مالک یا مدیر سیستم به باشگاه مشتریان دسترسی دارد.'};try{await createOffer({placeId:access.placeId,title:str(form,'title'),description:str(form,'description'),discountLabel:str(form,'discountLabel'),createdBy:access.actor.userId,expiresAt:str(form,'expiresAt')});await recordAudit(access.actor,'club.offer.create','place',access.placeId,null,str(form,'title'));revalidatePath(paths.ownerPanel);return{ok:true,message:'پیشنهاد باشگاه ساخته شد.'}}catch(e){return{ok:false,error:publicActionError(e,'پیشنهاد ساخته نشد.')}}}
async function issueClubCodeActionImpl(_prev:VenueActionState,form:FormData):Promise<VenueActionState>{const access=await requirePlaceAccess(num(form,'placeId'));if(!access.ok)return{ok:false,error:access.error};if(!canManagePeople(access))return{ok:false,error:'فقط مالک یا مدیر سیستم به باشگاه مشتریان دسترسی دارد.'};try{const code=await issueCode({placeId:access.placeId,offerId:num(form,'offerId')??0,userId:str(form,'userId')});await recordAudit(access.actor,'club.code.issue','place',access.placeId,null,{userId:str(form,'userId')});revalidatePath(paths.ownerPanel);return{ok:true,message:`کد ${code} صادر شد و در پنل کاربر دیده می‌شود.`}}catch(e){return{ok:false,error:publicActionError(e,'کد صادر نشد.')}}}
async function redeemClubCodeActionImpl(_prev:VenueActionState,form:FormData):Promise<VenueActionState>{const access=await requirePlaceAccess(num(form,'placeId'));if(!access.ok)return{ok:false,error:access.error};if(!canManagePeople(access))return{ok:false,error:'فقط مالک یا مدیر سیستم به باشگاه مشتریان دسترسی دارد.'};const ok=await redeemCode({placeId:access.placeId,code:str(form,'code'),actorId:access.actor.userId});if(!ok)return{ok:false,error:'کد معتبر، استفاده‌نشده و متعلق به این کافه پیدا نشد.'};await recordAudit(access.actor,'club.code.redeem','place',access.placeId,null,str(form,'code').slice(-4));revalidatePath(paths.ownerPanel);revalidatePath(paths.profile);return{ok:true,message:'کد با موفقیت مصرف شد.'}}

async function broadcastClubOfferActionImpl(_prev:VenueActionState,form:FormData):Promise<VenueActionState>{
  const access=await requirePlaceAccess(num(form,'placeId'))
  if(!access.ok)return{ok:false,error:access.error}
  if(!canManagePeople(access))return{ok:false,error:'فقط مالک یا مدیر سیستم می‌تواند پیشنهاد را ارسال کند.'}
  try{const result=await broadcastOffer(access.placeId,num(form,'offerId')??0);await recordAudit(access.actor,'club.offer.broadcast','place',access.placeId,null,result);revalidatePath(paths.ownerPanel);revalidatePath(paths.profile);return{ok:true,message:`برای ${result.sent} عضو ارسال شد؛ ${result.alreadySent} عضو قبلاً دریافت کرده‌اند.`}}
  catch(e){return{ok:false,error:publicActionError(e,'ارسال انجام نشد.')}}
}
async function venueDiscountActionImpl(_prev:VenueActionState,form:FormData):Promise<VenueActionState>{
  const access=await requirePlaceAccess(num(form,'placeId'))
  if(!access.ok)return{ok:false,error:access.error}
  if(!canManagePeople(access))return{ok:false,error:'فقط مالک یا مدیر سیستم می‌تواند کمپین تخفیف را تغییر دهد.'}
  try{if(str(form,'operation')==='cancel')await cancelVenueDiscount(access.placeId);else await saveVenueDiscount(access.placeId,num(form,'percent')??0,str(form,'expiresAt'),access.actor.userId);await recordAudit(access.actor,'venue.discount.update','place',access.placeId,null,{percent:num(form,'percent'),operation:str(form,'operation')});revalidatePath(paths.ownerPanel);revalidatePath(paths.home);revalidatePath(paths.profile);revalidatePath('/cafe','layout');return{ok:true,message:str(form,'operation')==='cancel'?'تخفیف عمومی غیرفعال شد.':'تخفیف روی کل منوی این شعبه فعال شد.'}}
  catch(e){return{ok:false,error:publicActionError(e,'تخفیف ذخیره نشد.')}}
}

interface Access {
  ok: true
  placeId: number
  actor: Actor
  isAdmin: boolean
  placeRole: 'owner' | 'manager' | 'staff' | null
}

async function requirePlaceAccess(
  placeId: number | null,
): Promise<Access | { ok: false; error: string }> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  if (!placeId) return { ok: false, error: 'مجموعه مشخص نیست.' }

  const account = await findUserById(user.id)
  if (!account || account.blocked) return { ok: false, error: 'حساب فعال پیدا نشد.' }
  if (account.mustChangePassword) {
    return { ok: false, error: 'پیش از مدیریت کافه، رمز موقت را تغییر دهید.' }
  }

  const placeRole = user.role === 'admin' ? 'owner' : await getPlaceRole(user.id, placeId)
  const allowed = canWritePlace(user.role, placeRole)
  if (!allowed) return { ok: false, error: 'به این مجموعه دسترسی ندارید.' }

  return {
    ok: true,
    placeId,
    actor: { userId: user.id, label: user.name || user.phone || user.id },
    isAdmin: user.role === 'admin',
    placeRole,
  }
}

function canManagePeople(access: Access): boolean {
  return canManagePlaceUsers(access.isAdmin ? 'admin' : 'owner', access.placeRole)
}

/** slug مکان — برای `revalidatePath` تا صفحه‌ی عمومی هم تازه شود. */
async function slugOf(placeId: number): Promise<string | null> {
  const db = getDb()
  const [row] = await db
    .select({ slug: placeTable.slug })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  return row?.slug ?? null
}

async function revalidateBoth(placeId: number): Promise<void> {
  invalidateReferenceCache()
  // تغییر جدول‌های فرزند (ساعت، عکس، منو…) به‌طور خودکار رکورد مکان را
  // عوض نمی‌کند. افزایش شماره‌نسخه باعث می‌شود تب یا
  // دستگاه قدیمی نتواند بی‌خبر روی تغییر جدید بنویسد.
  await getDb().update(placeTable).set({
    revision: sql`${placeTable.revision} + 1`,
    updatedAt: new Date(),
  }).where(eq(placeTable.id, placeId))
  const slug = await slugOf(placeId)
  afterDbCommit(() => {
    if (slug) revalidatePath(paths.cafe(slug))
    revalidatePath(paths.ownerPanel)
    revalidatePath(paths.search)
    revalidatePath(paths.home)
  })
}

async function placeConflict(
  placeId: number,
  revision: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!revision) {
    return { ok: false, error: 'نسخه فرم معتبر نیست؛ صفحه را تازه کنید.' }
  }
  const [place] = await getDb()
    .select({ revision: placeTable.revision })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
    .for('update')
  if (!place) return { ok: false, error: 'این مجموعه پیدا نشد.' }
  if (!samePlaceRevision(place.revision, revision)) {
    return {
      ok: false,
      error: 'اطلاعات این شعبه در تب یا دستگاه دیگری تغییر کرده است. صفحه را تازه کنید تا تغییر جدید از بین نرود.',
    }
  }
  return { ok: true }
}

async function canUseSection(access: Access, sectionId: number): Promise<boolean> {
  const [section] = await getDb()
    .select({ branchScope: menuSectionTable.branchScope })
    .from(menuSectionTable)
    .where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, access.placeId)))
    .limit(1)
  if (!section) return false
  return access.isAdmin || section.branchScope === 'shared' || section.branchScope === 'branch'
}

// ═══════════════════════════════════════════════════════════════════════
// کاربران همین شعبه
// ═══════════════════════════════════════════════════════════════════════

async function saveVenueUserActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  if (!canManagePeople(access)) return { ok: false, error: 'فقط مالک شعبه می‌تواند کاربران آن را مدیریت کند.' }

  const phoneRaw = str(form, 'phone')
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null
  const username = str(form, 'username').toLowerCase()
  const name = cleanUserText(str(form, 'name'), 120)
  const requestedRole = str(form, 'role')
  const role = requestedRole === 'owner' ? 'owner' : 'manager'

  if (!canGrantPlaceRole(access.isAdmin ? 'admin' : 'owner', access.placeRole, role)) {
    return { ok: false, error: 'فقط مدیر سیستم می‌تواند مالک دیگری تعیین کند.' }
  }

  if (phoneRaw && !phone) return { ok: false, error: 'شماره موبایل معتبر نیست.' }
  if (!phone && !username) return { ok: false, error: 'شماره موبایل یا نام کاربری لازم است.' }
  if (username && !/^[a-z0-9_.]{3,32}$/.test(username)) {
    return { ok: false, error: 'نام کاربری باید ۳ تا ۳۲ کاراکتر لاتین کوچک، رقم، نقطه یا زیرخط باشد.' }
  }

  const [byPhone, byUsername] = await Promise.all([
    phone ? findUserByPhone(phone) : null,
    username ? findUserByUsername(username) : null,
  ])
  if (byPhone && byUsername && byPhone.id !== byUsername.id) {
    return { ok: false, error: 'شماره و نام کاربری به دو حساب متفاوت تعلق دارند.' }
  }
  let user = byPhone ?? byUsername
  if (user?.blocked) return { ok: false, error: 'این حساب فعال نیست.' }

  let credentials: VenueActionState['credentials']
  if (!user) {
    if (username && (await isUsernameTaken(username))) return { ok: false, error: 'این نام کاربری گرفته شده است.' }
    const password = generatePassword(16)
    user = await createUser({
      phone,
      username: username || null,
      name,
      role: 'owner',
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      createdByUserId: access.actor.userId,
    })
    credentials = { username: user.username || user.phone, password }
  }

  await grantPlaceRole(user.id, access.placeId, { role, grantedByUserId: access.actor.userId })
  await recordAudit(access.actor, 'venue.user.grant', 'app_user', user.id, null, {
    placeId: access.placeId,
    role,
    reusedExisting: !credentials,
  })
  revalidatePath(`${paths.ownerPanel}?place=${access.placeId}`)
  return {
    ok: true,
    message: credentials ? 'کاربر ساخته و به این شعبه متصل شد.' : 'حساب موجود بدون تغییر رمز به این شعبه متصل شد.',
    credentials,
  }
}

async function removeVenueUserActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  if (!canManagePeople(access)) return { ok: false, error: 'فقط مالک شعبه می‌تواند کاربران آن را مدیریت کند.' }
  const userId = str(form, 'userId')
  if (!userId) return { ok: false, error: 'کاربر مشخص نیست.' }
  if (userId === access.actor.userId) return { ok: false, error: 'دسترسی خودتان را از همین صفحه حذف نکنید.' }
  const targetRole = await getPlaceRole(userId, access.placeId)
  if (!targetRole) return { ok: false, error: 'این کاربر به شعبه دسترسی فعال ندارد.' }
  if (targetRole === 'owner' && !access.isAdmin) return { ok: false, error: 'حذف مالک فقط توسط مدیر سیستم انجام می‌شود.' }

  await revokePlaceRole(userId, access.placeId)
  await recordAudit(access.actor, 'venue.user.revoke', 'app_user', userId, { placeId: access.placeId, role: targetRole }, null)
  revalidatePath(`${paths.ownerPanel}?place=${access.placeId}`)
  return { ok: true, message: 'دسترسی این کاربر به شعبه برداشته شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// اطلاعات پایه
// ═══════════════════════════════════════════════════════════════════════

async function saveVenueInfoActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  if(['lat','lng'].some(key=>str(form,key)&&num(form,key)===null))return {ok:false,error:'مختصات واردشده عدد معتبر نیست؛ هیچ تغییری ذخیره نشد.'}
  if(access.isAdmin&&str(form,'brandId')&&(!Number.isSafeInteger(num(form,'brandId'))||num(form,'brandId')!<1))return {ok:false,error:'مجموعه مادر معتبر نیست.'}
  const result = await updatePlaceInfo(
    access.placeId,
    {
      name: str(form, 'name'),
      kind: form.has('kind') ? str(form,'kind') : undefined,
      districtId: form.has('districtId') && str(form,'districtId') !== 'auto' ? str(form,'districtId') || null : undefined,
      ...(access.isAdmin ? {brandId:form.has('brandId')?num(form,'brandId'):undefined,branchName:form.has('branchName')?str(form,'branchName'):undefined,isPrimaryBranch:form.has('brandId')?bool(form,'isPrimaryBranch'):undefined} : {}),
      nameEn: str(form, 'nameEn') || null,
      about: str(form, 'about') || null,
      address: str(form, 'address'),
      instagram: str(form, 'instagram') || null,
      lat: num(form, 'lat'),
      lng: num(form, 'lng'),
      phonesRaw: str(form, 'phones'),
    },
    access.actor,
  )

  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'اطلاعات ذخیره شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ساعت کاری
// ═══════════════════════════════════════════════════════════════════════

async function saveVenueHoursActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  /*
    فرم برای هر روز دو شیفت می‌فرستد: `open_0_0`, `close_0_0`, `open_0_1`, …
    شیفت خالی نادیده گرفته می‌شود، پس کافه‌داری که شیفت دوم ندارد چیزی
    نمی‌نویسد و همان یک شیفت ثبت می‌شود.
  */
  const shifts: HourShiftInput[] = []
  for (let dow = 0; dow < 7; dow++) {
    const closed = bool(form, `closed_${dow}`)
    if (closed) {
      shifts.push({ dow, shiftIndex: 0, opensAt: null, closesAt: null, closed: true })
      continue
    }
    for (let shiftIndex = 0; shiftIndex < 2; shiftIndex++) {
      const opensAt = str(form, `open_${dow}_${shiftIndex}`)
      const closesAt = str(form, `close_${dow}_${shiftIndex}`)
      if(Boolean(opensAt)!==Boolean(closesAt))return {ok:false,error:'ساعت شروع و پایان هر شیفت باید با هم وارد شوند؛ هیچ تغییری ذخیره نشد.'}
      if (!opensAt || !closesAt) continue
      shifts.push({ dow, shiftIndex, opensAt, closesAt, closed: false })
    }
  }

  const result = await replacePlaceHours(access.placeId, shifts, access.actor)
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'ساعت کاری ذخیره شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ویژگی‌ها
// ═══════════════════════════════════════════════════════════════════════

async function saveVenueAttributesActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  /*
    فرم برای هر ویژگی یک `attr_<id>` می‌فرستد با یکی از مقادیر
    `''` (ثبت‌نشده) · `0` · `1` · `2`. رشته‌ی خالی ردیف نمی‌سازد — «نپرسیدیم»
    با «نه» یکی نیست، و ذخیره‌ی صفر برای هر ویژگیِ دست‌نخورده یعنی ۲۷ ادعای
    نادرست به‌ازای هر کافه.

    فهرست از `FILTER_ATTRIBUTES` می‌آید نه از کلیدهای فرم: کاربر می‌تواند هر
    کلیدی بفرستد، و `replacePlaceAttributes` هم دوباره اعتبارسنجی می‌کند.
  */
  const inputs: AttributeInput[] = []
  for (const def of FILTER_ATTRIBUTES) {
    const raw = str(form, `attr_${def.id}`)
    if (raw === '') continue
    const value = Number(raw)
    if (value !== 0 && value !== 1 && value !== 2) continue
    inputs.push({ attributeId: def.id, value })
  }

  const result = await replacePlaceAttributes(access.placeId, inputs, access.actor)
  if (!result.ok) return { ok: false, error: result.error }

  /*
    کشِ داده‌ی مرجع باید بشکند، وگرنه شمارشِ کارت‌های نیت روی صفحه‌ی اول تا یک
    دقیقه عددِ قبلی را نشان می‌دهد — و کافه‌داری که همین حالا ویژگی ثبت کرده،
    صفحه‌ی اول را باز می‌کند و فکر می‌کند ذخیره نشده.
  */
  invalidateReferenceCache()
  await revalidateBoth(access.placeId)
  revalidatePath(paths.home)
  revalidatePath(paths.search)

  const yes = inputs.filter((input) => input.value > 0).length
  return {
    ok: true,
    message: yes > 0
      ? `${yes.toLocaleString('fa-IR')} ویژگی ثبت شد.`
      : 'ویژگی‌ها ذخیره شد.',
  }
}

// ═══════════════════════════════════════════════════════════════════════
// لوگو و تصاویر محیط
// ═══════════════════════════════════════════════════════════════════════

async function uploadVenueLogoActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  const image = form.get('logo')
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: 'فایل لوگو را انتخاب کنید.' }
  }
  const stored = await storeUploadedImage(image)
  if (!stored.ok) return { ok: false, error: stored.error }
  const result = await setPlaceLogo(access.placeId, stored.mediaId, access.actor)
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'لوگوی مجموعه ذخیره شد.' }
}

async function uploadVenuePhotosActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  const files = form.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0)
  if (files.length === 0) return { ok: false, error: 'حداقل یک تصویر محیط انتخاب کنید.' }
  if (files.length > 8) return { ok: false, error: 'در هر بار حداکثر ۸ تصویر بارگذاری کنید.' }
  const [gallerySummary] = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(placePhotoTable)
    .where(eq(placePhotoTable.placeId, access.placeId))
  const remaining = Math.max(0, 20 - Number(gallerySummary?.count ?? 0))
  if (files.length > remaining) {
    return { ok: false, error: remaining > 0 ? `فقط ${remaining.toLocaleString('fa-IR')} جای خالی در گالری مانده است.` : 'گالری به سقف ۲۰ تصویر رسیده است؛ ابتدا یک تصویر حذف کنید.' }
  }

  // پردازش ترتیبی، مصرف حافظهٔ موبایل/سرور را در آپلود چند عکس کنترل می‌کند.
  const uploads: { mediaId: number; alt: string }[] = []
  const alt = cleanUserText(str(form, 'alt'), 255)
  for (const file of files) {
    const stored = await storeUploadedImage(file)
    if (!stored.ok) return { ok: false, error: `${file.name || 'تصویر'}: ${stored.error}` }
    uploads.push({ mediaId: stored.mediaId, alt })
  }
  const result = await addPlacePhotos(access.placeId, uploads, access.actor)
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  const skipped = result.skipped ?? 0
  return {
    ok: true,
    message: `${(result.added ?? 0).toLocaleString('fa-IR')} تصویر اضافه شد${skipped ? `؛ ${skipped.toLocaleString('fa-IR')} تصویر تکراری/اضافی نادیده گرفته شد` : ''}.`,
  }
}

async function photoOperationActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const operation = str(form, 'operation')
  let placeId = num(form, 'placeId')
  const photoId = num(form, 'photoId')
  if (photoId) {
    const [photo] = await getDb()
      .select({ placeId: placePhotoTable.placeId })
      .from(placePhotoTable)
      .where(eq(placePhotoTable.id, photoId))
      .limit(1)
    if (!photo) return { ok: false, error: 'این تصویر پیدا نشد.' }
    placeId = photo.placeId
  }
  const access = await requirePlaceAccess(placeId)
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  let result: { ok: boolean; error?: string }
  if (operation === 'logo.remove') {
    result = await setPlaceLogo(access.placeId, null, access.actor)
  } else {
    if (!photoId) return { ok: false, error: 'تصویر مشخص نیست.' }
    switch (operation) {
      case 'photo.cover':
        result = await setPlaceCover(access.placeId, photoId, access.actor)
        break
      case 'photo.up':
      case 'photo.down':
        result = await movePlacePhoto(access.placeId, photoId, operation.endsWith('up') ? 'up' : 'down', access.actor)
        break
      case 'photo.delete':
        result = await deletePlacePhoto(access.placeId, photoId, access.actor)
        break
      default:
        return { ok: false, error: 'عملیات تصویر معتبر نیست.' }
    }
  }
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  const message: Record<string, string> = {
    'logo.remove': 'لوگو حذف شد.',
    'photo.cover': 'تصویر اصلی صفحه تغییر کرد.',
    'photo.up': 'تصویر یک جایگاه جلو رفت.',
    'photo.down': 'تصویر یک جایگاه عقب رفت.',
    'photo.delete': 'تصویر از گالری حذف شد.',
  }
  return { ok: true, message: message[operation] }
}

// ═══════════════════════════════════════════════════════════════════════
// منو
// ═══════════════════════════════════════════════════════════════════════

async function createMenuSectionActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  const result = await createMenuSection(access.placeId, str(form, 'name'), access.actor)
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'دستهٔ جدید ساخته شد.' }
}

async function createMenuItemActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  const sectionId = num(form, 'sectionId')
  if (!sectionId) return { ok: false, error: 'دستهٔ آیتم را انتخاب کنید.' }
  if (!(await canUseSection(access, sectionId))) {
    return { ok: false, error: 'این دسته به شعبهٔ قابل‌مدیریت شما تعلق ندارد.' }
  }

  const image = form.get('image')
  let mediaId: number | null = null
  if (image instanceof File && image.size > 0) {
    const stored = await storeUploadedImage(image)
    if (!stored.ok) return { ok: false, error: stored.error }
    mediaId = stored.mediaId
  }

  const priceRaw = str(form, 'price')
  const result = await createMenuItem(
    access.placeId,
    {
      sectionId,
      name: str(form, 'name'),
      description: str(form, 'description') || null,
      price: priceRaw === '' ? null : num(form, 'price'),
      mediaId,
      // فقط ادمین می‌تواند ردهٔ قیمت عمومی را دست‌کاری کند.
      excludeFromPriceStats: access.isAdmin && bool(form, 'excludeFromPriceStats'),
    },
    access.actor,
  )
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return {
    ok: true,
    message: mediaId
      ? 'آیتم با عکس ساخته و به جست‌وجو متصل شد.'
      : 'آیتم جدید ساخته و به جست‌وجو متصل شد.',
  }
}

async function saveMenuItemActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const itemId = num(form, 'itemId')
  if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }

  // مالکیتِ **آیتم** بررسی می‌شود، از طریق مکانی که آیتم به آن تعلق دارد —
  // نه از طریق `placeId` که در فرم آمده و قابل دستکاری است.
  const db = getDb()
  const [item] = await db
    .select({ placeId: menuItemTable.placeId, branchScope: menuSectionTable.branchScope })
    .from(menuItemTable)
    .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
    .where(eq(menuItemTable.id, itemId))
    .limit(1)
  if (!item) return { ok: false, error: 'این آیتم پیدا نشد.' }

  const access = await requirePlaceAccess(item.placeId)
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  if (!access.isAdmin && item.branchScope !== 'shared' && item.branchScope !== 'branch') {
    return { ok: false, error: 'این آیتم به شعبهٔ دیگری تعلق دارد.' }
  }
  const targetSectionId = num(form, 'sectionId')
  if (targetSectionId && !(await canUseSection(access, targetSectionId))) {
    return { ok: false, error: 'دستهٔ مقصد به شعبهٔ قابل‌مدیریت شما تعلق ندارد.' }
  }

  const image = form.get('image')
  let mediaId: number | null | undefined
  let imageChanged = false
  if (image instanceof File && image.size > 0) {
    const stored = await storeUploadedImage(image)
    if (!stored.ok) return { ok: false, error: stored.error }
    mediaId = stored.mediaId
    imageChanged = true
  } else if (bool(form, 'removeImage')) {
    mediaId = null
    imageChanged = true
  }

  const priceRaw = str(form, 'price')
  const [variantSummary] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(menuItemVariantTable)
    .where(eq(menuItemVariantTable.itemId, itemId))
  const hasVariants = Number(variantSummary?.count ?? 0) > 0
  const result = await updateMenuItem(
    itemId,
    {
      name: str(form, 'name'),
      description: str(form, 'description') || null,
      // خالی‌گذاشتن قیمت یعنی «قیمت روز»، نه صفر.
      // برای آیتم چندسایزی، قیمت پایه فقط از کمترین سایز محاسبه می‌شود؛
      // مقدار دستکاری‌شدهٔ فرم حق ندارد این قرارداد را دور بزند.
      price: hasVariants ? undefined : priceRaw === '' ? null : num(form, 'price'),
      available: bool(form, 'available'),
      featured: bool(form, 'featured'),
      // مالک هنگام ذخیرهٔ سایر فیلدها نباید استثنای تعیین‌شده توسط ادمین را پاک کند.
      excludeFromPriceStats: access.isAdmin
        ? bool(form, 'excludeFromPriceStats')
        : undefined,
      sectionId: targetSectionId ?? undefined,
      mediaId,
    },
    access.actor,
  )

  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: imageChanged ? 'آیتم و تصویر آن ذخیره شد.' : 'آیتم ذخیره شد.' }
}

/** مدیریت سایزهای یک آیتم با احراز مالکیت از خود variant/item، نه placeId فرم. */
async function menuVariantActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const operation = str(form, 'operation')
  const itemId = num(form, 'itemId')
  const variantId = num(form, 'variantId')
  const db = getDb()
  const [owned] = variantId
    ? await db
      .select({ itemId: menuItemTable.id, placeId: menuItemTable.placeId, branchScope: menuSectionTable.branchScope })
      .from(menuItemVariantTable)
      .innerJoin(menuItemTable, eq(menuItemTable.id, menuItemVariantTable.itemId))
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(eq(menuItemVariantTable.id, variantId))
      .limit(1)
    : itemId
      ? await db
        .select({ itemId: menuItemTable.id, placeId: menuItemTable.placeId, branchScope: menuSectionTable.branchScope })
        .from(menuItemTable)
        .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
        .where(eq(menuItemTable.id, itemId))
        .limit(1)
      : []
  if (!owned) return { ok: false, error: 'آیتم یا سایز پیدا نشد.' }
  const access = await requirePlaceAccess(owned.placeId)
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  if (!access.isAdmin && owned.branchScope !== 'shared' && owned.branchScope !== 'branch') {
    return { ok: false, error: 'این آیتم به شعبهٔ قابل‌مدیریت شما تعلق ندارد.' }
  }

  const priceRaw = str(form, 'variantPrice')
  const price = priceRaw === '' ? null : num(form, 'variantPrice')
  let result: { ok: boolean; error?: string; placeId?: number }
  if (operation === 'variant.create') {
    result = await createMenuItemVariant(owned.itemId, {
      label: str(form, 'variantLabel'),
      price,
      available: true,
    }, access.actor)
  } else if (operation === 'variant.save' && variantId) {
    result = await updateMenuItemVariant(variantId, {
      label: str(form, 'variantLabel'),
      price,
      available: bool(form, 'variantAvailable'),
    }, access.actor)
  } else if (operation === 'variant.delete' && variantId) {
    result = await deleteMenuItemVariant(variantId, access.actor)
  } else if ((operation === 'variant.up' || operation === 'variant.down') && variantId) {
    result = await moveMenuItemVariant(variantId, operation.endsWith('up') ? 'up' : 'down', access.actor)
  } else {
    return { ok: false, error: 'عملیات سایز معتبر نیست.' }
  }
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  const message = operation === 'variant.create'
    ? 'سایز اضافه شد و قیمت شروع آیتم به‌روز شد.'
    : operation === 'variant.delete'
      ? 'سایز حذف شد.'
      : operation === 'variant.save'
        ? 'سایز و قیمت آن ذخیره شد.'
        : 'ترتیب سایزها تغییر کرد.'
  return { ok: true, message }
}

/** عملیات سازمان‌دهی منو؛ یک endpoint با allow-list صریح تا فرم دستکاری‌شده کاری نکند. */
async function menuOperationActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const operation = str(form, 'operation')
  const itemId = num(form, 'itemId')
  const sectionId = num(form, 'sectionId')
  let placeId = num(form, 'placeId')

  const db = getDb()
  if (itemId) {
    const [item] = await db
      .select({ placeId: menuItemTable.placeId, branchScope: menuSectionTable.branchScope })
      .from(menuItemTable)
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(eq(menuItemTable.id, itemId))
      .limit(1)
    if (!item) return { ok: false, error: 'این آیتم پیدا نشد.' }
    placeId = item.placeId
  }
  const access = await requirePlaceAccess(placeId)
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }
  if (itemId) {
    const [scope] = await db
      .select({ branchScope: menuSectionTable.branchScope })
      .from(menuItemTable)
      .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
      .where(eq(menuItemTable.id, itemId))
      .limit(1)
    if (!access.isAdmin && scope && scope.branchScope !== 'shared' && scope.branchScope !== 'branch') {
      return { ok: false, error: 'این آیتم به شعبهٔ دیگری تعلق دارد.' }
    }
  }
  if (sectionId && !(await canUseSection(access, sectionId))) {
    return { ok: false, error: 'این دسته به شعبهٔ قابل‌مدیریت شما تعلق ندارد.' }
  }

  let result: { ok: boolean; error?: string; changed?: number }
  switch (operation) {
    case 'section.scope': {
      if (!access.isAdmin || !sectionId) return { ok: false, error: 'اصلاح مالکیت دسته فقط برای مدیر سیستم مجاز است.' }
      const scope = str(form, 'branchScope')
      if (!['shared', 'branch', 'other_branch', 'unverified'].includes(scope)) return { ok: false, error: 'مالکیت دسته معتبر نیست.' }
      const [before] = await getDb().select({ branchScope: menuSectionTable.branchScope }).from(menuSectionTable).where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, access.placeId))).limit(1)
      if (!before) return { ok: false, error: 'دسته به این شعبه تعلق ندارد.' }
      await getDb().update(menuSectionTable).set({ branchScope: scope as 'shared' | 'branch' | 'other_branch' | 'unverified' }).where(and(eq(menuSectionTable.id, sectionId), eq(menuSectionTable.placeId, access.placeId)))
      await recordAudit(access.actor, 'menu_section.scope', 'place', access.placeId, { sectionId, ...before }, { sectionId, branchScope: scope })
      const { refreshPlaceDerived } = await import('@/core/places/manage')
      await refreshPlaceDerived(access.placeId)
      result = { ok: true }
      break
    }
    case 'section.rename':
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      result = await updateMenuSection(access.placeId, sectionId, str(form, 'name'), access.actor)
      break
    case 'section.artwork.library': {
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      const mediaId = await libraryCategoryArtworkMediaId(str(form, 'artworkId'))
      if (!mediaId) return { ok: false, error: 'تصویر انتخاب‌شده در کتابخانه پیدا نشد.' }
      result = await setMenuSectionArtwork(access.placeId, sectionId, mediaId, access.actor)
      break
    }
    case 'section.artwork.shared': {
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      const mediaId = await sharedCategoryArtworkMediaId(num(form, 'mediaId'))
      if (!mediaId) return { ok: false, error: 'این تصویر دیگر در کتابخانهٔ مشترک در دسترس نیست.' }
      result = await setMenuSectionArtwork(access.placeId, sectionId, mediaId, access.actor)
      break
    }
    case 'section.artwork.upload': {
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      const image = form.get('image')
      if (!(image instanceof File) || image.size === 0) return { ok: false, error: 'فایل تصویر دسته را انتخاب کنید.' }
      const stored = await storeUploadedImage(image)
      if (!stored.ok) return { ok: false, error: stored.error }
      result = await setMenuSectionArtwork(access.placeId, sectionId, stored.mediaId, access.actor)
      break
    }
    case 'section.artwork.remove':
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      result = await setMenuSectionArtwork(access.placeId, sectionId, null, access.actor)
      break
    case 'section.up':
    case 'section.down':
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      result = await moveMenuSection(access.placeId, sectionId, operation.endsWith('up') ? 'up' : 'down', access.actor)
      break
    case 'section.delete':
      if (!sectionId) return { ok: false, error: 'دسته مشخص نیست.' }
      result = await deleteEmptyMenuSection(access.placeId, sectionId, access.actor)
      break
    case 'item.up':
    case 'item.down':
      if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }
      result = await moveMenuItem(itemId, operation.endsWith('up') ? 'up' : 'down', access.actor)
      break
    case 'item.archive':
    case 'item.restore':
      if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }
      result = await setMenuItemArchived(itemId, operation.endsWith('archive'), access.actor)
      break
    case 'item.delete':
      if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }
      result = await deleteArchivedMenuItem(itemId, access.actor)
      break
    case 'item.duplicate':
      if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }
      result = await duplicateMenuItem(itemId, access.actor)
      break
    case 'bulk.available':
    case 'bulk.unavailable':
      result = await bulkSetAvailability(access.placeId, operation.endsWith('available') && !operation.endsWith('unavailable'), access.actor)
      break
    default:
      return { ok: false, error: 'عملیات منو معتبر نیست.' }
  }
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  const messages: Record<string, string> = {
    'section.rename': 'نام دسته ذخیره شد.',
    'section.artwork.library': 'تصویر کتابخانه به دسته متصل شد.',
    'section.artwork.shared': 'تصویر مشترک به دسته متصل شد.',
    'section.artwork.upload': 'تصویر اختصاصی دسته ذخیره شد.',
    'section.artwork.remove': 'تصویر اختصاصی حذف شد؛ تصویر هوشمند پیش‌فرض نمایش داده می‌شود.',
    'section.up': 'دسته بالاتر رفت.',
    'section.down': 'دسته پایین‌تر رفت.',
    'section.delete': 'دستهٔ خالی حذف شد.',
    'item.up': 'آیتم بالاتر رفت.',
    'item.down': 'آیتم پایین‌تر رفت.',
    'item.archive': 'آیتم آرشیو شد و از سایت پنهان شد.',
    'item.restore': 'آیتم بازیابی شد.',
    'item.delete': 'آیتم برای همیشه حذف شد.',
    'item.duplicate': 'یک کپی قابل‌ویرایش از آیتم ساخته شد.',
    'bulk.available': `${result.changed ?? 0} آیتم موجود شد.`,
    'bulk.unavailable': `${result.changed ?? 0} آیتم ناموجود شد.`,
  }
  return { ok: true, message: messages[operation] }
}

async function bulkPriceActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }
  const fresh = await placeConflict(access.placeId, str(form, 'revision'))
  if (!fresh.ok) return { ok: false, error: fresh.error }

  const percent = num(form, 'percent')
  if (percent === null) return { ok: false, error: 'درصد تغییر را وارد کنید.' }

  try {
  const plan = await makePricePlan(access.placeId, percent, parsePriceSelection(str(form, 'scope'), str(form, 'bulkSectionId'), str(form, 'itemIds')))
  await applyPricePlan(access.placeId, plan, str(form, 'fingerprint'), access.actor)

  await revalidateBoth(access.placeId)
  return {
    ok: true,
    message: `قیمت ${plan.itemCount.toLocaleString('fa-IR')} آیتم (${plan.variantCount.toLocaleString('fa-IR')} سایز) ${percent > 0 ? 'افزایش' : 'کاهش'} یافت؛ snapshot قابل بازگردانی در تاریخچه ثبت شد.`,
  }
  }catch(error){return {ok:false,error:publicActionError(error,'قیمت‌ها ذخیره نشدند؛ دوباره تلاش کنید.')}}
}

// ═══════════════════════════════════════════════════════════════════════
// پاسخ به نظر
// ═══════════════════════════════════════════════════════════════════════

async function replyReviewActionImpl(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const reviewId = num(form, 'reviewId')
  if (!reviewId) return { ok: false, error: 'نظر مشخص نیست.' }

  const db = getDb()
  const [review] = await db
    .select({ placeId: reviewTable.placeId })
    .from(reviewTable)
    .where(eq(reviewTable.id, reviewId))
    .limit(1)
  if (!review) return { ok: false, error: 'این نظر پیدا نشد.' }

  const access = await requirePlaceAccess(review.placeId)
  if (!access.ok) return { ok: false, error: access.error }

  const { ownerRepliesRequireApproval } = await getModerationPolicy()
  const result = await replyToReview(
    reviewId,
    str(form, 'text'),
    access.actor,
    ownerRepliesRequireApproval,
  )
  if (!result.ok) return { ok: false, error: result.error }

  await revalidateBoth(access.placeId)
  return { ok: true, message: ownerRepliesRequireApproval ? 'پاسخ ثبت شد و پس از بررسی منتشر می‌شود.' : 'پاسخ ثبت و منتشر شد.' }
}

export async function createClubOfferAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => createClubOfferActionImpl(previous, form))
}

export async function issueClubCodeAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => issueClubCodeActionImpl(previous, form))
}

export async function redeemClubCodeAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => redeemClubCodeActionImpl(previous, form))
}

export async function broadcastClubOfferAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => broadcastClubOfferActionImpl(previous, form))
}

export async function venueDiscountAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => venueDiscountActionImpl(previous, form))
}

export async function saveVenueUserAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => saveVenueUserActionImpl(previous, form))
}

export async function removeVenueUserAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => removeVenueUserActionImpl(previous, form))
}

export async function saveVenueInfoAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => saveVenueInfoActionImpl(previous, form))
}

export async function saveVenueHoursAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => saveVenueHoursActionImpl(previous, form))
}

export async function saveVenueAttributesAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => saveVenueAttributesActionImpl(previous, form))
}

export async function uploadVenueLogoAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => uploadVenueLogoActionImpl(previous, form))
}

export async function uploadVenuePhotosAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => uploadVenuePhotosActionImpl(previous, form))
}

export async function photoOperationAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => photoOperationActionImpl(previous, form))
}

export async function createMenuSectionAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => createMenuSectionActionImpl(previous, form))
}

export async function createMenuItemAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => createMenuItemActionImpl(previous, form))
}

export async function venueMenuImportAction(_previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(async () => {
    const access = await requirePlaceAccess(num(form, 'placeId'))
    if (!access.ok) return { ok: false, error: access.error }
    const input = { placeId: access.placeId, sectionId: num(form, 'sectionId') ?? 0, revision: str(form, 'revision'), text: String(form.get('text') ?? ''), delimiter: String(form.get('delimiter') ?? ',') }
    try {
      const secret = process.env.SESSION_SECRET ?? ''
      if (str(form, 'operation') === 'preview') {
        const menuImportPreview = await previewVenueMenuImport(input, access.actor, secret)
        return { ok: true, preserveDraft: true, message: 'پیش‌نمایش آماده است؛ هنوز آیتمی ثبت نشده.', menuImportPreview }
      }
      if (str(form, 'operation') !== 'apply' || form.get('confirmed') !== 'yes') return { ok: false, error: 'افزودن ردیف‌های انتخاب‌شده را تأیید کنید.' }
      const result = await applyVenueMenuImport(input, access.actor, str(form, 'token'), str(form, 'selected'), secret)
      const slug = await slugOf(access.placeId)
      afterDbCommit(() => {
        invalidateReferenceCache()
        if (slug) revalidatePath(paths.cafe(slug))
        for (const path of [paths.ownerPanel, paths.search, paths.home]) revalidatePath(path)
      })
      return { ok: true, menuImportAppliedRevision: Number(input.revision) + 1, message: `${result.count.toLocaleString('fa-IR')} آیتم جدید ثبت شد؛ آیتم‌ها و قیمت‌های قبلی تغییر نکردند.` }
    } catch (error) { return { ok: false, error: publicActionError(error, 'ورود منو انجام نشد؛ پیش‌نمایش را بررسی کنید.') } }
  })
}

export async function saveMenuItemAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => saveMenuItemActionImpl(previous, form))
}

export async function menuVariantAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => menuVariantActionImpl(previous, form))
}

export async function menuOperationAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => menuOperationActionImpl(previous, form))
}

export async function bulkPriceAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => bulkPriceActionImpl(previous, form))
}

export async function previewBulkPriceAction(_previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(async () => {
    const access = await requirePlaceAccess(num(form, 'placeId')); if (!access.ok) return { ok: false, error: access.error }
    const fresh = await placeConflict(access.placeId, str(form, 'revision')); if (!fresh.ok) return { ok: false, error: fresh.error }
    try {
      const plan = await makePricePlan(access.placeId, num(form, 'percent') ?? 0, parsePriceSelection(str(form, 'scope'), str(form, 'bulkSectionId'), str(form, 'itemIds')))
      return { ok: true, message: 'پیش‌نمایش آماده است؛ هنوز قیمتی تغییر نکرده.', preview: { ...plan, changes: plan.changes.slice(0, 12) } }
    } catch (error) { return { ok: false, error: publicActionError(error,'پیش‌نمایش آماده نشد.') } }
  })
}

export async function restoreBulkPriceAction(_previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(async () => {
    const access = await requirePlaceAccess(num(form, 'placeId')); if (!access.ok) return { ok: false, error: access.error }
    const fresh = await placeConflict(access.placeId, str(form, 'revision')); if (!fresh.ok) return { ok: false, error: fresh.error }
    try { await restorePriceChange(access.placeId, num(form, 'auditId') ?? 0, access.actor) }
    catch (error) { return { ok: false, error: publicActionError(error,'بازگردانی انجام نشد.') } }
    await revalidateBoth(access.placeId)
    return { ok: true, message: 'قیمت‌ها دقیقاً از snapshot قبلی بازگردانده شدند.' }
  })
}

export async function replyReviewAction(previous: VenueActionState, form: FormData): Promise<VenueActionState> {
  return runManagedWrite(() => replyReviewActionImpl(previous, form))
}
