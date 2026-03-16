export function getFileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

export function getRelativePath(filePath: string): string {
  return filePath
}

export function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}
