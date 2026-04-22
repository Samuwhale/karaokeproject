import { useEffect, useRef } from 'react'

// Captures the element that was focused when a dialog opens, and restores
// focus to it when the dialog closes. Call unconditionally; pass `open`.
export function useDialogFocus(open: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
    return () => {
      const el = triggerRef.current
      triggerRef.current = null
      if (el && el.isConnected && typeof el.focus === 'function') {
        el.focus()
      }
    }
  }, [open])
}
