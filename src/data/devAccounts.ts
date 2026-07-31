/**
 * Throwaway sign-in credentials for the development period.
 *
 * There is no backend: the OTP flow accepts any code and always produces a plain
 * customer session, so there was no way to reach the venue panel *as an owner*.
 * These two accounts fill that gap until real auth exists — `user` lands in the
 * customer profile, `admin` lands in the venue panel.
 *
 * Delete this file, `signInWithPassword` in `hooks/useAuth`, and the `login=1`
 * step of `components/auth/AuthScreen` when a server takes over.
 */
import type { Role } from '@/types'

export interface DevAccount {
  username: string
  /** Plain text on purpose — these are demo logins, not secrets. */
  password: string
  name: string
  role: Role
  /** Venue the owner manages; the panel reads it as its title. */
  venue?: string
}

export const DEV_ACCOUNTS: DevAccount[] = [
  {
    username: 'user',
    password: 'user1234',
    name: 'نگار احمدی',
    role: 'customer',
  },
  {
    username: 'admin',
    password: 'admin1234',
    name: 'رضا موسوی',
    role: 'owner',
    venue: 'کافه رُف',
  },
]

/** Case- and space-insensitive on the username, exact on the password. */
export function findDevAccount(username: string, password: string): DevAccount | undefined {
  const wanted = username.trim().toLowerCase()
  return DEV_ACCOUNTS.find(
    (account) => account.username === wanted && account.password === password,
  )
}
