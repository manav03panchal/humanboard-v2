import { describe, it, expect } from 'vitest'
import { getFileIcon } from '../lib/fileIcons'
import { Image, File, Folder, FolderOpen, FileType, FileText } from 'lucide-react'
import { SiTypescript, SiReact, SiJavascript, SiRust, SiPython, SiCss, SiHtml5, SiMarkdown } from 'react-icons/si'
import { VscJson } from 'react-icons/vsc'

describe('getFileIcon', () => {
  it('returns Folder for directories', () => {
    expect(getFileIcon('src', true)).toBe(Folder)
  })

  it('returns FolderOpen for open directories', () => {
    expect(getFileIcon('src', true, true)).toBe(FolderOpen)
  })

  it('returns language icons for code files', () => {
    expect(getFileIcon('main.ts', false)).toBe(SiTypescript)
    expect(getFileIcon('App.tsx', false)).toBe(SiReact)
    expect(getFileIcon('index.js', false)).toBe(SiJavascript)
    expect(getFileIcon('Component.jsx', false)).toBe(SiReact)
    expect(getFileIcon('main.rs', false)).toBe(SiRust)
    expect(getFileIcon('script.py', false)).toBe(SiPython)
    expect(getFileIcon('styles.css', false)).toBe(SiCss)
    expect(getFileIcon('index.html', false)).toBe(SiHtml5)
  })

  it('returns VscJson for json files', () => {
    expect(getFileIcon('package.json', false)).toBe(SiJavascript) // package.json has special name icon
  })

  it('returns SiMarkdown for markdown files', () => {
    expect(getFileIcon('README.md', false)).toBe(SiMarkdown)
  })

  it('returns FileText for txt files', () => {
    expect(getFileIcon('notes.txt', false)).toBe(FileText)
  })

  it('returns FileType for PDF files', () => {
    expect(getFileIcon('document.pdf', false)).toBe(FileType)
  })

  it('returns Image for image files', () => {
    expect(getFileIcon('photo.png', false)).toBe(Image)
    expect(getFileIcon('photo.jpg', false)).toBe(Image)
    expect(getFileIcon('photo.jpeg', false)).toBe(Image)
    expect(getFileIcon('photo.gif', false)).toBe(Image)
    expect(getFileIcon('icon.svg', false)).toBe(Image)
    expect(getFileIcon('image.webp', false)).toBe(Image)
  })

  it('returns generic File for unknown extensions', () => {
    expect(getFileIcon('file.xyz', false)).toBe(File)
    expect(getFileIcon('archive.tar', false)).toBe(File)
  })

  it('returns generic File for files with no extension', () => {
    expect(getFileIcon('Makefile', false)).toBe(File)
  })

  it('returns special icons for known filenames', () => {
    expect(getFileIcon('Cargo.toml', false)).toBe(SiRust)
    expect(getFileIcon('tsconfig.json', false)).toBe(SiTypescript)
    expect(getFileIcon('package.json', false)).toBe(SiJavascript)
  })
})
