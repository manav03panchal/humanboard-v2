# Humanboard v2

## Stack
- Tauri v2 (Rust backend) + React 19 + TypeScript + tldraw (canvas) + CodeMirror 6 (editors)
- Bun as package manager
- Zustand for state management
- lucide-react for icons
- Iosevka Nerd Font Mono as the global font

## Commands
- `bun run dev` — start Vite dev server
- `bun run tauri dev` — start Tauri app in dev mode
- `bun run build` — build frontend (tsc + vite)
- `cargo check` — check Rust compilation (run from src-tauri/)
- `bun run test` — run vitest tests
- `bun run test:watch` — run tests in watch mode

## Documentation
- Use context7 MCP server to look up documentation for any library (tldraw, CodeMirror, Tauri, xterm.js, etc.)
- Resolve library ID first with `resolve-library-id`, then query docs with `query-docs`
- Always prefer up-to-date docs from context7 over guessing API usage

## Architecture
- All canvas shapes extend `BaseBoxShapeUtil` from tldraw
- File content stored in Zustand `FileStore`, NOT in tldraw shape props
- Binary files (images, PDFs, audio) use `convertFileSrc` from `@tauri-apps/api/core`
- Rust commands handle all file I/O with path validation via `validate_path()`
- Canvas state persisted to `.humanboard/canvas.json` with versioned snapshots

## Conventions
- Follow existing patterns in `src/shapes/` for new shape types
- All shapes: `canRotate() { return false }`, use `NodeTitleBar` component
- Stop event propagation on interactive content to prevent tldraw from capturing events
- Use granular Zustand selectors (subscribe to individual fields, not full store)
- OLED black theme (#000000 background)
