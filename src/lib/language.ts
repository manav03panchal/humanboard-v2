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
