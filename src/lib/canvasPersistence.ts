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
