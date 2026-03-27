import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export function useTerminal() {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const mountedContainerRef = useRef<HTMLDivElement | null>(null)
  const [mountVersion, setMountVersion] = useState(0)

  const createTerminal = useCallback(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#1d1b19',
        foreground: '#f4efe7',
        cursor: '#7e95ab',
        selectionBackground: '#556f8a4d',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    termRef.current = term
    fitAddonRef.current = fitAddon
    return term
  }, [])

  const disposeTerminal = useCallback(() => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    termRef.current?.dispose()
    termRef.current = null
    fitAddonRef.current = null
    mountedContainerRef.current = null
  }, [])

  const ensureTerminal = useCallback(() => {
    if (!termRef.current) {
      return createTerminal()
    }

    return termRef.current
  }, [createTerminal])

  const mount = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return

      const shouldRecreateTerminal = mountedContainerRef.current !== null && mountedContainerRef.current !== container
      if (shouldRecreateTerminal) {
        disposeTerminal()
      }

      const term = ensureTerminal()
      if (!term) return

      resizeObserverRef.current?.disconnect()
      container.replaceChildren()
      term.open(container)
      mountedContainerRef.current = container
      requestAnimationFrame(() => fitAddonRef.current?.fit())

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => fitAddonRef.current?.fit())
      })
      resizeObserver.observe(container)
      resizeObserverRef.current = resizeObserver
      setMountVersion((version) => version + 1)
    },
    [disposeTerminal, ensureTerminal],
  )

  const fit = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  const getSize = useCallback(() => {
    const term = termRef.current
    return term ? { cols: term.cols, rows: term.rows } : { cols: 80, rows: 24 }
  }, [])

  useEffect(
    () => () => {
      disposeTerminal()
    },
    [disposeTerminal],
  )

  return { termRef, mount, fit, getSize, mountVersion }
}
