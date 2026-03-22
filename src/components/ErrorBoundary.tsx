import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 16,
            color: 'var(--hb-text-muted, #888)',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 14,
          }}
        >
          <span>Something went wrong</span>
          {this.state.error && (
            <span style={{ fontSize: 12, maxWidth: 400, textAlign: 'center', opacity: 0.6 }}>
              {this.state.error.message}
            </span>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              background: 'var(--hb-surface, #1a1a1a)',
              color: 'var(--hb-text, #ccc)',
              border: '1px solid var(--hb-border, #333)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
