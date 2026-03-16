import {
  FileText, Image, File, Folder, FolderOpen, FileType, Music,
} from 'lucide-react'
import {
  SiTypescript, SiJavascript, SiReact, SiRust, SiPython, SiCss, SiHtml5,
  SiMarkdown, SiToml, SiYaml, SiDocker, SiGit, SiGnubash,
} from 'react-icons/si'
import { VscJson } from 'react-icons/vsc'
import type { LucideIcon } from 'lucide-react'
import type { IconType } from 'react-icons'

type AnyIcon = LucideIcon | IconType

const EXT_ICONS: Record<string, AnyIcon> = {
  ts: SiTypescript,
  tsx: SiReact,
  js: SiJavascript,
  jsx: SiReact,
  rs: SiRust,
  py: SiPython,
  css: SiCss,
  html: SiHtml5,
  json: VscJson,
  md: SiMarkdown,
  toml: SiToml,
  yaml: SiYaml,
  yml: SiYaml,
  txt: FileText,
  pdf: FileType,
  sh: SiGnubash,
  bash: SiGnubash,
  zsh: SiGnubash,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
  mp3: Music, wav: Music, ogg: Music, flac: Music, aac: Music, m4a: Music,
}

const NAME_ICONS: Record<string, AnyIcon> = {
  Dockerfile: SiDocker,
  '.gitignore': SiGit,
  '.gitmodules': SiGit,
  'Cargo.toml': SiRust,
  'Cargo.lock': SiRust,
  'tsconfig.json': SiTypescript,
  'package.json': SiJavascript,
  'bun.lock': SiJavascript,
}

export function getFileIcon(filePath: string, isDir: boolean, isOpen?: boolean): AnyIcon {
  if (isDir) return isOpen ? FolderOpen : Folder
  const name = filePath.split('/').pop() ?? ''
  if (NAME_ICONS[name]) return NAME_ICONS[name]
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? File
}
