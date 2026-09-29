/**
 * Invite links. An invite is still a 6-character code, and the code on its own
 * still works on the Profile tab, because someone who already has the app
 * installed should stay in it rather than be sent to a browser tab with its
 * own separate sign-in. The link is for the person who does not have the app
 * yet: it opens /join/<code>, which carries the code through sign-up and
 * redeems it on the other side.
 */

export const INVITE_CODE_LENGTH = 6

/** Codes are generated from an alphabet with no I, O, 0 or 1 (see create_invite). */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH)
}

/** The code in a /join/ABC123 link, or null for any other path. */
export function inviteCodeFromPath(pathname: string): string | null {
  const match = /^\/join\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  let raw = match[1]
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // A malformed escape is not a code.
  }
  const code = normalizeInviteCode(raw)
  return code.length === INVITE_CODE_LENGTH ? code : null
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${code}`
}
