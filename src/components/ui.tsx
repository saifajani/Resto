import { useEffect, type ReactNode } from 'react'

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'on' : 'off'} aria-hidden="true">★</span>
      ))}
    </span>
  )
}

export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={n <= value ? 'on' : 'off'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

/**
 * Marks a restaurant in the nearby list. Filled when you were there yourself,
 * an outline when it was someone else in your circle, and two linked rings
 * when nobody has been to this one but you have been to another branch of the
 * same chain, where the menu is probably the same.
 */
export type Been = 'me' | 'circle' | 'chain'

const LABELS: Record<Been, string> = {
  me: "You've been here",
  circle: 'Someone in your circle has been here',
  chain: "You've been to another location of this chain",
}

export function VisitedMark({ who }: { who: Been }) {
  const label = LABELS[who]
  return (
    <svg className={`visited-mark ${who}`} viewBox="0 0 16 16" width="15" height="15" role="img" aria-label={label}>
      <title>{label}</title>
      {who === 'chain' ? (
        <>
          <circle cx="5.75" cy="8" r="4.25" />
          <circle cx="10.25" cy="8" r="4.25" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.75" />
          <path d="M5.1 8.4 7 10.3 10.9 6.2" />
        </>
      )}
    </svg>
  )
}

export function ReorderBadge({ yes }: { yes: boolean }) {
  return (
    <span className={yes ? 'badge yes' : 'badge no'} title={yes ? 'Would order again' : 'Would not order again'}>
      {yes ? 'Again' : 'Skip'}
    </span>
  )
}

/**
 * A panel that slides up over the page: nearly full height on phones, a
 * centred dialog on wider screens. The primary action goes in `footer`, pinned
 * to the bottom like the Save button on full pages.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorNote({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null
  return (
    <div className="error-note" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="link" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />
}

/** A square dish photo thumbnail. Tapping it opens the photo full size. */
export function DishPhoto({ url, name, size = 'small', onOpen }: { url: string | null | undefined; name: string; size?: 'small' | 'large'; onOpen?: () => void }) {
  if (!url) return null
  const img = <img src={url} alt={`Photo of ${name}`} loading="lazy" />
  if (!onOpen) return <span className={`dish-photo ${size}`}>{img}</span>
  return (
    <button type="button" className={`dish-photo ${size}`} onClick={onOpen} aria-label={`View photo of ${name}`}>
      {img}
    </button>
  )
}

export function PhotoViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <Sheet title={name} onClose={onClose}>
      <img className="photo-full" src={url} alt={`Photo of ${name}`} />
    </Sheet>
  )
}
