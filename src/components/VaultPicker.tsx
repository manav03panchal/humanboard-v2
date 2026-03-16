import { open } from '@tauri-apps/plugin-dialog'
import { useVaultStore } from '../stores/vaultStore'

export function VaultPicker() {
  const setVaultPath = useVaultStore((s) => s.setVaultPath)
  const recentVaults = useVaultStore((s) => s.recentVaults)

  const handleOpen = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (selected) {
      setVaultPath(selected)
    }
  }

  return (
    <div className="vault-picker">
      <div className="vault-picker-content">
        <h1 className="vault-picker-title">Humanboard</h1>
        <p className="vault-picker-subtitle">Open a folder to get started</p>
        <button className="vault-picker-btn" onClick={handleOpen}>
          Open Folder
        </button>
        {recentVaults.length > 0 && (
          <div className="vault-picker-recent">
            <h3>Recent</h3>
            {recentVaults.map((v) => (
              <button
                key={v}
                className="vault-picker-recent-item"
                onClick={() => setVaultPath(v)}
              >
                {v.split('/').pop()}
                <span className="vault-picker-recent-path">{v}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
