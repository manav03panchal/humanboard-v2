/**
 * Terminal Manager — owns xterm instances outside React.
 * DOM nodes can be moved between parents without unmounting.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { spawn } from 'tauri-pty'
import { useThemeStore } from './theme'

interface ManagedTerminal {
  term: Terminal
  fitAddon: FitAddon
  pty: ReturnType<typeof spawn>
  container: HTMLDivElement
  onTitleChange?: (title: string) => void
}

const terminals = new Map<number, ManagedTerminal>()

export function createTerminal(id: number, cwd?: string): ManagedTerminal {
  if (terminals.has(id)) return terminals.get(id)!

  const bg = useThemeStore.getState().getEditorBackground()
  const fg = useThemeStore.getState().getEditorForeground()

  const container = document.createElement('div')
  container.className = 'terminal-container'
  container.style.cssText = 'width:100%;height:100%;overflow:hidden;cursor:text'
  container.style.backgroundColor = bg

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: '"JetBrains Mono NF", "JetBrains Mono", Menlo, Monaco, monospace',
    fontSize: 14,
    lineHeight: 1.0,
    scrollback: 5000,
    drawBoldTextInBrightColors: false,
    theme: {
      background: bg,
      foreground: fg,
      cursor: fg,
      cursorAccent: bg,
      selectionBackground: 'rgba(255, 255, 255, 0.15)',
      black: '#1a1a1a',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
    allowProposedApi: true,
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  // Wait for font then open
  document.fonts.load('14px "JetBrains Mono NF"').catch(() => {}).then(() => {
    if (!container.isConnected) {
      // Not in DOM yet — defer open until mounted
      const observer = new MutationObserver(() => {
        if (container.isConnected) {
          observer.disconnect()
          openTerminal(managed)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    } else {
      openTerminal(managed)
    }
  })

  const pty = spawn('/bin/zsh', [], {
    cols: 80,
    rows: 24,
    cwd: cwd || undefined,
    name: 'xterm-256color',
  })

  pty.onData((data: any) => {
    try {
      if (typeof data === 'string') term.write(data)
      else if (data instanceof Uint8Array) term.write(data)
      else if (Array.isArray(data)) term.write(new Uint8Array(data))
      else if (data && typeof data === 'object') term.write(new Uint8Array(Object.values(data) as number[]))
      else term.write(String(data))
    } catch {}
  })

  term.onData((data: string) => {
    try { pty.write(data) } catch {}
  })

  const managed: ManagedTerminal = { term, fitAddon, pty, container }
  terminals.set(id, managed)

  // Click to focus
  container.addEventListener('click', () => term.focus())

  return managed
}

function openTerminal(managed: ManagedTerminal) {
  const { term, fitAddon, container } = managed

  term.open(container)

  try {
    term.loadAddon(new LigaturesAddon({ fontFeatureSettings: '"calt" on, "liga" on' }))
  } catch {}

  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    term.loadAddon(webgl)
  } catch {}

  try { fitAddon.fit() } catch {}

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit()
      managed.pty.resize(term.cols, term.rows)
    } catch {}
  })
  resizeObserver.observe(container)

  // Title changes
  term.onTitleChange((title) => {
    managed.onTitleChange?.(title)
  })

  container.querySelectorAll('.xterm, .xterm-viewport').forEach((el) => {
    (el as HTMLElement).style.backgroundColor = managed.term.options.theme?.background ?? '#000'
  })

  term.focus()
}

export function getTerminal(id: number): ManagedTerminal | undefined {
  return terminals.get(id)
}

export function mountTerminal(id: number, parent: HTMLElement) {
  const managed = terminals.get(id)
  if (!managed) return

  // Move the container DOM node — no unmount, no PTY reset
  if (managed.container.parentElement !== parent) {
    parent.appendChild(managed.container)
  }

  // Refit after move
  requestAnimationFrame(() => {
    try {
      managed.fitAddon.fit()
      managed.pty.resize(managed.term.cols, managed.term.rows)
    } catch {}
  })
}

export function focusTerminal(id: number) {
  terminals.get(id)?.term.focus()
}

export function destroyTerminal(id: number) {
  const managed = terminals.get(id)
  if (!managed) return
  try { managed.pty.kill() } catch {}
  managed.term.dispose()
  managed.container.remove()
  terminals.delete(id)
}

export function updateTerminalTheme() {
  const bg = useThemeStore.getState().getEditorBackground()
  const fg = useThemeStore.getState().getEditorForeground()
  for (const [, managed] of terminals) {
    managed.term.options.theme = {
      ...managed.term.options.theme,
      background: bg,
      foreground: fg,
      cursor: fg,
      cursorAccent: bg,
    }
    managed.container.style.backgroundColor = bg
    managed.container.querySelectorAll('.xterm, .xterm-viewport').forEach((el) => {
      (el as HTMLElement).style.backgroundColor = bg
    })
  }
}

export function destroyAll() {
  for (const [id] of terminals) destroyTerminal(id)
}
