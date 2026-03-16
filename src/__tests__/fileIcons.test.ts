import { describe, it, expect } from 'vitest'
import { getFileIcon } from '../lib/fileIcons'
import {
  FileCode, FileText, FileJson, Image, File, Folder, FolderOpen, FileType,
} from 'lucide-react'

describe('getFileIcon', () => {
  it('returns Folder for directories', () => {
    expect(getFileIcon('src', true)).toBe(Folder)
  })

  it('returns FolderOpen for open directories', () => {
    expect(getFileIcon('src', true, true)).toBe(FolderOpen)
  })

  it('returns FileCode for code files', () => {
    expect(getFileIcon('main.ts', false)).toBe(FileCode)
    expect(getFileIcon('App.tsx', false)).toBe(FileCode)
    expect(getFileIcon('index.js', false)).toBe(FileCode)
    expect(getFileIcon('Component.jsx', false)).toBe(FileCode)
    expect(getFileIcon('main.rs', false)).toBe(FileCode)
    expect(getFileIcon('script.py', false)).toBe(FileCode)
    expect(getFileIcon('styles.css', false)).toBe(FileCode)
    expect(getFileIcon('index.html', false)).toBe(FileCode)
  })

  it('returns FileJson for json files', () => {
    expect(getFileIcon('package.json', false)).toBe(FileJson)
  })

  it('returns FileText for text files', () => {
    expect(getFileIcon('README.md', false)).toBe(FileText)
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
})
