import type { Extension } from '@codemirror/state'

const langCache = new Map<string, Extension>()
const langLoading = new Map<string, Promise<Extension | null>>()

async function importLanguage(ext: string): Promise<Extension | null> {
  switch (ext) {
    case 'ts': return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: false })
    case 'tsx': return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
    case 'js': return (await import('@codemirror/lang-javascript')).javascript({ jsx: false })
    case 'jsx': return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
    case 'mjs': case 'cjs': return (await import('@codemirror/lang-javascript')).javascript({ jsx: false })
    case 'rs': return (await import('@codemirror/lang-rust')).rust()
    case 'py': return (await import('@codemirror/lang-python')).python()
    case 'css': return (await import('@codemirror/lang-css')).css()
    case 'html': case 'htm': return (await import('@codemirror/lang-html')).html()
    case 'json': return (await import('@codemirror/lang-json')).json()
    case 'md': return (await import('@codemirror/lang-markdown')).markdown()
    case 'go': return (await import('@codemirror/lang-go')).go()
    case 'yaml': case 'yml': return (await import('@codemirror/lang-yaml')).yaml()
    case 'sql': return (await import('@codemirror/lang-sql')).sql()
    case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hxx':
      return (await import('@codemirror/lang-cpp')).cpp()
    case 'java': return (await import('@codemirror/lang-java')).java()
    case 'php': return (await import('@codemirror/lang-php')).php()
    case 'xml': case 'svg': return (await import('@codemirror/lang-xml')).xml()
    case 'scss': case 'sass': return (await import('@codemirror/lang-sass')).sass()
    case 'less': return (await import('@codemirror/lang-less')).less()
    case 'toml': case 'env': return (await import('@codemirror/lang-json')).json()
    default: return null
  }
}

/** Synchronous cache lookup — returns null on cache miss */
export function getLanguageExtension(filePath: string): Extension | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return langCache.get(ext) ?? null
}

/** Async loader — loads language on demand, caches for future sync access */
export async function loadLanguageExtension(filePath: string): Promise<Extension | null> {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return null
  const cached = langCache.get(ext)
  if (cached) return cached
  const existing = langLoading.get(ext)
  if (existing) return existing
  const promise = importLanguage(ext).then((lang) => {
    if (lang) langCache.set(ext, lang)
    langLoading.delete(ext)
    return lang
  })
  langLoading.set(ext, promise)
  return promise
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
