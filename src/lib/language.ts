import { javascript } from '@codemirror/lang-javascript'
import { rust } from '@codemirror/lang-rust'
import { python } from '@codemirror/lang-python'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { go } from '@codemirror/lang-go'
import { yaml } from '@codemirror/lang-yaml'
import { sql } from '@codemirror/lang-sql'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { php } from '@codemirror/lang-php'
import { xml } from '@codemirror/lang-xml'
import { sass } from '@codemirror/lang-sass'
import { less } from '@codemirror/lang-less'
import type { Extension } from '@codemirror/state'

const LANG_MAP: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript({ jsx: false }),
  cjs: () => javascript({ jsx: false }),
  rs: () => rust(),
  py: () => python(),
  css: () => css(),
  html: () => html(),
  htm: () => html(),
  json: () => json(),
  md: () => markdown(),
  go: () => go(),
  yaml: () => yaml(),
  yml: () => yaml(),
  sql: () => sql(),
  c: () => cpp(),
  h: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  cxx: () => cpp(),
  hpp: () => cpp(),
  hxx: () => cpp(),
  java: () => java(),
  php: () => php(),
  xml: () => xml(),
  svg: () => xml(),
  scss: () => sass(),
  sass: () => sass(),
  less: () => less(),
  toml: () => json(), // close enough structure
  env: () => json(),
}

const langCache = new Map<string, Extension>()

export function getLanguageExtension(filePath: string): Extension | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext || !LANG_MAP[ext]) return null
  const cached = langCache.get(ext)
  if (cached) return cached
  const instance = LANG_MAP[ext]()
  langCache.set(ext, instance)
  return instance
}

export function getLanguageName(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const names: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    mjs: 'javascript', cjs: 'javascript',
    rs: 'rust', py: 'python', css: 'css', html: 'html', htm: 'html',
    json: 'json', md: 'markdown',
    go: 'go', yaml: 'yaml', yml: 'yaml', sql: 'sql',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
    java: 'java', php: 'php', xml: 'xml', svg: 'xml',
    scss: 'scss', sass: 'sass', less: 'less',
    toml: 'toml', env: 'env',
    sh: 'shell', bash: 'shell', zsh: 'shell',
  }
  return names[ext] ?? 'plaintext'
}
