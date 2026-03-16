/**
 * Shape registry — add new shape utils here for Phase 2.
 *
 * To add a new shape (e.g. ImageShape, TerminalShape):
 *   1. Create src/shapes/ImageShapeUtil.tsx extending BaseBoxShapeUtil
 *   2. Import and add it to the customShapeUtils array below
 *   3. The Canvas component picks it up automatically
 */
import { CodeShapeUtil } from './CodeShapeUtil'
import { MarkdownShapeUtil } from './MarkdownShapeUtil'

// Phase 2: import { ImageShapeUtil } from './ImageShapeUtil'
// Phase 2: import { TerminalShapeUtil } from './TerminalShapeUtil'

export const customShapeUtils = [
  CodeShapeUtil,
  MarkdownShapeUtil,
  // Phase 2: ImageShapeUtil,
  // Phase 2: TerminalShapeUtil,
]
