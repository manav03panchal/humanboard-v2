import { memo } from 'react'
import { create } from 'zustand'
import { X } from 'lucide-react'

interface ToastItem {
  id: number
  message: string
  type: 'error' | 'info'
}

interface ToastStore {
  toasts: ToastItem[]
  addToast: (message: string, type?: 'error' | 'info') => void
  removeToast: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'error') => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const ToastContainer = memo(function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '10px 16px',
            backgroundColor: toast.type === 'error' ? '#1a0000' : 'var(--hb-surface)',
            border: `1px solid ${toast.type === 'error' ? '#330000' : 'var(--hb-border)'}`,
            borderRadius: 8,
            color: 'var(--hb-fg)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 360,
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--hb-text-muted)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
})
