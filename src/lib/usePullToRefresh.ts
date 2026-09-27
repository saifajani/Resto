import { useEffect, useRef, useState } from 'react'

/** Finger travel, in px, that counts as asking for a refresh. */
const TRIGGER = 70
/** How far the indicator travels, however hard you pull. */
const MAX = 96
/** Finger travel to indicator travel, so the pull feels weighted. */
const RESISTANCE = 0.5

/**
 * Pull down at the top of the page to reload, which is what a phone app is
 * expected to do. An installed web app has no browser chrome to pull on, and
 * iOS would otherwise just rubber-band the page, so the gesture is ours: the
 * touchmove is cancelled while we own it, and released the moment the finger
 * goes up or the page is scrolled away from the top.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  /** The handlers are bound once, so the live values have to be refs. */
  const startY = useRef<number | null>(null)
  const distance = useRef(0)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const atTop = () => (document.scrollingElement?.scrollTop ?? 0) <= 0
    const reset = () => {
      startY.current = null
      distance.current = 0
      setPull(0)
    }

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || !atTop()) return
      startY.current = e.touches[0].clientY
      distance.current = 0
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || busy.current) return
      const dy = e.touches[0].clientY - startY.current
      // Scrolling up, or no longer at the top: hand the gesture back.
      if (dy <= 0 || !atTop()) {
        reset()
        return
      }
      if (e.cancelable) e.preventDefault()
      distance.current = Math.min(dy * RESISTANCE, MAX)
      setPull(distance.current)
    }

    const onEnd = () => {
      if (startY.current === null) return
      const pulledEnough = distance.current >= TRIGGER * RESISTANCE
      startY.current = null
      if (!pulledEnough) {
        reset()
        return
      }
      busy.current = true
      setRefreshing(true)
      setPull(TRIGGER * RESISTANCE)
      void Promise.resolve(refresh.current()).finally(() => {
        busy.current = false
        setRefreshing(false)
        reset()
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', reset)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [])

  return { pull, refreshing, ready: pull >= TRIGGER * RESISTANCE }
}
