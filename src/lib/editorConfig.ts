import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

export const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  bracketMatching: true,
  autocompletion: false,
} as const

// Allow KaTeX and highlight.js class names through sanitization
export const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className', 'style'],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon'],
}

export const remarkPlugins = [remarkMath]
export const rehypePlugins: any[] = [[rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]
