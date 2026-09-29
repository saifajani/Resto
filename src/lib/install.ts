/**
 * The "Add to Home Screen" nudge, shown once to someone who has just
 * registered and is still in a browser tab.
 *
 * The app is built to live on the Home Screen: installed, it opens full screen,
 * starts faster, and keeps its own sign-in, which is the whole reason sign-in
 * uses emailed codes rather than links (a link opens Safari, whose storage the
 * installed app cannot see). Someone who never installs it gets a worse app
 * and never finds out why, so we say so once, at the one moment they are
 * paying attention: right after they sign up.
 *
 * It is armed at registration rather than shown there and then, because
 * someone arriving on an invite link has a code to redeem first. The nudge
 * waits until that is finished. See `armInstallNudge` and `InstallNudge`.
 */

export const NUDGE_KEY = 'resto:add-to-home'

/** 'armed' means "show it at the next resting point"; 'done' means never again. */
export type NudgeState = 'armed' | 'done'

/** Which set of instructions to give. iOS Safari is the one that gets pictures. */
export type InstallGuide = 'ios-safari' | 'generic'

/**
 * iPadOS reports itself as a Mac, so a touch count is the only thing that
 * tells the two apart. Chrome and Firefox on iOS are sent to the generic
 * instructions: they are still WebKit, but their share sheet is their own.
 */
export function detectGuide(userAgent: string, maxTouchPoints: number): InstallGuide {
  const iphone = /iPhone|iPad|iPod/.test(userAgent)
  const ipadPretendingToBeAMac = /Macintosh/.test(userAgent) && maxTouchPoints > 1
  if (!iphone && !ipadPretendingToBeAMac) return 'generic'
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(userAgent)) return 'generic'
  return 'ios-safari'
}

/** True when this is already the installed app rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

export function readNudge(): NudgeState | null {
  try {
    const stored = localStorage.getItem(NUDGE_KEY)
    return stored === 'armed' || stored === 'done' ? stored : null
  } catch {
    // Private browsing can refuse localStorage. Without it we cannot tell
    // whether they have seen the nudge, so we never show it.
    return null
  }
}

function write(state: NudgeState) {
  try {
    localStorage.setItem(NUDGE_KEY, state)
  } catch {
    // Not fatal: the nudge just doesn't survive this session.
  }
}

/**
 * Called the moment someone registers. It never re-arms for a person who has
 * already been shown the nudge, and never fires inside the installed app,
 * where there is nothing to add.
 */
export function armInstallNudge() {
  if (isStandalone()) return
  if (readNudge() === 'done') return
  write('armed')
}

/** One chance only. The Profile tab keeps the instructions reachable after this. */
export function dismissInstallNudge() {
  write('done')
}
