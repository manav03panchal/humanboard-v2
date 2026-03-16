import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useLinkStore } from '../stores/linkStore'
import { useThemeStore } from '../lib/theme'
import { Network } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'graph-shape': { w: number; h: number }
  }
}

export type GraphShape = TLShape<'graph-shape'>

export class GraphShapeUtil extends BaseBoxShapeUtil<GraphShape> {
  static override type = 'graph-shape' as const
  static override props: RecordProps<GraphShape> = {
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): GraphShape['props'] {
    return { w: 600, h: 500 }
  }

  override canEdit() {
    return true
  }

  override canResize() {
    return true
  }

  canRotate() {
    return false
  }

  override component(shape: GraphShape) {
    return <GraphShapeComponent shape={shape} />
  }

  override indicator(shape: GraphShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

interface GraphNode extends SimulationNodeDatum {
  id: string
  label: string
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

function GraphShapeComponent({ shape }: { shape: GraphShape }) {
  const graph = useLinkStore((s) => s.getGraph())
  const getAccentColor = useThemeStore((s) => s.getAccentColor)
  const getSurfaceBackground = useThemeStore((s) => s.getSurfaceBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getTextMuted = useThemeStore((s) => s.getTextMuted)

  const { w, h } = shape.props
  const svgHeight = h - 32 // account for title bar

  const [nodePositions, setNodePositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map())
  const [linkPositions, setLinkPositions] = useState<
    { source: { x: number; y: number }; target: { x: number; y: number } }[]
  >([])

  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null)

  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }

    if (graph.nodes.length === 0) {
      setNodePositions(new Map())
      setLinkPositions([])
      return
    }

    const nodes: GraphNode[] = graph.nodes.map((id) => ({
      id,
      label: id.split('/').pop()?.replace('.md', '') ?? id,
    }))

    const links: GraphLink[] = graph.edges.map(([source, target]) => ({
      source,
      target,
    }))

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(80)
      )
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(w / 2, svgHeight / 2))
      .force('collide', forceCollide(30))

    simulationRef.current = simulation

    simulation.on('tick', () => {
      const positions = new Map<string, { x: number; y: number }>()
      for (const node of nodes) {
        positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 })
      }
      setNodePositions(new Map(positions))

      const lp = links.map((link) => {
        const s = link.source as GraphNode
        const t = link.target as GraphNode
        return {
          source: { x: s.x ?? 0, y: s.y ?? 0 },
          target: { x: t.x ?? 0, y: t.y ?? 0 },
        }
      })
      setLinkPositions([...lp])
    })

    return () => {
      simulation.stop()
    }
  }, [graph.nodes.length, graph.edges.length, w, svgHeight])

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation()
      e.preventDefault()
      window.dispatchEvent(
        new CustomEvent('humanboard:open-file', {
          detail: { filePath, language: 'markdown' },
        })
      )
    },
    []
  )

  const accentColor = getAccentColor()
  const surfaceBg = getSurfaceBackground()
  const borderColor = getBorderColor()
  const fg = getEditorForeground()
  const textMuted = getTextMuted()

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: surfaceBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        pointerEvents: 'all',
      }}
    >
      <NodeTitleBar
        filePath=""
        isDirty={false}
        shapeId={shape.id as string}
        label="Graph View"
        icon={Network}
      />
      <div
        style={{ flex: 1, overflow: 'hidden' }}
        onPointerDown={stopEvent}
        onPointerMove={stopEvent}
        onPointerUp={stopEvent}
      >
        {graph.nodes.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: textMuted,
              fontSize: 13,
              fontFamily:
                '"Iosevka Nerd Font Mono", "Iosevka", Menlo, Monaco, monospace',
            }}
          >
            No wikilink connections found
          </div>
        ) : (
          <svg
            width={w}
            height={svgHeight}
            viewBox={`0 0 ${w} ${svgHeight}`}
            style={{ display: 'block' }}
          >
            {linkPositions.map((link, i) => (
              <line
                key={i}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke="#333"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            ))}
            {graph.nodes.map((nodeId) => {
              const pos = nodePositions.get(nodeId)
              if (!pos) return null
              const label =
                nodeId.split('/').pop()?.replace('.md', '') ?? nodeId
              return (
                <g
                  key={nodeId}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleNodeClick(e, nodeId)}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={6}
                    fill={accentColor}
                    stroke={borderColor}
                    strokeWidth={1}
                  />
                  <text
                    x={pos.x + 10}
                    y={pos.y + 4}
                    fill={fg}
                    fontSize={11}
                    fontFamily='"Iosevka Nerd Font Mono", "Iosevka", Menlo, Monaco, monospace'
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </HTMLContainer>
  )
}
