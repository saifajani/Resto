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
