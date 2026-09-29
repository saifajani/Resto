import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sheet } from './ui'
import { detectGuide, dismissInstallNudge, isStandalone, readNudge, type InstallGuide } from '../lib/install'

/** The Share glyph from the Safari toolbar: a box with an arrow coming out of it. */
function ShareGlyph({ className = 'inline-glyph' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

/** The glyph iOS shows beside "Add to Home Screen". */
function AddGlyph({ className = 'inline-glyph' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}

/**
 * The three steps, played out in a small phone: tap Share, tap Add to Home
 * Screen, and there it is on the Home Screen. Drawn rather than recorded, so
 * it weighs nothing, follows the light and dark palette, and stays true when
 * the icon changes. It is decorative: the numbered steps underneath say the
 * same thing in words, and Reduce Motion hides the phone and leaves them.
 */
function HomeScreenAnimation() {
  return (
    <div className="ath-anim" aria-hidden="true">
      <div className="ath-phone">
        <div className="ath-screen">
          <div className="ath-page">
            <img className="ath-page-logo" src="/icon.svg" alt="" />
            <div className="ath-page-title">Resto</div>
            <span className="ath-line" />
            <span className="ath-line short" />
          </div>

          <div className="ath-home">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="ath-home-icon" />
            ))}
            <span className="ath-home-icon ath-home-icon-new">
              <img src="/icon.svg" alt="" />
              <span className="ath-home-label">Resto</span>
            </span>
            <span className="ath-home-icon" />
          </div>

          <div className="ath-sheet">
            <span className="ath-sheet-grabber" />
            <span className="ath-sheet-row">Copy</span>
            <span className="ath-sheet-row ath-sheet-row-add">
              Add to Home Screen
              <AddGlyph className="ath-row-glyph" />
            </span>
            <span className="ath-sheet-row">Add to Favourites</span>
          </div>

          <div className="ath-bar">
            <span className="ath-bar-arrow">‹</span>
            <span className="ath-bar-arrow">›</span>
            <span className="ath-bar-share">
              <ShareGlyph className="" />
            </span>
            <span className="ath-bar-arrow">▫︎</span>
          </div>

          <span className="ath-tap ath-tap-share" />
          <span className="ath-tap ath-tap-row" />
        </div>
      </div>
    </div>
  )
}

function IosSteps() {
  return (
    <>
      <HomeScreenAnimation />
      <ol className="ath-steps">
        <li>
          Tap the Share button <ShareGlyph /> at the bottom of Safari. On an iPad it is at the top.
        </li>
        <li>
          Scroll down that list and tap <strong>Add to Home Screen</strong> <AddGlyph />.
        </li>
        <li>
          Tap <strong>Add</strong> at the top right. Resto is now on your Home Screen, like any other app.
        </li>
      </ol>
      <p className="fine-print">
        Open it from there from now on. Signing in inside the installed app is what keeps you signed in.
      </p>
    </>
  )
}

function GenericSteps() {
  return (
    <>
      <ol className="ath-steps">
        <li>
          On a phone, open your browser's menu and choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>.
        </li>
        <li>
          On a computer, look for the install icon at the right hand end of the address bar.
        </li>
        <li>Confirm the name, and Resto opens on its own from then on.</li>
      </ol>
      <p className="fine-print">
        On an iPhone this works best in Safari, where it is under the Share button.
      </p>
    </>
  )
}

/** The instructions themselves. Also reachable any time from the Profile tab. */
export function AddToHomeScreenSheet({ onClose, guide }: { onClose: () => void; guide?: InstallGuide }) {
  const resolved = useMemo(
    () => guide ?? detectGuide(navigator.userAgent, navigator.maxTouchPoints),
    [guide],
  )
  return (
    <Sheet
      title="Keep Resto one tap away"
      onClose={onClose}
      footer={
        <>
          <button className="primary wide" onClick={onClose}>Got it</button>
          <p className="hint">These steps stay on the Profile tab if you want them later.</p>
        </>
      }
    >
      <p className="muted">
        Add Resto to your Home Screen and it opens full screen with no browser bars, starts faster, and stays signed in.
      </p>
      {resolved === 'ios-safari' ? <IosSteps /> : <GenericSteps />}
    </Sheet>
  )
}

/**
 * Shows the instructions once, to someone who has just registered. It waits
 * for a resting point: an invite link lands on /join/<code>, and interrupting
 * that with a modal would bury the thing they actually came to do.
 */
export function InstallNudge() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) return
    if (pathname.startsWith('/join/')) return
    if (readNudge() !== 'armed') return
    if (isStandalone()) {
      dismissInstallNudge()
      return
    }
    setOpen(true)
    // Marked seen as it opens, not as it closes: swiping the app away mid-read
    // still counts as having been shown, and the Profile tab has it after that.
    dismissInstallNudge()
  }, [pathname, open])

  if (!open) return null
  return <AddToHomeScreenSheet onClose={() => setOpen(false)} />
}
