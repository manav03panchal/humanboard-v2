import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useThemeStore } from '../lib/theme'
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'image-shape': {
      w: number
      h: number
      filePath: string
    }
  }
}

export type ImageShape = TLShape<'image-shape'>

export class ImageShapeUtil extends BaseBoxShapeUtil<ImageShape> {
  static override type = 'image-shape' as const
  static override props: RecordProps<ImageShape> = {
    w: T.number,
    h: T.number,
    filePath: T.string,
  }

  override getDefaultProps(): ImageShape['props'] {
    return { w: 500, h: 400, filePath: '' }
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

  override component(shape: ImageShape) {
    return <ImageShapeComponent shape={shape} />
  }

  override indicator(shape: ImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function ImageShapeComponent({ shape }: { shape: ImageShape }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  useEffect(() => {
    if (!vaultPath || !shape.props.filePath) return
    invoke<string>('read_file_base64', {
      vaultRoot: vaultPath,
      filePath: shape.props.filePath,
    })
      .then(setDataUrl)
      .catch((err) => setError(String(err)))
  }, [vaultPath, shape.props.filePath])

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
          border: `1px solid #f44`,
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
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
        }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={shape.props.filePath}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
        ) : (
          <span style={{ color: '#888' }}>Loading...</span>
        )}
      </div>
    </HTMLContainer>
  )
}
