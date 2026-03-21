import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useLinkStore } from '../stores/linkStore'
import { useVaultStore } from '../stores/vaultStore'
import { useThemeStore } from '../lib/theme'
import { Network } from 'lucide-react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
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
    return false
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
  const graph = useLinkStore((s) => s.graphData)
  const scanAllFiles = useLinkStore((s) => s.scanAllFiles)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const getAccentColor = useThemeStore((s) => s.getAccentColor)
  const getSurfaceBackground = useThemeStore((s) => s.getSurfaceBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getTextMuted = useThemeStore((s) => s.getTextMuted)

  const { w, h } = shape.props
  const svgHeight = h - 32

  // Scan all .md files when vault is open or changes
  useEffect(() => {
    if (vaultPath) {
      scanAllFiles(vaultPath)
    }
  }, [vaultPath, scanAllFiles])

  // Filter to only .md nodes
  const filteredGraph = useMemo(() => {
    const mdNodes = graph.nodes.filter((n) => n.endsWith('.md'))
    const mdSet = new Set(mdNodes)
    const mdEdges = graph.edges.filter(([s, t]) => mdSet.has(s) && mdSet.has(t))
    return { nodes: mdNodes, edges: mdEdges }
  }, [graph])

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

    if (filteredGraph.nodes.length === 0) {
      setNodePositions(new Map())
      setLinkPositions([])
      return
    }

    const cx = w / 2
    const cy = svgHeight / 2
    const padding = 40

    const nodes: GraphNode[] = filteredGraph.nodes.map((id) => ({
      id,
      label: id.split('/').pop()?.replace('.md', '') ?? id,
      // Start near center
      x: cx + (Math.random() - 0.5) * 100,
      y: cy + (Math.random() - 0.5) * 100,
    }))

    const links: GraphLink[] = filteredGraph.edges.map(([source, target]) => ({
      source,
      target,
    }))

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(100)
          .strength(0.3)
      )
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(cx, cy).strength(0.1))
      .force('collide', forceCollide(35))
      // Keep nodes within bounds
      .force('x', forceX(cx).strength(0.05))
      .force('y', forceY(cy).strength(0.05))
      .alphaDecay(0.02)

    simulationRef.current = simulation

    let tickCount = 0
    simulation.on('tick', () => {
      tickCount++
      // Throttle React updates — render every 3rd tick to reduce re-render overhead
      if (tickCount % 3 !== 0 && simulation.alpha() > simulation.alphaMin() + 0.01) return

      const positions = new Map<string, { x: number; y: number }>()
      for (const node of nodes) {
        node.x = Math.max(padding, Math.min(w - padding, node.x ?? cx))
        node.y = Math.max(padding, Math.min(svgHeight - padding, node.y ?? cy))
        positions.set(node.id, { x: node.x, y: node.y })
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
  }, [filteredGraph.nodes.length, filteredGraph.edges.length, w, svgHeight])

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation()
      e.preventDefault()
      window.dispatchEvent(
        new CustomEvent('humanboard:open-file', {
          detail: { filePath, language: 'markdown', animate: true },
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

  // Stop wheel from zooming canvas
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, true)
    return () => el.removeEventListener('wheel', stop, true)
  }, [])

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
        label={`Graph View — ${filteredGraph.nodes.length} files, ${filteredGraph.edges.length} links`}
        icon={Network}
      />
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden' }}
        onPointerDown={stopEvent}
        onPointerMove={stopEvent}
        onPointerUp={stopEvent}
      >
        {filteredGraph.nodes.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: textMuted,
              fontSize: 13,
              fontFamily: '"JetBrains Mono", Menlo, Monaco, monospace',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <Network size={24} strokeWidth={1} color={textMuted} />
            No [[wikilink]] connections found in .md files
          </div>
        ) : (
          <svg
            width={w}
            height={svgHeight}
            viewBox={`0 0 ${w} ${svgHeight}`}
            style={{ display: 'block' }}
          >
            {/* Edges */}
            {linkPositions.map((link, i) => (
              <line
                key={i}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={borderColor}
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            ))}
            {/* Nodes */}
            {filteredGraph.nodes.map((nodeId) => {
              const pos = nodePositions.get(nodeId)
              if (!pos) return null
              const label = nodeId.split('/').pop()?.replace('.md', '') ?? nodeId
              // Scale node size by number of connections
              const connections = filteredGraph.edges.filter(
                ([s, t]) => s === nodeId || t === nodeId
              ).length
              const radius = Math.max(4, Math.min(12, 4 + connections * 2))
              return (
                <g
                  key={nodeId}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleNodeClick(e, nodeId)}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    fill={accentColor}
                    fillOpacity={0.8}
                    stroke={accentColor}
                    strokeWidth={1}
                    strokeOpacity={0.4}
                  />
                  <text
                    x={pos.x + radius + 6}
                    y={pos.y + 4}
                    fill={fg}
                    fontSize={11}
                    fontFamily='"JetBrains Mono", Menlo, Monaco, monospace'
                    fillOpacity={0.8}
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
