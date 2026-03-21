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

    // Dev-only: bypass welcome screen via ?vault=/path for browser testing
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search)
      const devVault = params.get('vault')
      if (devVault && !useVaultStore.getState().vaultPath) {
        useVaultStore.setState({ vaultPath: devVault })
      }
    }
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
