# Humanboard v2 — Phase 2 PRD

## Overview

Phase 2 extends Humanboard v2 with four new canvas shape types (TerminalShape, ImageShape, PdfShape, MarkdownShape), a file watcher for detecting external changes, and drag-and-drop support from the OS file manager. These features transform Humanboard from a code-only spatial IDE into a multi-content spatial workspace.

**Phase 1 (complete):** CodeShape (CodeMirror editor), file tree sidebar, vault system, canvas persistence, keyboard shortcuts, Zed theme engine.

**Phase 2 (this PRD):** TerminalShape, ImageShape, PdfShape, MarkdownShape, file watcher, OS drag-and-drop.

## Architecture

### New Shape Types

| Shape | Renderer | Extensions | Notes |
|-------|----------|-----------|-------|
| `TerminalShape` | xterm.js + FitAddon | N/A (not file-based) | PTY backend via `tauri-plugin-pty` |
| `ImageShape` | `<img>` with base64 data URL | .png, .jpg, .jpeg, .gif, .svg, .webp | Read-only, resizable |
| `PdfShape` | react-pdf (Document + Page) | .pdf | Scrollable, read-only |
| `MarkdownShape` | react-markdown (view) / CodeMirror (edit) | .md | Toggle between rendered/raw |

### New Backend Modules

| Module | Crate/Plugin | Purpose |
|--------|-------------|---------|
| `tauri-plugin-pty` | Tauri plugin (git) | PTY spawn/write/resize/kill |
| `watcher` | `notify` (already in deps) | Watch vault directory for external changes |
| `read_file_base64` | `base64` crate | Read binary files as base64 data URLs |

### New Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@xterm/xterm` | ^5.x | Terminal emulator |
| `@xterm/addon-fit` | ^0.x | Terminal auto-fit |
| `react-pdf` | ^9.x | PDF rendering |
| `react-markdown` | ^10.x | Markdown rendering |
| `tauri-pty` | ^0.x | Tauri PTY JS bindings |

### New Cargo Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri-plugin-pty` | git | PTY plugin |
| `base64` | 0.22 | Base64 encoding for binary files |

## Feature Details

### 1. TerminalShape

Embeds a fully functional terminal in a tldraw shape. Each terminal spawns its own PTY session.

- **Frontend:** xterm.js Terminal + FitAddon inside HTMLContainer
- **Backend:** `tauri-plugin-pty` handles PTY lifecycle
- **API:** `spawn(shell, args, {cols, rows})` returns a PTY object with `write()`, `resize()`, `kill()`, `onData()`, `onExit()`
- **Keyboard shortcut:** Cmd+\` creates a new terminal on canvas
- **Theme:** xterm themed to match OLED black (background from theme store)
- **Lifecycle:** Terminal shapes are removed on canvas reload (PTY sessions don't persist across app restarts)
- **Store:** PtyStore (Zustand) tracks active sessions

### 2. ImageShape

Displays image files as read-only nodes on the canvas.

- **Supported formats:** .png, .jpg, .jpeg, .gif, .svg, .webp
- **Loading:** Rust `read_file_base64` command reads file and returns `data:{mime};base64,{data}` string
- **Display:** `<img>` element with `object-fit: contain`
- **Interaction:** Resizable, not rotatable, not editable (canEdit = false)
- **Max file size:** 10MB (separate limit from code files' 5MB)

### 3. PdfShape

Renders PDF documents as scrollable nodes on the canvas.

- **Renderer:** react-pdf `Document` + `Page` components
- **Loading:** Same `read_file_base64` command as ImageShape
- **Display:** All pages rendered vertically, scrollable inside the node
- **Page info:** Page count displayed below title bar
- **Interaction:** Scrollable, resizable, not editable

### 4. MarkdownShape

Renders Markdown files with a toggle between rendered and raw edit modes.

- **Rendered view:** react-markdown with styled markdown classes
- **Edit view:** CodeMirror with markdown language support (reuses CodeShape infrastructure)
- **Toggle:** Eye/Code icon button in title bar
- **Content management:** Same FileStore pattern as CodeShape
- **Default mode:** Rendered view

### 5. File Watcher

Detects external file changes and updates the UI in real-time.

- **Backend:** `notify` crate watches vault directory recursively
- **Events:** `vault:file-changed` Tauri events with path and change type (create/modify/remove)
- **Frontend behavior:**
  - Modified files: reload content in FileStore (skip if dirty)
  - Created/removed files: refresh file tree (debounced 500ms)
- **Filtered directories:** node_modules, .git, target, dist, .humanboard
- **Lifecycle:** Starts when vault opens, stops when vault closes/switches

### 6. Drag-and-Drop from OS

Enables dropping files from Finder/Explorer onto the canvas.

- **Detection:** HTML5 drag events on canvas container
- **File type routing:** Extension determines shape type (same logic as file tree click)
- **Position:** Shapes created at the drop position (screen-to-canvas coordinate conversion)
- **Multiple files:** Created side by side with horizontal offset
- **Security:** Only files within the vault root are accepted
- **Visual feedback:** Blue dashed border overlay while dragging

## Dependency Chain

```
HUM-187: Install Phase 2 frontend deps          (no deps)
HUM-190: Rust PTY backend                       (no deps)
HUM-193: File watcher                           (no deps)
    |
    v
HUM-188: ImageShape                             (blocked by HUM-187)
HUM-189: MarkdownShape                          (blocked by HUM-187)
HUM-192: PdfShape                               (blocked by HUM-187)
HUM-191: TerminalShape                          (blocked by HUM-187, HUM-190)
    |
    v
HUM-194: Drag-and-drop from OS                  (blocked by HUM-188, HUM-189, HUM-192)
```

### Parallelism

Three tracks can run in parallel:
1. **Track A:** HUM-187 (deps) -> HUM-188 (image) + HUM-189 (markdown) + HUM-192 (pdf) -> HUM-194 (dnd)
2. **Track B:** HUM-190 (PTY rust) -> HUM-191 (terminal, also needs HUM-187)
3. **Track C:** HUM-193 (file watcher) — fully independent

## Linear Issues

| # | Identifier | Title | Dependencies |
|---|-----------|-------|-------------|
| 1 | HUM-187 | Install Phase 2 frontend dependencies (xterm, react-pdf, react-markdown) | none |
| 2 | HUM-188 | ImageShape: image viewer nodes on canvas | HUM-187 |
| 3 | HUM-189 | MarkdownShape: rendered markdown with edit toggle | HUM-187 |
| 4 | HUM-190 | Rust PTY backend commands for terminal integration | none |
| 5 | HUM-191 | TerminalShape: xterm.js terminal nodes on canvas | HUM-187, HUM-190 |
| 6 | HUM-192 | PdfShape: PDF viewer nodes on canvas | HUM-187 |
| 7 | HUM-193 | File watcher: detect external file changes | none |
| 8 | HUM-194 | Drag-and-drop files from OS onto canvas | HUM-188, HUM-189, HUM-192 |

## Files Modified/Created

### New Files
- `src/shapes/ImageShapeUtil.tsx`
- `src/shapes/MarkdownShapeUtil.tsx`
- `src/shapes/TerminalShapeUtil.tsx`
- `src/shapes/PdfShapeUtil.tsx`
- `src/stores/ptyStore.ts`
- `src/hooks/useFileWatcher.ts`
- `src-tauri/src/commands/watcher.rs`

### Modified Files
- `package.json` — new dependencies
- `src/main.tsx` — xterm CSS, react-pdf worker config
- `src/shapes/index.ts` — register new shapes
- `src/components/Canvas.tsx` — file type routing, Cmd+\` shortcut, drag-and-drop, file watcher integration
- `src/stores/fileStore.ts` — add reloadFile method
- `src-tauri/Cargo.toml` — tauri-plugin-pty, base64
- `src-tauri/src/lib.rs` — register PTY plugin, watcher commands, watcher state
- `src-tauri/src/commands/mod.rs` — add watcher module
- `src-tauri/src/commands/files.rs` — add read_file_base64 command
- `src-tauri/capabilities/default.json` — add pty:default permission
- `src/index.css` — markdown rendering styles
