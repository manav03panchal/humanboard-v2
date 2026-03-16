import { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { LandingScreen } from './components/LandingScreen'
import { Workspace } from './components/Workspace'
import { ToastContainer } from './components/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import './App.css'

function App() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults)

  useEffect(() => {
    loadRecentVaults()
  }, [loadRecentVaults])

  useKeyboardShortcuts()

  return (
    <>
      {vaultPath ? <Workspace /> : <LandingScreen />}
      <ToastContainer />
    </>
  )
}

export default App
