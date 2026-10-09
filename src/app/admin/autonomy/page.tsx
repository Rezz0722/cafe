import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { authUrl, paths } from '@/routes'
import { AutonomyConsole } from '@/components/admin/AutonomyConsole'

export const metadata: Metadata = { title: 'کنسول زندهٔ ناظر توسعه', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AutonomyPage() {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl('/admin/autonomy'))
  if (actor || user.role !== 'admin') redirect(paths.profile)
  const account = await findUserById(user.id)
  if (!account || account.blocked) redirect(paths.profile)
  if (account.mustChangePassword) redirect(paths.changePassword)
  return <AutonomyConsole />
}
