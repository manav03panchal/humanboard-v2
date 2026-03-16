# Humanboard v2 — Design Spec

## Overview

Humanboard is a spatial IDE — an infinite canvas workspace where files open as draggable, resizable nodes instead of tabs. It supports vaults (Humanboard-native workspaces) and opening any existing codebase. Think VS Code meets Obsidian, but the tab bar is replaced by an infinite canvas with spatial memory.

**Reference app**: [Collaborator](https://github.com/nicholasgriffintn/collaborator) — an Electron-based code editor with file tree sidebar + single editor pane. Humanboard takes this concept further: multiple simultaneous editor nodes on an infinite canvas, support for any content type (terminals, PDFs, images, browser pages, notes), vaults, and native performance via Tauri instead of Electron.

**Stack**: Tauri v2 (Rust backend) + React + TypeScript + tldraw (canvas) + CodeMirror 6 (code editors) + xterm.js (terminals) + lucide-react (icons)

## Architecture

### Core Layout

```
+-------------------------------------------------------+
| [traffic lights]              (Overlay titlebar)       |
+-------------------------------------------------------+
| [vault ▾] |                                            |
| [search ] |      tldraw Canvas (full screen)           |
| --------- |                                            |
| File      | [CodeShape]  [TerminalShape]  [PdfShape]   |
| Tree      |                                            |
| (sorted   |      [ImageShape]   [MarkdownShape]        |
|  by date) |                                            |
+-------------------------------------------------------+
|              status bar (optional)                     |
+-------------------------------------------------------+
```

- **tldraw** is the entire main area. Default UI hidden (`hideUi`).
- **File tree sidebar** is a React component overlaid on the left, toggle-able.
- **Vault dropdown** at top of sidebar — switch between open vaults or open a new one.
- **Search/filter** bar below vault dropdown.
- **File list** sorted by last modified date (like Collaborator), with option to sort alphabetically.
- **Every node on the canvas** is a custom tldraw shape.
- **Window**: Overlay titlebar, hidden title, macOS traffic lights only. OLED black theme.

### Custom Shape Types

Each file type or special node is a custom `ShapeUtil` extending `BaseBoxShapeUtil`. All shapes render inside `HTMLContainer` with interactive React content.

| Shape | Renderer | File Extensions | Notes |
|-------|----------|----------------|-------|
| `CodeShape` | CodeMirror 6 (`@uiwjs/react-codemirror`) | `.ts`, `.js`, `.tsx`, `.jsx`, `.rs`, `.py`, `.css`, `.html`, `.json`, `.md` (code mode) | Syntax highlighting, editable, save to disk |
| `TerminalShape` | xterm.js (`@xterm/xterm`) + FitAddon | N/A (not file-based) | Connects to Rust backend PTY via Tauri commands |
| `PdfShape` | pdf.js / `<iframe>` | `.pdf` | Read-only viewer |
| `ImageShape` | `<img>` | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` | Read-only viewer |
| `MarkdownShape` | Markdown renderer (view mode) / CodeMirror (edit mode) | `.md` | Toggle between rendered and raw |
| `BrowserShape` | Sandboxed `<iframe>` | N/A (URL-based) | Embedded web page, Phase 3 |
| `NoteShape` | Rich text / contenteditable | N/A | Freeform sticky notes on canvas |

### Shape Structure (Common Pattern)

Every shape follows tldraw's `ShapeUtil` pattern. **File content is NOT stored in shape props** — only the `filePath` is stored. Content lives in a side store (`FileStore`) outside tldraw to keep the canvas snapshot lean and prevent tldraw from diffing large strings on every keystroke.

```typescript
class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
  static override type = 'code-shape'

  getDefaultProps() {
    return { w: 600, h: 400, filePath: '', language: 'typescript' }
  }

  component(shape: CodeShape) {
    // Content loaded from FileStore, not shape props
    const { content, isDirty } = useFileStore(shape.props.filePath)
    return (
      <HTMLContainer>
        <NodeTitleBar filePath={shape.props.filePath} isDirty={isDirty} shapeId={shape.id} />
        <CodeMirrorEditor content={content} language={shape.props.language} />
      </HTMLContainer>
    )
  }

  indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
```

Each shape's `component()` renders:
1. A **title bar** — filename/label, close button (`X` icon from lucide-react), unsaved indicator
2. The **content area** — the actual editor/viewer/terminal
3. Interactive elements use `pointer-events: all` and `stopPropagation()` to prevent tldraw from capturing clicks meant for the editor

### Node Title Bar (shared component)

All canvas nodes share a common title bar component (inspired by Collaborator's editor header):

```
+--[icon]--src/components/App.tsx-----[unsaved dot]--[copy]--[settings]--[X]--+
|                                                                              |
|                          (content area)                                      |
|                                                                              |
+------------------------------------------------------------------------------+
```

- Icon: lucide-react icon based on file type (`FileCode`, `Terminal`, `FileText`, `Image`, `Globe`)
- **Full relative file path** as breadcrumb (e.g. `src/components/App.tsx`), not just filename
- Unsaved indicator (dot) when content differs from disk
- Action buttons: copy content (`Copy`), node settings/options (`Settings`), close (`X`)
- Title bar area is draggable (does not stop propagation — lets tldraw handle drag)
- Subtle background differentiation from content area (slightly lighter/darker than OLED black)

## State Management

Application state outside tldraw is managed via **Zustand** stores:

### FileStore
- `files: Map<filePath, { content: string, diskContent: string, isDirty: boolean }>`
- `openFile(path)` — reads from disk, adds to store
- `updateContent(path, content)` — updates in-memory, sets dirty
- `saveFile(path)` — writes to disk via Tauri, clears dirty
- `closeFile(path)` — removes from store

### VaultStore
- `vaultPath: string | null` — currently open vault/codebase root
- `recentVaults: string[]` — recent vault paths for landing screen + vault dropdown
- `sidebarOpen: boolean`
- `sidebarSort: 'date' | 'alpha'` — file list sort mode (default: 'date')
- `fileTree: TreeNode[]` — cached directory structure with metadata (name, path, isDir, modifiedAt)

### PtyStore (Phase 2)
- `sessions: Map<ptyId, { shapeId: string, shell: string }>`
- `spawn(shell)` / `kill(ptyId)`

This keeps the tldraw store lean (only shape positions, sizes, and file paths). Canvas snapshots stay small regardless of how many/large files are open.

## Vault & Codebase System

### Vault Structure

A vault is any directory with a `.humanboard/` config folder:

```
my-vault/
  .humanboard/
    canvas.json        # tldraw snapshot (shapes, positions, camera)
    config.json        # vault settings (theme, preferences)
  ... (user files)
```

### Opening a Codebase

"Open Codebase" points at any existing directory. Humanboard creates `.humanboard/` inside it and **automatically appends `.humanboard/` to the project's `.gitignore`** (if a `.gitignore` exists; creates one if in a git repo). The file tree shows the directory contents. Clicking a file opens it as a canvas node.

### Canvas Persistence

- Canvas state saved via tldraw's `getSnapshot(editor.store)` → writes to `.humanboard/canvas.json`
- Snapshot format includes a `humanboardVersion` field for migration support:
  ```json
  { "humanboardVersion": 1, "document": { ... }, "session": { ... } }
  ```
- Loaded on startup via `loadSnapshot(editor.store, saved)` or `<Tldraw snapshot={saved} />`
- Auto-save on changes (debounced, ~2 seconds)
- Session state (camera position, selection) persisted so you return to where you left off
- On load, if `humanboardVersion` is older, run migrations before loading

### File Operations

- **Open**: Click file in tree → read via Tauri → add to FileStore → `editor.createShape({ type: 'code-shape', props: { filePath, language } })`
- **Save**: Cmd+S → FileStore.saveFile(path) → Tauri writes to disk
- **Close**: Click X on node → `editor.deleteShape(shapeId)` → FileStore.closeFile(path)
- **External changes**: Tauri `fs` watcher detects changes → updates FileStore → shape re-renders
- **Dirty state**: Tracked in FileStore by comparing `content` vs `diskContent`
- **Max file size**: Files > 5MB are rejected with a toast notification ("File too large to open as editor")
- **Binary files**: Detected via null byte check, rejected with toast ("Binary files are not supported")

### File Path Security

All file paths read from `canvas.json` are validated:
- Must be relative to the vault root (no `../` traversal)
- Resolved and checked against vault boundary before any read/write
- Absolute paths in `canvas.json` are rejected

## File Tree Sidebar

A React component overlaid on the canvas (not a tldraw shape). Design inspired by Collaborator's sidebar but enhanced:

### Structure (top to bottom)

1. **Vault dropdown** — shows current vault path (e.g. `/Users/me/Desktop/Projects/humanexplain`), click to switch vaults or open a new folder
2. **Search/filter bar** — filter files by name, instantly narrows the tree
3. **Sort toggle** — sort by last modified date (default, like Collaborator) or alphabetically. Show date next to each file (e.g. `01 Mar`)
4. **File tree** — recursive directory listing with expand/collapse

### Behavior

- Toggle with Cmd+B
- Icons from lucide-react (`Folder`, `FolderOpen`, `FileCode`, `FileText`, `Image`, `File`)
- Click file → opens as appropriate shape on canvas (or focuses/pans to it if already open)
- Right-click context menu: New File, New Folder, Rename, Delete
- Drag file from sidebar onto canvas to position it precisely
- Files grouped by date headers when sorted by date (e.g. "MON, MAR 2", "SUN, MAR 1")
- Flat file list within each date group (not deeply nested tree) when in date sort mode
- Standard tree with folders when in alphabetical sort mode

### Implementation

- Tauri custom commands to read directory contents (scoped to vault root)
- Recursive directory listing with sensible defaults: skip `node_modules`, `.git`, `target`, `dist`, `.humanboard`
- File watcher for live updates when files change externally
- File metadata (modified date) fetched alongside directory listing

## Terminal Integration (Phase 2)

### Architecture

```
[xterm.js in TerminalShape] <--Tauri IPC--> [Rust PTY backend]
```

- **Frontend**: xterm.js Terminal + FitAddon inside `TerminalShape`
- **Backend**: Rust spawns a PTY process (via `portable-pty` crate)
- **Communication**: Tauri commands for `pty_spawn`, `pty_write`, `pty_resize`, and events for `pty_data`
- Each terminal shape has its own PTY session
- Default shell: `$SHELL` on macOS/Linux, `powershell.exe` on Windows

### Tauri Commands (Rust)

```rust
#[tauri::command]
fn pty_spawn(shell: String) -> Result<u32, String>  // returns pty_id

#[tauri::command]
fn pty_write(pty_id: u32, data: String) -> Result<(), String>

#[tauri::command]
fn pty_resize(pty_id: u32, cols: u16, rows: u16) -> Result<(), String>

#[tauri::command]
fn pty_kill(pty_id: u32) -> Result<(), String>
```

PTY output emitted as Tauri events: `pty_data_{id}` → frontend listens and writes to xterm.js.

## BrowserShape Security (Phase 3)

BrowserShape uses a **sandboxed `<iframe>`** (not Tauri's webview):
- `sandbox="allow-scripts allow-same-origin"` — no `allow-top-navigation`, no `allow-popups`
- No access to Tauri IPC, filesystem, or local network
- URL allowlist: only `https://` URLs permitted (no `file://`, no `tauri://`)
- Navigation within the iframe is restricted — cannot break out of sandbox

## Code Editor (CodeMirror 6)

### Why CodeMirror 6 over Monaco

- ~300KB vs ~2.4MB bundle
- Independent per-instance state (no global config conflicts)
- Designed for many simultaneous instances
- Fully modular and tree-shakable

### Configuration

```typescript
import CodeMirror from '@uiwjs/react-codemirror'
import { EditorView } from '@codemirror/view'

const theme = EditorView.theme({
  "&": { fontFamily: "JetBrains Mono, monospace", fontSize: "13px", background: "#000" },
  ".cm-content": { caretColor: "#fff" },
  ".cm-gutters": { background: "#000", border: "none", color: "#555" },
  ".cm-activeLine": { background: "rgba(255,255,255,0.05)" },
}, { dark: true })
```

### Performance Strategy

- Only mount CodeMirror for shapes visible in viewport (tldraw handles viewport culling)
- Shapes off-screen are not rendered (tldraw's default behavior)
- Each CodeMirror instance is independent — no shared state issues
- File content stored in Zustand FileStore, not tldraw shape props

### Language Detection

Map file extensions to CodeMirror language packages:
- `.ts/.tsx` → `@codemirror/lang-javascript` (with TypeScript flag)
- `.js/.jsx` → `@codemirror/lang-javascript`
- `.rs` → `@codemirror/lang-rust`
- `.py` → `@codemirror/lang-python`
- `.css` → `@codemirror/lang-css`
- `.html` → `@codemirror/lang-html`
- `.json` → `@codemirror/lang-json`
- `.md` → `@codemirror/lang-markdown`
- Other extensions → plain text (no language support)

## Icons (lucide-react)

All icons from `lucide-react` (the icon set used by shadcn/ui). Tree-shakable, each icon is a React component rendering inline SVG.

```tsx
import { FileCode, Terminal, FolderOpen, X, File, Image, Globe } from 'lucide-react'

<FileCode size={16} strokeWidth={1.5} />
```

Usage:
- File tree: `Folder`, `FolderOpen`, `FileCode`, `FileText`, `Image`, `File`
- Node title bars: type-specific icon + `X` for close
- Toolbar/controls: `Plus`, `Terminal`, `Globe`, `StickyNote`

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd+B` | Toggle file tree sidebar | Global |
| `Cmd+S` | Save current file | When a CodeShape is focused |
| `Cmd+W` | Close focused shape | When any shape is selected |
| `Cmd+P` | Quick open file (search) | Global |
| `` Cmd+` `` | New terminal | Global |
| `Escape` | Exit editor focus → return to canvas mode | Inside a shape editor |
| `Enter` / double-click shape | Enter editor focus | Canvas mode, shape selected |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo/redo | Context-dependent (see below) |

### Focus Model & Undo/Redo

Two modes:
- **Canvas mode**: clicking/dragging shapes, panning, zooming. Undo/redo controls tldraw (shape moves, creates, deletes).
- **Editor mode**: typing in a CodeMirror/terminal. Entered by double-clicking or pressing Enter on a shape. Escape returns to canvas mode. Undo/redo controls the editor (CodeMirror's undo stack).

The active mode determines which undo stack receives `Cmd+Z`.

## Error Handling

General strategy: errors surface as **toast notifications** (bottom-right, auto-dismiss after 5s). Shapes that encounter errors show an **error state** (red border + error message inside the shape).

| Error | Behavior |
|-------|----------|
| File read fails (permissions, deleted) | Toast: "Cannot open {filename}: {reason}". Shape not created. |
| File write fails (permissions, disk full) | Toast: "Cannot save {filename}: {reason}". Dirty state preserved. |
| `canvas.json` corrupted/invalid | Toast: "Canvas state corrupted, starting fresh". New empty canvas. |
| `canvas.json` version mismatch | Auto-migrate if possible. Toast if migration fails. |
| PTY spawn fails | Toast: "Cannot start terminal: {reason}". Shape shows error state. |
| Binary file opened | Toast: "Binary files are not supported". |
| File > 5MB | Toast: "File too large to open as editor". |
| Vault directory moved/deleted | Toast: "Vault directory not found". Return to landing screen. |

## Tauri Backend (Rust)

### Commands

| Command | Purpose |
|---------|---------|
| `read_file(path)` | Read file content as string (scoped to vault) |
| `write_file(path, content)` | Write string to file (scoped to vault) |
| `read_dir(path)` | List directory contents recursively (scoped to vault) |
| `watch_dir(path)` | Start watching directory for changes |
| `pty_spawn(shell)` | Spawn PTY process (Phase 2) |
| `pty_write(id, data)` | Write to PTY stdin (Phase 2) |
| `pty_resize(id, cols, rows)` | Resize PTY (Phase 2) |
| `pty_kill(id)` | Kill PTY process (Phase 2) |
| `save_canvas(vault_path, snapshot)` | Write canvas snapshot to `.humanboard/canvas.json` |
| `load_canvas(vault_path)` | Read canvas snapshot from `.humanboard/canvas.json` |
| `init_vault(path)` | Create `.humanboard/` dir, add to `.gitignore` if applicable |

### Capabilities/Permissions

```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-focus",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-exists",
    "fs:allow-read-dir",
    "fs:allow-mkdir"
  ]
}
```

Custom commands (`read_file`, `write_file`, `pty_*`, etc.) are registered via `tauri::generate_handler!` and do not require additional capability entries — they inherit from `core:default`. File path scoping is enforced in the Rust command handlers, not via Tauri's fs plugin scopes.

### Security: Content Security Policy

```json
{
  "security": {
    "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; frame-src https:; img-src 'self' asset: https: data:"
  }
}
```

- `worker-src 'self' blob:` — for CodeMirror workers
- `frame-src https:` — BrowserShape iframes restricted to HTTPS
- `img-src 'self' asset: https: data:` — local images + remote images in browser shapes
- No `unsafe-eval`

## Startup / Landing Screen

When no vault is open, show a landing screen:

```
+------------------------------------------+
|                                          |
|         [Humanboard logo/wordmark]       |
|                                          |
|    [+] Create New Vault                  |
|    [folder] Open Folder / Codebase       |
|                                          |
|    Recent:                               |
|      ~/projects/my-app                   |
|      ~/vaults/research                   |
|                                          |
+------------------------------------------+
```

- Recent vaults persisted in `~/.humanboard/recent.json` (app-level config)
- "Create New Vault" → folder picker → creates `.humanboard/` → opens canvas
- "Open Folder" → folder picker → creates `.humanboard/` if missing → opens canvas

## Theme

OLED black for now:
- Background: `#000000`
- Text: `#ffffff`
- Borders/subtle: `#1a1a1a`
- Accent: TBD
- All editors: dark theme matching app background

## Data Flow

```
User clicks file in tree
  → FileStore.openFile(path)
  → Tauri read_file(path) → content
  → FileStore adds { content, diskContent: content, isDirty: false }
  → editor.createShape({ type: 'code-shape', props: { filePath, language } })
  → Shape component reads content from FileStore
  → CodeMirror renders with content
  → User edits → FileStore.updateContent(path, newContent) → isDirty: true
  → Dirty indicator shows
  → User hits Cmd+S → FileStore.saveFile(path) → Tauri write_file → isDirty: false
```

```
Canvas auto-save (debounced 2s):
  → getSnapshot(editor.store) → { document, session }
  → Wrap with { humanboardVersion: 1, document, session }
  → Tauri save_canvas(vaultPath, snapshot)
```

## Performance Bounds

- Max simultaneous open shapes: ~50 (practical limit, not enforced)
- Max file size for CodeShape: 5MB
- Max concurrent PTY sessions: 10
- Canvas zoom range: 10% – 800%

## Dependencies

### Frontend (npm/bun)
- `tldraw` — infinite canvas
- `zustand` — state management
- `@uiwjs/react-codemirror` — CodeMirror 6 React wrapper
- `@codemirror/lang-javascript` — JS/TS language support
- `@codemirror/lang-rust` — Rust language support
- `@codemirror/lang-python` — Python language support
- `@codemirror/lang-css` — CSS language support
- `@codemirror/lang-html` — HTML language support
- `@codemirror/lang-json` — JSON language support
- `@codemirror/lang-markdown` — Markdown language support
- `@xterm/xterm` — terminal emulator (Phase 2)
- `@xterm/addon-fit` — terminal auto-fit (Phase 2)
- `lucide-react` — icons
- `@tauri-apps/api` — Tauri JS API
- `@tauri-apps/plugin-fs` — file system plugin

### Backend (Cargo)
- `tauri` — framework
- `tauri-plugin-fs` — file system access
- `portable-pty` — PTY spawning (Phase 2)
- `serde` / `serde_json` — serialization
- `notify` — file system watching

## MVP Scope

Phase 1 (MVP):
1. tldraw canvas with hidden UI, OLED theme
2. Landing screen (create vault, open folder, recent vaults)
3. File tree sidebar (toggle with Cmd+B)
4. `CodeShape` — open files as CodeMirror editors on canvas
5. File read/write via Tauri (with path validation)
6. Canvas persistence (`.humanboard/canvas.json` with versioning)
7. Keyboard shortcuts (Cmd+S, Cmd+W, Cmd+B, Escape, focus model)
8. Error handling (toast notifications)

Phase 2:
9. `TerminalShape` — xterm.js + Rust PTY backend
10. `ImageShape` — image viewer nodes
11. `PdfShape` — PDF viewer nodes
12. `MarkdownShape` — rendered markdown with edit toggle
13. File watcher for external changes
14. Drag-and-drop files from OS onto canvas

Phase 3:
15. `BrowserShape` — sandboxed iframe web pages
16. `NoteShape` — freeform sticky notes
17. `Cmd+P` quick file search
18. Multiple vaults / recent vaults management
19. Cross-platform window decorations (Windows/Linux)
