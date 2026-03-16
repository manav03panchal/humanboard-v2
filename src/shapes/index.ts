/**
 * Shape registry — add new shape utils here for Phase 2.
 *
 * To add a new shape (e.g. TerminalShape):
 *   1. Create src/shapes/TerminalShapeUtil.tsx extending BaseBoxShapeUtil
 *   2. Import and add it to the customShapeUtils array below
 *   3. The Canvas component picks it up automatically
 */
import { CodeShapeUtil } from './CodeShapeUtil'
import { ImageShapeUtil } from './ImageShapeUtil'
import { MarkdownShapeUtil } from './MarkdownShapeUtil'
import { TerminalShapeUtil } from './TerminalShapeUtil'

export const customShapeUtils = [
  CodeShapeUtil,
  ImageShapeUtil,
  MarkdownShapeUtil,
  TerminalShapeUtil,
]
