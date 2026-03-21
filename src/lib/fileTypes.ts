export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'])
export const PDF_EXTENSIONS = new Set(['pdf'])
export const MARKDOWN_EXTENSIONS = new Set(['md'])
export const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'])
export const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS, ...AUDIO_EXTENSIONS,
])
export const ALL_SHAPE_TYPES = ['code-shape', 'image-shape', 'markdown-shape', 'pdf-shape', 'audio-shape'] as const

export function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

export function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(getExt(filePath))
}

export function getShapeConfig(filePath: string, language: string) {
  const ext = getExt(filePath)
  if (PDF_EXTENSIONS.has(ext)) return { type: 'pdf-shape' as const, w: 650, h: 800 }
  if (IMAGE_EXTENSIONS.has(ext)) return { type: 'image-shape' as const, w: 500, h: 400 }
  if (MARKDOWN_EXTENSIONS.has(ext)) return { type: 'markdown-shape' as const, w: 600, h: 500 }
  if (AUDIO_EXTENSIONS.has(ext)) return { type: 'audio-shape' as const, w: 400, h: 140 }
  return { type: 'code-shape' as const, w: 600, h: 400, language }
}
