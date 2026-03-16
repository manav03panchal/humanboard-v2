import {
  FileCode, FileText, FileJson, Image, File, Folder, FolderOpen, Terminal, Globe, FileType,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const EXT_ICONS: Record<string, LucideIcon> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  rs: FileCode, py: FileCode, css: FileCode, html: FileCode,
  json: FileJson,
  md: FileText, txt: FileText,
  pdf: FileType,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
}

export function getFileIcon(filePath: string, isDir: boolean, isOpen?: boolean): LucideIcon {
  if (isDir) return isOpen ? FolderOpen : Folder
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? File
}

export { Terminal as TerminalIcon, Globe as BrowserIcon }
