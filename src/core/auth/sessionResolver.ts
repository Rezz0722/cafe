import 'server-only'

import { readViewAsClaims } from './impersonation'
import { verifySessionToken } from './session'
import { findUserById, isAuthSessionActive, isUnregisteredPhoneAccount, revokeSession } from './userRepo'
import type { AppUser, SessionUser } from './types'

/** A signed session resolved against live account, role and revocation state. */
export interface Session {
  sessionId: string | null
  user: SessionUser | null
  /** Non-null during administrator view-as: all writes remain forbidden. */
  actor: SessionUser | null
}

const NO_SESSION: Session = { user: null, actor: null, sessionId: null }

function toSessionUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    ownedPlaceSlugs: user.ownedPlaceSlugs,
  }
}

/** Shared by the Next request wrapper and isolated signed-cookie integration tests. */
export async function resolveSessionTokens(sessionToken?: string, viewAsToken?: string): Promise<Session> {
  const payload = verifySessionToken(sessionToken)
  if (!payload) return NO_SESSION
  if (!(await isAuthSessionActive(payload.sessionId, payload.userId))) return NO_SESSION

  const account = await findUserById(payload.userId)
  if (!account || account.blocked) return NO_SESSION
  if (isUnregisteredPhoneAccount(account)) {
    await revokeSession(payload.sessionId, payload.userId)
    return NO_SESSION
  }

  const self = toSessionUser(account)
  const claims = readViewAsClaims(viewAsToken)
  if (!claims || self.role !== 'admin' || claims.actorId !== self.id) {
    return { user: self, actor: null, sessionId: payload.sessionId }
  }

  const target = await findUserById(claims.targetId)
  if (!target || target.blocked || target.role === 'admin') {
    return { user: self, actor: null, sessionId: payload.sessionId }
  }
  return { user: toSessionUser(target), actor: self, sessionId: payload.sessionId }
}
