import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

interface RuntimeEntry {
  nodeId: string
  sessionId: string
  term: Terminal
  fitAddon: FitAddon
  container: HTMLDivElement | null
  resizeObserver: ResizeObserver | null
  dataDisposable: { dispose(): void }
  resizeDisposable: { dispose(): void }
}

interface BindRuntimeOptions {
  nodeId: string
  sessionId: string
  container: HTMLDivElement
  onData: (sessionId: string, data: string) => void
  onResize: (sessionId: string, size: { cols: number; rows: number }) => void
}

function createTerminal(): { term: Terminal; fitAddon: FitAddon } {
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
  return { term, fitAddon }
}

export function useTerminalManager() {
  const runtimesRef = useRef<Map<string, RuntimeEntry>>(new Map())

  const disposeRuntime = useCallback((nodeId: string) => {
    const runtime = runtimesRef.current.get(nodeId)
    if (!runtime) return
    runtime.resizeObserver?.disconnect()
    runtime.dataDisposable.dispose()
    runtime.resizeDisposable.dispose()
    runtime.term.dispose()
    runtimesRef.current.delete(nodeId)
  }, [])

  const bindRuntime = useCallback(
    (options: BindRuntimeOptions) => {
      const existing = runtimesRef.current.get(options.nodeId)
      const needsRecreate = !existing || existing.sessionId !== options.sessionId || existing.container !== options.container

      if (needsRecreate && existing) {
        disposeRuntime(options.nodeId)
      }

      let runtime = runtimesRef.current.get(options.nodeId)
      if (!runtime) {
        const { term, fitAddon } = createTerminal()
        const dataDisposable = term.onData((data) => options.onData(options.sessionId, data))
        const resizeDisposable = term.onResize(({ cols, rows }) => options.onResize(options.sessionId, { cols, rows }))
        runtime = {
          nodeId: options.nodeId,
          sessionId: options.sessionId,
          term,
          fitAddon,
          container: null,
          resizeObserver: null,
          dataDisposable,
          resizeDisposable,
        }
        runtimesRef.current.set(options.nodeId, runtime)
      }

      if (runtime.container !== options.container) {
        runtime.resizeObserver?.disconnect()
        options.container.replaceChildren()
        runtime.term.open(options.container)
        runtime.container = options.container
        requestAnimationFrame(() => runtime?.fitAddon.fit())

        const resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => runtime?.fitAddon.fit())
        })
        resizeObserver.observe(options.container)
        runtime.resizeObserver = resizeObserver
      }

      return runtime
    },
    [disposeRuntime],
  )

  const write = useCallback((nodeId: string, data: string) => {
    runtimesRef.current.get(nodeId)?.term.write(data)
  }, [])

  const reset = useCallback((nodeId: string) => {
    runtimesRef.current.get(nodeId)?.term.reset()
  }, [])

  const focus = useCallback((nodeId: string) => {
    runtimesRef.current.get(nodeId)?.term.focus()
  }, [])

  const fit = useCallback((nodeId: string) => {
    runtimesRef.current.get(nodeId)?.fitAddon.fit()
  }, [])

  const getSize = useCallback((nodeId: string) => {
    const term = runtimesRef.current.get(nodeId)?.term
    return term ? { cols: term.cols, rows: term.rows } : { cols: 80, rows: 24 }
  }, [])

  const hasRuntime = useCallback((nodeId: string) => runtimesRef.current.has(nodeId), [])

  const syncRuntimes = useCallback(
    (activeNodeIds: Set<string>) => {
      for (const nodeId of runtimesRef.current.keys()) {
        if (!activeNodeIds.has(nodeId)) {
          disposeRuntime(nodeId)
        }
      }
    },
    [disposeRuntime],
  )

  useEffect(
    () => () => {
      for (const nodeId of Array.from(runtimesRef.current.keys())) {
        disposeRuntime(nodeId)
      }
    },
    [disposeRuntime],
  )

  return {
    bindRuntime,
    write,
    reset,
    focus,
    fit,
    getSize,
    hasRuntime,
    syncRuntimes,
    disposeRuntime,
  }
}
