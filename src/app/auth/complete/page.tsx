import { redirect } from 'next/navigation'
import { AuthCompletion } from '@/components/auth/AuthCompletion'
import { getCurrentUser } from '@/core/auth/currentUser'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { paths } from '@/routes'

export const metadata = { title: 'تکمیل ورود', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CompleteAuth({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const params = await searchParams
  const destination = safeAuthRedirect(params.redirect)
  if (!await getCurrentUser()) redirect(withAuthRedirect(paths.auth, destination))
  return <AuthCompletion destination={destination} />
}
