import { useEffect, useRef } from 'react'

type Shortcuts = {
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
  onRerun?: () => void
  onToggleSettings?: () => void
  onEscape?: () => void
  onSelectRunByIndex?: (index: number) => void
  onSurfaceByIndex?: (index: number) => void
  onToggleCompare?: () => void
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true
  return target.isContentEditable
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  const latest = useRef(shortcuts)
  latest.current = shortcuts

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const handlers = latest.current

      if (event.key === 'Escape') {
        handlers.onEscape?.()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        handlers.onToggleSettings?.()
        return
      }

      if (isEditable(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        handlers.onNavigateNext?.()
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        handlers.onNavigatePrev?.()
        return
      }

      if (event.key === 'r') {
        event.preventDefault()
        handlers.onRerun?.()
        return
      }

      if (event.key === 'c') {
        event.preventDefault()
        handlers.onToggleCompare?.()
        return
      }

      if (event.shiftKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        const index = Number.parseInt(event.key, 10) - 1
        handlers.onSurfaceByIndex?.(index)
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        const index = Number.parseInt(event.key, 10) - 1
        handlers.onSelectRunByIndex?.(index)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
