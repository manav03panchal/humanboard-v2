import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'
import { usePlatform } from '../hooks/usePlatform'

export function WindowTitleBar() {
  const os = usePlatform()

  if (os === 'macos') return null

  const appWindow = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        backgroundColor: '#000',
        borderBottom: '1px solid #1a1a1a',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex' }}>
        <button
          onClick={() => appWindow.minimize()}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          style={windowBtnStyle}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          style={windowBtnStyle}
          title="Maximize"
        >
          <Square size={10} />
        </button>
        <button
          onClick={() => appWindow.close()}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e81123')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          style={windowBtnStyle}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

const windowBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#999',
  cursor: 'pointer',
  padding: '8px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
