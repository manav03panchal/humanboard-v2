import { useState, useEffect } from 'react'
import './App.css'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useVaultStore } from './stores/vaultStore'
import { useFileStore } from './stores/fileStore'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { VaultPicker } from './components/VaultPicker'

function App() {
  useKeyboardShortcuts()

  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults)
  const openFile = useFileStore((s) => s.openFile)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    loadRecentVaults()
  }, [loadRecentVaults])

  const handleSelectFile = async (filePath: string) => {
    if (vaultPath) {
      await openFile(vaultPath, filePath)
      setSelectedFile(filePath)
    }
  }

  if (!vaultPath) {
    return <VaultPicker />
  }

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-title">Humanboard</span>
        <span className="navbar-vault">{vaultPath.split('/').pop()}</span>
      </nav>
      <div className="main-content">
        <Sidebar selectedFile={selectedFile} onSelectFile={handleSelectFile} />
        <Editor filePath={selectedFile} />
      </div>
    </div>
  )
}

export default App
