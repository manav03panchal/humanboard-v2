import type Anthropic from '@anthropic-ai/sdk'

export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'click',
    description:
      'Click an element on the page identified by a CSS selector. Use this to interact with buttons, links, checkboxes, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type',
    description:
      'Type text into an input element identified by a CSS selector. The element will be focused first, then the text will be entered.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'Text to type into the element',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the browser to a specific URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (must be https://)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page in a given direction by a specified amount in pixels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Direction to scroll',
        },
        amount: {
          type: 'number',
          description: 'Amount to scroll in pixels (default: 300)',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'screenshot',
    description:
      'Capture the current visible state of the page. Returns a description of visible elements. Use this to understand the current page state before taking actions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_text',
    description:
      'Extract text content from an element identified by a CSS selector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to extract text from',
        },
      },
      required: ['selector'],
    },
  },
]

export interface ToolExecutor {
  click(selector: string): Promise<string>
  type(selector: string, text: string): Promise<string>
  navigate(url: string): Promise<string>
  scroll(direction: string, amount?: number): Promise<string>
  screenshot(): Promise<string>
  getText(selector: string): Promise<string>
}

export function createIframeToolExecutor(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  setUrl: (url: string) => void,
): ToolExecutor {
  function getDocument(): Document {
    const doc = iframeRef.current?.contentDocument
    if (!doc) {
      throw new Error(
        'Cannot access page content. The page may be cross-origin restricted.',
      )
    }
    return doc
  }

  return {
    async click(selector: string): Promise<string> {
      const doc = getDocument()
      const el = doc.querySelector(selector)
      if (!el) return `Error: No element found matching selector "${selector}"`
      ;(el as HTMLElement).click()
      return `Clicked element matching "${selector}"`
    },

    async type(selector: string, text: string): Promise<string> {
      const doc = getDocument()
      const el = doc.querySelector(selector) as HTMLInputElement | null
      if (!el) return `Error: No element found matching selector "${selector}"`
      el.focus()
      // Use input event to trigger React/framework handlers
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, text)
      } else {
        el.value = text
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return `Typed "${text}" into element matching "${selector}"`
    },

    async navigate(url: string): Promise<string> {
      if (!url.startsWith('https://')) {
        return 'Error: URL must start with https://'
      }
      setUrl(url)
      return `Navigating to ${url}`
    },

    async scroll(direction: string, amount = 300): Promise<string> {
      const doc = getDocument()
      const scrollMap: Record<string, [number, number]> = {
        up: [0, -amount],
        down: [0, amount],
        left: [-amount, 0],
        right: [amount, 0],
      }
      const [x, y] = scrollMap[direction] ?? [0, 0]
      doc.defaultView?.scrollBy(x, y)
      return `Scrolled ${direction} by ${amount}px`
    },

    async screenshot(): Promise<string> {
      try {
        const doc = getDocument()
        const body = doc.body
        if (!body) return 'Page has no body content'

        // Build a text representation of visible elements
        const elements: string[] = []
        const walk = (el: Element, depth: number) => {
          if (depth > 4) return
          const tag = el.tagName.toLowerCase()
          const text = el.textContent?.trim().slice(0, 100)
          const href = el.getAttribute('href')
          const type = el.getAttribute('type')
          const placeholder = el.getAttribute('placeholder')
          const id = el.id ? `#${el.id}` : ''
          const cls = el.className && typeof el.className === 'string'
            ? `.${el.className.split(' ').slice(0, 2).join('.')}`
            : ''

          if (
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            tag === 'button' ||
            tag === 'a'
          ) {
            let desc = `<${tag}${id}${cls}`
            if (type) desc += ` type="${type}"`
            if (placeholder) desc += ` placeholder="${placeholder}"`
            if (href) desc += ` href="${href}"`
            if (text && tag !== 'input') desc += ` "${text.slice(0, 60)}"`
            desc += '>'
            elements.push('  '.repeat(depth) + desc)
          } else if (text && text.length > 0 && ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'li', 'td', 'th', 'label', 'div'].includes(tag)) {
            if (el.children.length === 0 || tag.startsWith('h')) {
              elements.push('  '.repeat(depth) + `<${tag}${id}${cls}> "${text.slice(0, 80)}"`)
            }
          }

          for (const child of el.children) {
            walk(child, depth + 1)
          }
        }
        walk(body, 0)

        const title = doc.title || 'Untitled'
        const url = doc.location?.href || 'unknown'

        if (elements.length === 0) {
          return `Page: "${title}" (${url})\nNo interactive or text elements detected. The page may be loading or mostly visual.`
        }

        return `Page: "${title}" (${url})\n\nVisible elements:\n${elements.slice(0, 50).join('\n')}`
      } catch {
        return 'Cannot access page content — cross-origin restriction. Try navigating to a same-origin page or use navigate() to change the URL.'
      }
    },

    async getText(selector: string): Promise<string> {
      const doc = getDocument()
      const el = doc.querySelector(selector)
      if (!el) return `Error: No element found matching selector "${selector}"`
      return el.textContent?.trim() || '(empty)'
    },
  }
}

export async function executeToolCall(
  executor: ToolExecutor,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'click':
      return executor.click(toolInput.selector as string)
    case 'type':
      return executor.type(
        toolInput.selector as string,
        toolInput.text as string,
      )
    case 'navigate':
      return executor.navigate(toolInput.url as string)
    case 'scroll':
      return executor.scroll(
        toolInput.direction as string,
        toolInput.amount as number | undefined,
      )
    case 'screenshot':
      return executor.screenshot()
    case 'get_text':
      return executor.getText(toolInput.selector as string)
    default:
      return `Unknown tool: ${toolName}`
  }
}
