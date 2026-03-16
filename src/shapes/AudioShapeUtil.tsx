import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useThemeStore } from '../lib/theme'
import { useMemo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'audio-shape': {
      w: number
      h: number
      filePath: string
    }
  }
}

export type AudioShape = TLShape<'audio-shape'>

export class AudioShapeUtil extends BaseBoxShapeUtil<AudioShape> {
  static override type = 'audio-shape' as const
  static override props: RecordProps<AudioShape> = {
    w: T.number,
    h: T.number,
    filePath: T.string,
  }

  override getDefaultProps(): AudioShape['props'] {
    return { w: 400, h: 140, filePath: '' }
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

  override component(shape: AudioShape) {
    return <AudioShapeComponent shape={shape} />
  }

  override indicator(shape: AudioShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function AudioShapeComponent({ shape }: { shape: AudioShape }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  const audioSrc = useMemo(() => {
    if (!vaultPath || !shape.props.filePath) return null
    const fullPath = `${vaultPath}/${shape.props.filePath}`
    return convertFileSrc(fullPath)
  }, [vaultPath, shape.props.filePath])

  const editorBg = getEditorBackground()
  const borderColor = getBorderColor()

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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 16px',
          pointerEvents: 'all',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {audioSrc ? (
          <audio
            src={audioSrc}
            controls
            style={{
              width: '100%',
              height: 40,
              filter: 'invert(1)',
            }}
          />
        ) : (
          <span style={{ color: '#888' }}>No file</span>
        )}
      </div>
    </HTMLContainer>
  )
}
