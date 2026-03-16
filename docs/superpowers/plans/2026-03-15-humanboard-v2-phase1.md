# Humanboard v2 — Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP spatial IDE — tldraw infinite canvas with file tree sidebar, CodeMirror code editor nodes, vault system, canvas persistence, and keyboard shortcuts.

**Architecture:** tldraw as full-screen canvas (hidden default UI) with custom `CodeShapeUtil` for file editing. Zustand stores (FileStore, VaultStore) manage file content and vault state outside tldraw. Rust backend handles file I/O scoped to vault root. Landing screen for vault selection on startup.

**Tech Stack:** Tauri v2, React 19, TypeScript, tldraw, CodeMirror 6 (@uiwjs/react-codemirror), Zustand, lucide-react, Bun

**Spec:** `docs/superpowers/specs/2026-03-15-humanboard-v2-design.md`

---

## File Structure

### Frontend (`src/`)

```
src/
├── main.tsx                          # React entry point (unchanged)
├── App.tsx                           # Root component — landing vs workspace routing
├── App.css                           # Global styles, OLED theme
├── components/
│   ├── Canvas.tsx                    # tldraw wrapper (hideUi, custom shapes, persistence)
│   ├── Workspace.tsx                 # Canvas + Sidebar layout
│   ├── LandingScreen.tsx             # Vault create/open/recent
│   ├── Sidebar.tsx                   # File tree sidebar container
│   ├── SidebarVaultDropdown.tsx      # Vault path dropdown at top
│   ├── SidebarSearch.tsx             # Search/filter input
│   ├── SidebarFileTree.tsx           # Recursive file tree (alpha sort mode)
│   ├── SidebarFileList.tsx           # Date-grouped flat file list (date sort mode)
│   ├── SidebarFileItem.tsx           # Single file row (icon, name, date)
│   ├── NodeTitleBar.tsx              # Shared title bar for all canvas shapes
│   └── Toast.tsx                     # Toast notification system
├── shapes/
│   └── CodeShapeUtil.tsx             # CodeMirror editor shape for tldraw
├── stores/
│   ├── fileStore.ts                  # Zustand — file content, dirty state
│   └── vaultStore.ts                 # Zustand — vault path, recent, sidebar, file tree
├── lib/
│   ├── language.ts                   # File extension → CodeMirror language mapping
│   ├── fileIcons.ts                  # File extension → lucide icon mapping
│   ├── pathUtils.ts                  # Path validation, relative path extraction
│   └── canvasPersistence.ts          # Save/load tldraw snapshots
└── hooks/
    └── useKeyboardShortcuts.ts       # Global keyboard shortcut handler
```

### Backend (`src-tauri/src/`)

```
src-tauri/src/
├── main.rs                           # Entry point (unchanged)
├── lib.rs                            # Tauri builder + command registration
└── commands/
    ├── mod.rs                        # Module declarations
    ├── files.rs                      # read_file, write_file, read_dir
    └── vault.rs                      # init_vault, save_canvas, load_canvas
```

---

## Chunk 1: Foundation — Dependencies, Rust Backend, Zustand Stores

### Task 1: Install frontend dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install all Phase 1 dependencies**

```bash
cd /Users/manavpanchal/Desktop/humanboard-v2
bun add tldraw zustand @uiwjs/react-codemirror @codemirror/lang-javascript @codemirror/lang-rust @codemirror/lang-python @codemirror/lang-css @codemirror/lang-html @codemirror/lang-json @codemirror/lang-markdown lucide-react
```

- [ ] **Step 2: Verify build still works**

```bash
bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add Phase 1 dependencies (tldraw, codemirror, zustand, lucide)"
```

---

### Task 2: Rust backend — file commands

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/files.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands module**

Create `src-tauri/src/commands/mod.rs`:

```rust
pub mod files;
pub mod vault;
```

- [ ] **Step 2: Implement file commands**

Create `src-tauri/src/commands/files.rs`:

```rust
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".humanboard"];
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5MB

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub modified_at: u64, // unix timestamp in seconds
}

fn validate_path(vault_root: &str, requested: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let full = root.join(requested);
    let resolved = fs::canonicalize(&full).unwrap_or(full.clone());
    if !resolved.starts_with(&root) {
        return Err("Path traversal denied".into());
    }
    Ok(resolved)
}

#[tauri::command]
pub fn read_file(vault_root: String, file_path: String) -> Result<String, String> {
    let path = validate_path(&vault_root, &file_path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("File too large to open as editor (max 5MB)".into());
    }
    let content = fs::read(&path).map_err(|e| format!("Cannot read {file_path}: {e}"))?;
    if content.contains(&0u8) {
        return Err("Binary files are not supported".into());
    }
    String::from_utf8(content).map_err(|_| "File is not valid UTF-8".into())
}

#[tauri::command]
pub fn write_file(vault_root: String, file_path: String, content: String) -> Result<(), String> {
    let path = validate_path(&vault_root, &file_path)?;
    fs::write(&path, content).map_err(|e| format!("Cannot save {file_path}: {e}"))
}

#[tauri::command]
pub fn read_dir(vault_root: String, dir_path: String) -> Result<Vec<FileEntry>, String> {
    let root = fs::canonicalize(&vault_root).map_err(|e| format!("Invalid vault root: {e}"))?;
    let target = if dir_path.is_empty() {
        root.clone()
    } else {
        validate_path(&vault_root, &dir_path)?
    };
    read_dir_recursive(&root, &target)
}

fn read_dir_recursive(vault_root: &Path, dir: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("Cannot read directory: {e}"))?;
    for entry in read {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".gitignore" {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| format!("Metadata error: {e}"))?;
        let is_dir = metadata.is_dir();
        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let full_path = entry.path();
        let relative = full_path.strip_prefix(vault_root).unwrap_or(&full_path);
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push(FileEntry {
            name,
            path: relative.to_string_lossy().to_string(),
            is_dir,
            modified_at,
        });
        if is_dir {
            if let Ok(children) = read_dir_recursive(vault_root, &full_path) {
                entries.extend(children);
            }
        }
    }
    Ok(entries)
}
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd src-tauri && cargo check
```

Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/
git commit -m "feat(rust): add file read/write/readdir commands with path validation"
```

---

### Task 3: Rust backend — vault commands

**Files:**
- Create: `src-tauri/src/commands/vault.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement vault commands**

Create `src-tauri/src/commands/vault.rs`:

```rust
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn init_vault(path: String) -> Result<(), String> {
    let vault_dir = Path::new(&path).join(".humanboard");
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir).map_err(|e| format!("Cannot create .humanboard: {e}"))?;
    }
    let config_path = vault_dir.join("config.json");
    if !config_path.exists() {
        fs::write(&config_path, "{}").map_err(|e| format!("Cannot write config: {e}"))?;
    }
    // Add .humanboard/ to .gitignore if in a git repo
    let git_dir = Path::new(&path).join(".git");
    if git_dir.exists() {
        let gitignore_path = Path::new(&path).join(".gitignore");
        let content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };
        if !content.lines().any(|l| l.trim() == ".humanboard/" || l.trim() == ".humanboard") {
            let mut new_content = content;
            if !new_content.is_empty() && !new_content.ends_with('\n') {
                new_content.push('\n');
            }
            new_content.push_str(".humanboard/\n");
            fs::write(&gitignore_path, new_content)
                .map_err(|e| format!("Cannot update .gitignore: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_canvas(vault_path: String, snapshot: String) -> Result<(), String> {
    let canvas_path = Path::new(&vault_path).join(".humanboard/canvas.json");
    fs::write(&canvas_path, snapshot).map_err(|e| format!("Cannot save canvas: {e}"))
}

#[tauri::command]
pub fn load_canvas(vault_path: String) -> Result<Option<String>, String> {
    let canvas_path = Path::new(&vault_path).join(".humanboard/canvas.json");
    if !canvas_path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&canvas_path).map_err(|e| format!("Cannot load canvas: {e}"))?;
    Ok(Some(content))
}
```

- [ ] **Step 2: Register all commands in lib.rs**

Replace `src-tauri/src/lib.rs`:

```rust
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_file,
            commands::files::write_file,
            commands::files::read_dir,
            commands::vault::init_vault,
            commands::vault::save_canvas,
            commands::vault::load_canvas,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "feat(rust): add vault init, canvas save/load commands"
```

---

### Task 4: Zustand stores — FileStore and VaultStore

**Files:**
- Create: `src/stores/fileStore.ts`
- Create: `src/stores/vaultStore.ts`

- [ ] **Step 1: Create FileStore**

Create `src/stores/fileStore.ts`:

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

interface FileEntry {
  content: string
  diskContent: string
  isDirty: boolean
}

interface FileStore {
  files: Map<string, FileEntry>
  openFile: (vaultRoot: string, filePath: string) => Promise<void>
  updateContent: (filePath: string, content: string) => void
  saveFile: (vaultRoot: string, filePath: string) => Promise<void>
  closeFile: (filePath: string) => void
  getFile: (filePath: string) => FileEntry | undefined
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: new Map(),

  openFile: async (vaultRoot, filePath) => {
    if (get().files.has(filePath)) return
    const content = await invoke<string>('read_file', {
      vaultRoot,
      filePath,
    })
    set((state) => {
      const files = new Map(state.files)
      files.set(filePath, { content, diskContent: content, isDirty: false })
      return { files }
    })
  },

  updateContent: (filePath, content) => {
    set((state) => {
      const files = new Map(state.files)
      const existing = files.get(filePath)
      if (!existing) return state
      files.set(filePath, {
        ...existing,
        content,
        isDirty: content !== existing.diskContent,
      })
      return { files }
    })
  },

  saveFile: async (vaultRoot, filePath) => {
    const file = get().files.get(filePath)
    if (!file) return
    await invoke('write_file', {
      vaultRoot,
      filePath,
      content: file.content,
    })
    set((state) => {
      const files = new Map(state.files)
      files.set(filePath, {
        content: file.content,
        diskContent: file.content,
        isDirty: false,
      })
      return { files }
    })
  },

  closeFile: (filePath) => {
    set((state) => {
      const files = new Map(state.files)
      files.delete(filePath)
      return { files }
    })
  },

  getFile: (filePath) => get().files.get(filePath),
}))
```

- [ ] **Step 2: Create VaultStore**

Create `src/stores/vaultStore.ts`:

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number // unix timestamp seconds
}

interface VaultStore {
  vaultPath: string | null
  recentVaults: string[]
  sidebarOpen: boolean
  sidebarSort: 'date' | 'alpha'
  fileTree: TreeNode[]
  setVaultPath: (path: string) => void
  addRecentVault: (path: string) => void
  toggleSidebar: () => void
  setSidebarSort: (sort: 'date' | 'alpha') => void
  loadFileTree: () => Promise<void>
  loadRecentVaults: () => void
  saveRecentVaults: () => void
}

const RECENT_VAULTS_KEY = 'humanboard_recent_vaults'

export const useVaultStore = create<VaultStore>((set, get) => ({
  vaultPath: null,
  recentVaults: [],
  sidebarOpen: true,
  sidebarSort: 'date',
  fileTree: [],

  setVaultPath: (path) => {
    set({ vaultPath: path })
    get().addRecentVault(path)
    get().loadFileTree()
  },

  addRecentVault: (path) => {
    set((state) => {
      const filtered = state.recentVaults.filter((v) => v !== path)
      const updated = [path, ...filtered].slice(0, 10)
      return { recentVaults: updated }
    })
    get().saveRecentVaults()
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarSort: (sort) => set({ sidebarSort: sort }),

  loadFileTree: async () => {
    const vaultPath = get().vaultPath
    if (!vaultPath) return
    try {
      const entries = await invoke<TreeNode[]>('read_dir', {
        vaultRoot: vaultPath,
        dirPath: '',
      })
      set({ fileTree: entries })
    } catch (err) {
      console.error('Failed to load file tree:', err)
      set({ fileTree: [] })
    }
  },

  loadRecentVaults: () => {
    try {
      const stored = localStorage.getItem(RECENT_VAULTS_KEY)
      if (stored) set({ recentVaults: JSON.parse(stored) })
    } catch {
      // ignore
    }
  },

  saveRecentVaults: () => {
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(get().recentVaults))
  },
}))
```

- [ ] **Step 3: Verify build**

```bash
bun run build
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/
git commit -m "feat: add FileStore and VaultStore (zustand)"
```

---

### Task 5: Utility modules — language mapping, file icons, path utils

**Files:**
- Create: `src/lib/language.ts`
- Create: `src/lib/fileIcons.ts`
- Create: `src/lib/pathUtils.ts`

- [ ] **Step 1: Create language detection**

Create `src/lib/language.ts`:

```typescript
import { javascript } from '@codemirror/lang-javascript'
import { rust } from '@codemirror/lang-rust'
import { python } from '@codemirror/lang-python'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'

const LANG_MAP: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  rs: () => rust(),
  py: () => python(),
  css: () => css(),
  html: () => html(),
  json: () => json(),
  md: () => markdown(),
}

export function getLanguageExtension(filePath: string): Extension | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext || !LANG_MAP[ext]) return null
  return LANG_MAP[ext]()
}

export function getLanguageName(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const names: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    rs: 'rust', py: 'python', css: 'css', html: 'html',
    json: 'json', md: 'markdown',
  }
  return names[ext] ?? 'plaintext'
}
```

- [ ] **Step 2: Create file icon mapping**

Create `src/lib/fileIcons.ts`:

```typescript
import {
  FileCode, FileText, FileJson, Image, File, Folder, FolderOpen, Terminal, Globe,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const EXT_ICONS: Record<string, LucideIcon> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  rs: FileCode, py: FileCode, css: FileCode, html: FileCode,
  json: FileJson,
  md: FileText, txt: FileText,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
}

export function getFileIcon(filePath: string, isDir: boolean, isOpen?: boolean): LucideIcon {
  if (isDir) return isOpen ? FolderOpen : Folder
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? File
}

export { Terminal as TerminalIcon, Globe as BrowserIcon }
```

- [ ] **Step 3: Create path utilities**

Create `src/lib/pathUtils.ts`:

```typescript
export function getFileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

export function getRelativePath(filePath: string): string {
  return filePath
}

export function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}
```

- [ ] **Step 4: Verify build**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/
git commit -m "feat: add language detection, file icons, and path utils"
```

---

## Chunk 2: Canvas, CodeShape, and Node Title Bar

### Task 6: tldraw Canvas component

**Files:**
- Create: `src/components/Canvas.tsx`
- Create: `src/lib/canvasPersistence.ts`

- [ ] **Step 1: Create canvas persistence helpers**

Create `src/lib/canvasPersistence.ts`:

```typescript
import { getSnapshot, loadSnapshot, type Editor } from 'tldraw'
import { invoke } from '@tauri-apps/api/core'

interface HumanboardSnapshot {
  humanboardVersion: number
  document: any
  session: any
}

export async function saveCanvasState(editor: Editor, vaultPath: string): Promise<void> {
  const { document, session } = getSnapshot(editor.store)
  const snapshot: HumanboardSnapshot = {
    humanboardVersion: 1,
    document,
    session,
  }
  await invoke('save_canvas', {
    vaultPath,
    snapshot: JSON.stringify(snapshot),
  })
}

export async function loadCanvasState(
  editor: Editor,
  vaultPath: string
): Promise<boolean> {
  const raw = await invoke<string | null>('load_canvas', { vaultPath })
  if (!raw) return false
  try {
    const snapshot: HumanboardSnapshot = JSON.parse(raw)
    if (snapshot.humanboardVersion !== 1) {
      console.warn('Unknown canvas version:', snapshot.humanboardVersion)
      return false
    }
    loadSnapshot(editor.store, {
      document: snapshot.document,
      session: snapshot.session,
    })
    return true
  } catch (err) {
    console.error('Failed to load canvas state:', err)
    return false
  }
}
```

- [ ] **Step 2: Create Canvas component**

Create `src/components/Canvas.tsx`:

```tsx
import { useCallback, useRef, useEffect } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { CodeShapeUtil } from '../shapes/CodeShapeUtil'
import { saveCanvasState, loadCanvasState } from '../lib/canvasPersistence'
import { useVaultStore } from '../stores/vaultStore'

const customShapeUtils = [CodeShapeUtil]

export function Canvas() {
  const editorRef = useRef<Editor | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMount = useCallback(
    async (editor: Editor) => {
      editorRef.current = editor
      if (vaultPath) {
        await loadCanvasState(editor, vaultPath)
      }
      // Auto-save on changes (debounced 2s)
      editor.store.listen(
        () => {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
          if (!vaultPath) return
          saveTimeoutRef.current = setTimeout(() => {
            if (editorRef.current && vaultPath) {
              saveCanvasState(editorRef.current, vaultPath)
            }
          }, 2000)
        },
        { scope: 'document' }
      )
    },
    [vaultPath]
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        hideUi
        onMount={handleMount}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify build** (will fail until CodeShapeUtil exists — that's Task 7)

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas.tsx src/lib/canvasPersistence.ts
git commit -m "feat: add tldraw Canvas component with auto-save persistence"
```

---

### Task 7: CodeShapeUtil — code editor nodes on canvas

**Files:**
- Create: `src/shapes/CodeShapeUtil.tsx`

- [ ] **Step 1: Create CodeShapeUtil**

Create `src/shapes/CodeShapeUtil.tsx`:

```tsx
import { BaseBoxShapeUtil, HTMLContainer, type TLShape } from 'tldraw'
import CodeMirror from '@uiwjs/react-codemirror'
import { EditorView } from '@codemirror/view'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension } from '../lib/language'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useCallback } from 'react'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'code-shape': {
      w: number
      h: number
      filePath: string
      language: string
    }
  }
}

export type CodeShape = TLShape<'code-shape'>

const oledTheme = EditorView.theme(
  {
    '&': {
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: '13px',
      backgroundColor: '#000',
    },
    '.cm-content': { caretColor: '#fff' },
    '.cm-gutters': { backgroundColor: '#000', border: 'none', color: '#555' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.05)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.05)' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true }
)

export class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
  static override type = 'code-shape' as const

  override getDefaultProps() {
    return { w: 600, h: 400, filePath: '', language: 'typescript' }
  }

  override component(shape: CodeShape) {
    return <CodeShapeComponent shape={shape} />
  }

  override indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function CodeShapeComponent({ shape }: { shape: CodeShape }) {
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)

  const langExt = getLanguageExtension(shape.props.filePath)
  const extensions = [oledTheme, ...(langExt ? [langExt] : [])]

  const handleChange = useCallback(
    (value: string) => {
      updateContent(shape.props.filePath, value)
    },
    [shape.props.filePath, updateContent]
  )

  if (!file) {
    return (
      <HTMLContainer
        style={{
          backgroundColor: '#000',
          color: '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Loading...
      </HTMLContainer>
    )
  }

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <NodeTitleBar
        filePath={shape.props.filePath}
        isDirty={file.isDirty}
        shapeId={shape.id}
      />
      <div
        style={{ flex: 1, overflow: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CodeMirror
          value={file.content}
          onChange={handleChange}
          extensions={extensions}
          theme="none"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: true,
          }}
          style={{ height: '100%' }}
        />
      </div>
    </HTMLContainer>
  )
}
```

- [ ] **Step 2: Verify build** (will fail until NodeTitleBar exists — that's Task 8)

- [ ] **Step 3: Commit**

```bash
git add src/shapes/
git commit -m "feat: add CodeShapeUtil — CodeMirror editor nodes on tldraw canvas"
```

---

### Task 8: NodeTitleBar — shared title bar for all shapes

**Files:**
- Create: `src/components/NodeTitleBar.tsx`

- [ ] **Step 1: Create NodeTitleBar**

Create `src/components/NodeTitleBar.tsx`:

```tsx
import { useEditor } from 'tldraw'
import { X, Copy, Settings } from 'lucide-react'
import { getFileIcon } from '../lib/fileIcons'
import { getRelativePath } from '../lib/pathUtils'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useCallback } from 'react'

interface NodeTitleBarProps {
  filePath: string
  isDirty: boolean
  shapeId: string
  label?: string
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export function NodeTitleBar({ filePath, isDirty, shapeId, label, icon }: NodeTitleBarProps) {
  const editor = useEditor()
  const closeFile = useFileStore((s) => s.closeFile)
  const saveFile = useFileStore((s) => s.saveFile)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const file = useFileStore((s) => s.files.get(filePath))

  const Icon = icon ?? getFileIcon(filePath, false)
  const displayPath = label ?? getRelativePath(filePath)

  const handleClose = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      editor.deleteShape(shapeId as any)
      closeFile(filePath)
    },
    [editor, shapeId, filePath, closeFile]
  )

  const handleCopy = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (file) navigator.clipboard.writeText(file.content)
    },
    [file]
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        backgroundColor: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        cursor: 'grab',
        userSelect: 'none',
        minHeight: 32,
      }}
    >
      <Icon size={14} strokeWidth={1.5} />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayPath}
      </span>
      {isDirty && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#fff',
            flexShrink: 0,
          }}
        />
      )}
      <button
        onPointerDown={handleCopy}
        style={iconButtonStyle}
        title="Copy content"
      >
        <Copy size={12} strokeWidth={1.5} />
      </button>
      <button
        onPointerDown={handleClose}
        style={iconButtonStyle}
        title="Close"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  flexShrink: 0,
}
```

- [ ] **Step 2: Verify build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeTitleBar.tsx
git commit -m "feat: add NodeTitleBar with file path, dirty indicator, copy, close"
```

---

## Chunk 3: Landing Screen, Sidebar, Workspace Layout

### Task 9: Toast notification system

**Files:**
- Create: `src/components/Toast.tsx`

- [ ] **Step 1: Create Toast component**

Create `src/components/Toast.tsx`:

```tsx
import { create } from 'zustand'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'error' | 'info'
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (message: string, type?: 'error' | 'info') => void
  removeToast: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'error') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '10px 16px',
            backgroundColor: toast.type === 'error' ? '#1a0000' : '#0a0a0a',
            border: `1px solid ${toast.type === 'error' ? '#330000' : '#1a1a1a'}`,
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 360,
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Toast.tsx
git commit -m "feat: add toast notification system"
```

---

### Task 10: Landing Screen

**Files:**
- Create: `src/components/LandingScreen.tsx`

- [ ] **Step 1: Create LandingScreen**

Create `src/components/LandingScreen.tsx`:

```tsx
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Plus, FolderOpen, Folder } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'

export function LandingScreen() {
  const setVaultPath = useVaultStore((s) => s.setVaultPath)
  const recentVaults = useVaultStore((s) => s.recentVaults)
  const addToast = useToastStore((s) => s.addToast)

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    try {
      await invoke('init_vault', { path: selected })
      setVaultPath(selected)
    } catch (err) {
      addToast(String(err))
    }
  }

  const handleOpenRecent = async (path: string) => {
    try {
      await invoke('init_vault', { path })
      setVaultPath(path)
    } catch (err) {
      addToast(`Vault directory not found: ${path}`)
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        color: '#fff',
        gap: 32,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
        Humanboard
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <button onClick={handleOpenFolder} style={actionButtonStyle}>
          <FolderOpen size={18} strokeWidth={1.5} />
          Open Folder / Codebase
        </button>
      </div>

      {recentVaults.length > 0 && (
        <div style={{ width: 280 }}>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Recent</p>
          {recentVaults.map((vault) => (
            <button
              key={vault}
              onClick={() => handleOpenRecent(vault)}
              style={{
                ...recentButtonStyle,
              }}
            >
              <Folder size={14} strokeWidth={1.5} color="#666" />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {vault.replace(/^\/Users\/[^/]+/, '~')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  backgroundColor: '#0a0a0a',
  border: '1px solid #1a1a1a',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

const recentButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: '#999',
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}
```

- [ ] **Step 2: Install dialog plugin dependency**

```bash
bun add @tauri-apps/plugin-dialog
cargo add tauri-plugin-dialog --manifest-path src-tauri/Cargo.toml
```

Then add to `src-tauri/src/lib.rs` after the opener plugin:
```rust
.plugin(tauri_plugin_dialog::init())
```

And add permission to `src-tauri/capabilities/default.json`:
```json
"dialog:default"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingScreen.tsx src-tauri/ package.json bun.lock
git commit -m "feat: add landing screen with open folder and recent vaults"
```

---

### Task 11: Sidebar components

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/SidebarVaultDropdown.tsx`
- Create: `src/components/SidebarSearch.tsx`
- Create: `src/components/SidebarFileList.tsx`
- Create: `src/components/SidebarFileItem.tsx`

- [ ] **Step 1: Create SidebarFileItem**

Create `src/components/SidebarFileItem.tsx`:

```tsx
import { getFileIcon } from '../lib/fileIcons'

interface SidebarFileItemProps {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number
  onClick: (path: string) => void
}

export function SidebarFileItem({ name, path, isDir, modifiedAt, onClick }: SidebarFileItemProps) {
  const Icon = getFileIcon(path, isDir)
  const dateStr = formatDate(modifiedAt)

  return (
    <button
      onClick={() => onClick(path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        color: '#ccc',
        fontSize: 13,
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#111')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={14} strokeWidth={1.5} color="#666" />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>{dateStr}</span>
    </button>
  )
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}
```

- [ ] **Step 2: Create SidebarSearch**

Create `src/components/SidebarSearch.tsx`:

```tsx
import { Search } from 'lucide-react'

interface SidebarSearchProps {
  value: string
  onChange: (value: string) => void
}

export function SidebarSearch({ value, onChange }: SidebarSearchProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        margin: '0 8px 8px',
        backgroundColor: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 6,
      }}
    >
      <Search size={14} strokeWidth={1.5} color="#555" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        style={{
          flex: 1,
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ccc',
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Create SidebarVaultDropdown**

Create `src/components/SidebarVaultDropdown.tsx`:

```tsx
import { ChevronDown } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'

export function SidebarVaultDropdown() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const display = vaultPath?.replace(/^\/Users\/[^/]+/, '~') ?? 'No vault'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderBottom: '1px solid #1a1a1a',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {display}
      </span>
      <ChevronDown size={14} strokeWidth={1.5} color="#666" />
    </div>
  )
}
```

- [ ] **Step 4: Create SidebarFileList**

Create `src/components/SidebarFileList.tsx`:

```tsx
import { useVaultStore } from '../stores/vaultStore'
import { SidebarFileItem } from './SidebarFileItem'
import { useMemo } from 'react'

interface SidebarFileListProps {
  searchQuery: string
  onFileClick: (path: string) => void
}

export function SidebarFileList({ searchQuery, onFileClick }: SidebarFileListProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const sortMode = useVaultStore((s) => s.sidebarSort)

  const files = useMemo(() => {
    let filtered = fileTree.filter((f) => !f.isDir)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (sortMode === 'date') {
      filtered.sort((a, b) => b.modifiedAt - a.modifiedAt)
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered
  }, [fileTree, searchQuery, sortMode])

  const grouped = useMemo(() => {
    if (sortMode !== 'date') return null
    const groups = new Map<string, typeof files>()
    for (const file of files) {
      const d = new Date(file.modifiedAt * 1000)
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(file)
    }
    return groups
  }, [files, sortMode])

  if (sortMode === 'date' && grouped) {
    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        {Array.from(grouped.entries()).map(([date, items]) => (
          <div key={date}>
            <div style={{ padding: '8px 12px 4px', fontSize: 11, color: '#555', fontWeight: 600 }}>
              {date}
            </div>
            {items.map((f) => (
              <SidebarFileItem key={f.path} {...f} onClick={onFileClick} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {files.map((f) => (
        <SidebarFileItem key={f.path} {...f} onClick={onFileClick} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create Sidebar container**

Create `src/components/Sidebar.tsx`:

```tsx
import { useState } from 'react'
import { useVaultStore } from '../stores/vaultStore'
import { SidebarVaultDropdown } from './SidebarVaultDropdown'
import { SidebarSearch } from './SidebarSearch'
import { SidebarFileList } from './SidebarFileList'
import { ArrowUpDown } from 'lucide-react'

interface SidebarProps {
  onFileClick: (path: string) => void
}

export function Sidebar({ onFileClick }: SidebarProps) {
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const sidebarSort = useVaultStore((s) => s.sidebarSort)
  const setSidebarSort = useVaultStore((s) => s.setSidebarSort)
  const [searchQuery, setSearchQuery] = useState('')

  if (!sidebarOpen) return null

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        backgroundColor: '#000',
        borderRight: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      <div style={{ height: 28 }} /> {/* titlebar spacer */}
      <SidebarVaultDropdown />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 12px 4px',
        }}
      >
        <button
          onClick={() => setSidebarSort(sidebarSort === 'date' ? 'alpha' : 'date')}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ArrowUpDown size={12} />
          {sidebarSort === 'date' ? 'Created' : 'A-Z'}
        </button>
      </div>
      <SidebarFileList searchQuery={searchQuery} onFileClick={onFileClick} />
    </div>
  )
}
```

- [ ] **Step 6: Verify build**

```bash
bun run build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar*.tsx
git commit -m "feat: add sidebar with vault dropdown, search, date-grouped file list"
```

---

### Task 12: Workspace layout + App routing

**Files:**
- Create: `src/components/Workspace.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create Workspace component**

Create `src/components/Workspace.tsx`:

```tsx
import { useCallback, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { Canvas } from './Canvas'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'
import { getLanguageName } from '../lib/language'
import type { Editor } from 'tldraw'

export function Workspace() {
  const vaultPath = useVaultStore((s) => s.vaultPath)!
  const openFile = useFileStore((s) => s.openFile)
  const files = useFileStore((s) => s.files)
  const addToast = useToastStore((s) => s.addToast)

  const handleFileClick = useCallback(
    async (filePath: string) => {
      try {
        await openFile(vaultPath, filePath)
        // Shape creation is handled by Canvas via a custom event or direct editor access
        // For now, we dispatch a custom event that Canvas listens to
        window.dispatchEvent(
          new CustomEvent('humanboard:open-file', {
            detail: { filePath, language: getLanguageName(filePath) },
          })
        )
      } catch (err) {
        addToast(String(err))
      }
    },
    [vaultPath, openFile, addToast]
  )

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      <Sidebar onFileClick={handleFileClick} />
      <div style={{ flex: 1, height: '100%' }}>
        <Canvas />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx**

Replace `src/App.tsx`:

```tsx
import { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { LandingScreen } from './components/LandingScreen'
import { Workspace } from './components/Workspace'
import { ToastContainer } from './components/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import './App.css'

function App() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults)

  useEffect(() => {
    loadRecentVaults()
  }, [loadRecentVaults])

  useKeyboardShortcuts()

  return (
    <>
      {vaultPath ? <Workspace /> : <LandingScreen />}
      <ToastContainer />
    </>
  )
}

export default App
```

- [ ] **Step 3: Update App.css**

Replace `src/App.css` (keep existing + add tldraw overrides):

```css
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  scrollbar-width: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none;
}

:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: #ffffff;
  background-color: #000000;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

/* tldraw overrides for OLED theme */
.tl-theme__dark {
  --color-background: #000000;
}

.tl-background {
  background-color: #000000 !important;
}
```

- [ ] **Step 4: Verify build**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/components/Workspace.tsx
git commit -m "feat: add Workspace layout with app routing (landing vs workspace)"
```

---

### Task 13: Keyboard shortcuts

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Create keyboard shortcuts hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useEffect } from 'react'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'

export function useKeyboardShortcuts() {
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const saveFile = useFileStore((s) => s.saveFile)
  const files = useFileStore((s) => s.files)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+B — toggle sidebar
      if (meta && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+S — save all dirty files
      if (meta && e.key === 's') {
        e.preventDefault()
        if (!vaultPath) return
        for (const [path, file] of files) {
          if (file.isDirty) {
            saveFile(vaultPath, path)
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar, vaultPath, saveFile, files])
}
```

- [ ] **Step 2: Verify build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/
git commit -m "feat: add keyboard shortcuts (Cmd+B sidebar, Cmd+S save)"
```

---

### Task 14: Wire up Canvas to handle file open events

**Files:**
- Modify: `src/components/Canvas.tsx`

- [ ] **Step 1: Add file open event listener to Canvas**

Update `Canvas.tsx` — add inside the `handleMount` callback, after loading canvas state:

```typescript
// Listen for file open events from sidebar
const handleOpenFile = (e: Event) => {
  const { filePath, language } = (e as CustomEvent).detail
  // Check if shape already exists for this file
  const existing = editor.getCurrentPageShapes().find(
    (s) => s.type === 'code-shape' && (s as any).props.filePath === filePath
  )
  if (existing) {
    editor.select(existing.id)
    editor.zoomToSelection()
    return
  }
  // Create new shape at center of viewport
  const { x, y } = editor.getViewportPageBounds().center
  editor.createShape({
    type: 'code-shape',
    x: x - 300,
    y: y - 200,
    props: { filePath, language, w: 600, h: 400 },
  })
}
window.addEventListener('humanboard:open-file', handleOpenFile)
```

And add cleanup in the useEffect return.

- [ ] **Step 2: Verify full build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Canvas.tsx
git commit -m "feat: wire Canvas to handle file open events from sidebar"
```

---

### Task 15: Update Tauri config — CSP, permissions, titlebar

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Update tauri.conf.json with CSP**

Update the `security` section:

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' asset: https: data:"
}
```

- [ ] **Step 2: Update capabilities**

Update `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "core:window:allow-start-dragging",
    "dialog:default"
  ]
}
```

- [ ] **Step 3: Final full build check**

```bash
bun run build && cd src-tauri && cargo build
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: update Tauri config with CSP and permissions"
```

---

### Task 16: End-to-end smoke test

- [ ] **Step 1: Run the app**

```bash
bun run tauri dev
```

- [ ] **Step 2: Verify landing screen**

Expected: Black screen with "Humanboard" title, "Open Folder / Codebase" button, recent vaults list.

- [ ] **Step 3: Open a folder**

Click "Open Folder", select a directory with source files.
Expected: Canvas appears with sidebar showing files sorted by date.

- [ ] **Step 4: Open a file**

Click a `.ts` or `.js` file in the sidebar.
Expected: A code editor node appears on the canvas with syntax highlighting.

- [ ] **Step 5: Edit and save**

Type in the editor, verify dirty dot appears. Press Cmd+S, verify dot disappears.

- [ ] **Step 6: Toggle sidebar**

Press Cmd+B. Expected: Sidebar hides/shows.

- [ ] **Step 7: Close and reopen**

Close the app, reopen. Expected: Same vault opens with same canvas state (shapes in same positions).

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: Humanboard v2 Phase 1 MVP complete"
```
