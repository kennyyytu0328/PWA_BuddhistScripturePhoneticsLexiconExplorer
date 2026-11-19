import { useCallback, useEffect, useRef, type ButtonHTMLAttributes } from 'react'

export const LONG_PRESS_MS = 600

interface Options {
  enabled: boolean
  onLongPress: () => void
  onClick: () => void
}

type Handlers = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onPointerDown' | 'onPointerUp' | 'onPointerLeave' | 'onPointerCancel' | 'onClick' | 'onContextMenu'
>

/**
 * Press-and-hold on a button (REQ-RDR-042). While `enabled`, holding LONG_PRESS_MS calls `onLongPress` and the
 * click that follows the release is swallowed; leaving the button or a pointer cancel aborts the hold.
 * Not enabled: the hold is ignored and the release is an ordinary click. The hold is a timer, not event timestamps.
 */
export function useLongPress({ enabled, onLongPress, onClick }: Options): Handlers {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fired = useRef(false)
  const latest = useRef({ onLongPress, onClick })
  useEffect(() => {
    latest.current = { onLongPress, onClick }
  }, [onLongPress, onClick])

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
  }, [])
  useEffect(() => cancel, [cancel])
  // The follow-along ended mid-hold (e.g. its last character): the hold no longer ends anything.
  useEffect(() => {
    if (!enabled) cancel()
  }, [enabled, cancel])

  const onPointerDown = useCallback(() => {
    cancel()
    fired.current = false
    if (!enabled) return
    timer.current = setTimeout(() => {
      timer.current = undefined
      fired.current = true
      latest.current.onLongPress()
    }, LONG_PRESS_MS)
  }, [enabled, cancel])

  const handleClick = useCallback(() => {
    if (fired.current) {
      fired.current = false
      return
    }
    latest.current.onClick()
  }, [])

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerLeave: cancel, // touch fires pointerleave after pointerup, before the click: `fired` must survive it
    onPointerCancel: cancel,
    onClick: handleClick,
    onContextMenu: (event) => event.preventDefault(),
  }
}
