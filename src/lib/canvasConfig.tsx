import {
  DefaultToolbar,
  DefaultToolbarContent,
  DefaultStylePanel,
  DefaultStylePanelContent,
  type TLComponents,
} from 'tldraw'

export const TLDRAW_OPTIONS = {
  maxPages: 1,
  // Debounced zoom: use cached rendering during camera movement.
  // Our shapes (CodeMirror, xterm) are heavy — rendering them at every
  // zoom frame kills perf. Low threshold since each shape is expensive.
  debouncedZoom: true,
  debouncedZoomThreshold: 50,
  // Snappier animations (default ~500ms feels sluggish)
  animationMediumMs: 200,
  animationShortMs: 100,
  // Disable text shadows at low zoom (saves GPU compositing)
  textShadowLod: 0.5,
} as const

export const tldrawComponents: TLComponents = {
  // Default toolbar + style panel (no wrapper overhead)
  Toolbar: (props) => (
    <DefaultToolbar {...props}>
      <DefaultToolbarContent />
    </DefaultToolbar>
  ),
  StylePanel: (props) => (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  ),
  // Kill unused UI — less DOM, less rendering
  MainMenu: null,
  PageMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  DebugMenu: null,
  DebugPanel: null,
  SharePanel: null,
}
