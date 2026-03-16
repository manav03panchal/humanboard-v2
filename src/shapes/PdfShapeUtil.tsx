import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { Document, Page } from 'react-pdf'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useThemeStore } from '../lib/theme'
import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'pdf-shape': {
      w: number
      h: number
      filePath: string
    }
  }
}

export type PdfShape = TLShape<'pdf-shape'>

export class PdfShapeUtil extends BaseBoxShapeUtil<PdfShape> {
  static override type = 'pdf-shape' as const
  static override props: RecordProps<PdfShape> = {
    w: T.number,
    h: T.number,
    filePath: T.string,
  }

  override getDefaultProps(): PdfShape['props'] {
    return { w: 650, h: 800, filePath: '' }
  }

  override canEdit() {
    return false
  }

  override canResize() {
    return true
  }

  canRotate() {
    return false
  }

  override component(shape: PdfShape) {
    return <PdfShapeComponent shape={shape} />
  }

  override indicator(shape: PdfShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function PdfShapeComponent({ shape }: { shape: PdfShape }) {
  const [numPages, setNumPages] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)
  const scrollRef = useRef<HTMLDivElement>(null)

  const pdfSrc = useMemo(() => {
    if (!vaultPath || !shape.props.filePath) return null
    return convertFileSrc(`${vaultPath}/${shape.props.filePath}`)
  }, [vaultPath, shape.props.filePath])

  // Stop wheel events from reaching tldraw
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  const editorBg = getEditorBackground()
  const borderColor = getBorderColor()

  if (error) {
    return (
      <HTMLContainer
        style={{
          backgroundColor: editorBg,
          color: '#f44',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #f44',
          borderRadius: 8,
        }}
      >
        {error}
      </HTMLContainer>
    )
  }

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: editorBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <NodeTitleBar
        filePath={shape.props.filePath}
        isDirty={false}
        shapeId={shape.id}
      />
      {numPages > 0 && (
        <div style={{
          padding: '4px 12px',
          fontSize: 11,
          color: '#888',
          borderBottom: '1px solid #1a1a1a',
          textAlign: 'center',
        }}>
          {numPages} page{numPages !== 1 ? 's' : ''}
        </div>
      )}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          pointerEvents: 'all',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {pdfSrc ? (
          <Document
            file={pdfSrc}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => setError(`PDF load error: ${err.message}`)}
            loading={<span style={{ color: '#888', padding: 16 }}>Loading PDF...</span>}
          >
            {Array.from(new Array(numPages), (_, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                width={shape.props.w - 40}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<span style={{ color: '#888' }}>Loading page {index + 1}...</span>}
              />
            ))}
          </Document>
        ) : (
          <span style={{ color: '#888', padding: 16 }}>Loading...</span>
        )}
      </div>
    </HTMLContainer>
  )
}
