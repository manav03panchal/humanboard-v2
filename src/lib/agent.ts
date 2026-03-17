import Anthropic from '@anthropic-ai/sdk'
import { useAgentStore } from '../stores/agentStore'
import { AGENT_TOOLS, executeToolCall, type ToolExecutor } from './agentTools'

const SYSTEM_PROMPT = `You are a browser automation agent. You can interact with web pages using the provided tools.

Your workflow:
1. First, use the screenshot tool to understand the current page state
2. Analyze the visible elements and plan your actions
3. Execute actions (click, type, scroll, navigate) to accomplish the user's task
4. After each action, take a new screenshot to verify the result
5. Continue until the task is complete or you determine it cannot be done

Important guidelines:
- Always take a screenshot first to understand the page before acting
- Use specific CSS selectors when clicking or typing
- If an action fails, try an alternative approach
- Report what you're doing at each step
- When the task is complete, provide a clear summary of what was accomplished`

export async function runAgentLoop(
  prompt: string,
  toolExecutor: ToolExecutor,
): Promise<void> {
  const store = useAgentStore.getState()
  const { apiKey, model, maxIterations } = store

  if (!apiKey) {
    store.addMessage({
      role: 'error',
      content: 'No API key set. Please add your Anthropic API key in settings.',
    })
    store.setStatus('error')
    return
  }

  const abortController = new AbortController()
  store.setAbortController(abortController)
  store.setStatus('running')
  store.setIteration(0)
  store.addMessage({ role: 'user', content: prompt })

  let client: Anthropic
  try {
    client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    })
  } catch (err) {
    store.addMessage({
      role: 'error',
      content: `Failed to initialize API client: ${err instanceof Error ? err.message : String(err)}`,
    })
    store.setStatus('error')
    return
  }

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: prompt },
  ]

  let iteration = 0

  try {
    while (iteration < maxIterations) {
      if (abortController.signal.aborted) {
        store.addMessage({ role: 'status', content: 'Agent stopped by user.' })
        store.setStatus('stopped')
        return
      }

      iteration++
      store.setIteration(iteration)

      const stream = client.messages.stream(
        {
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: AGENT_TOOLS,
          messages,
        },
        { signal: abortController.signal },
      )

      // Stream text deltas to the UI
      let currentText = ''
      stream.on('text', (delta) => {
        currentText += delta
        // Update the last assistant message in real-time
        const msgs = useAgentStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg?.role === 'assistant') {
          // Update in place for streaming effect
          const updated = [...msgs]
          updated[updated.length - 1] = {
            ...lastMsg,
            content: currentText,
          }
          useAgentStore.setState({ messages: updated })
        } else {
          store.addMessage({ role: 'assistant', content: currentText })
        }
      })

      const message = await stream.finalMessage()

      // Ensure the final text is captured
      const textBlocks = message.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )
      if (textBlocks.length > 0) {
        const finalText = textBlocks.map((b) => b.text).join('')
        if (finalText && finalText !== currentText) {
          // Update to final text
          const msgs = useAgentStore.getState().messages
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg?.role === 'assistant') {
            const updated = [...msgs]
            updated[updated.length - 1] = {
              ...lastMsg,
              content: finalText,
            }
            useAgentStore.setState({ messages: updated })
          }
        }
      }

      if (message.stop_reason === 'end_turn') {
        store.setStatus('idle')
        store.setCurrentAction(null)
        return
      }

      if (message.stop_reason !== 'tool_use') {
        store.setStatus('idle')
        store.setCurrentAction(null)
        return
      }

      // Process tool calls
      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )

      messages.push({ role: 'assistant', content: message.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUseBlocks) {
        const actionLabel = formatToolAction(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        )
        store.setCurrentAction(actionLabel)
        store.addMessage({ role: 'tool_call', content: actionLabel })

        try {
          const result = await executeToolCall(
            toolExecutor,
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          )
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          })
          store.addMessage({ role: 'tool_result', content: result })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: errorMsg,
            is_error: true,
          })
          store.addMessage({
            role: 'error',
            content: `Tool error: ${errorMsg}`,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })
      store.setCurrentAction(null)
    }

    // Max iterations reached
    store.addMessage({
      role: 'status',
      content: `Reached maximum iterations (${maxIterations}). Agent stopped.`,
    })
    store.setStatus('max_iterations')
  } catch (err) {
    if (abortController.signal.aborted) {
      store.addMessage({ role: 'status', content: 'Agent stopped by user.' })
      store.setStatus('stopped')
      return
    }

    const errorMessage = getErrorMessage(err)
    store.addMessage({ role: 'error', content: errorMessage })
    store.setStatus('error')
  } finally {
    store.setCurrentAction(null)
    store.setAbortController(null)
  }
}

export function stopAgent(): void {
  const { abortController } = useAgentStore.getState()
  if (abortController) {
    abortController.abort()
  }
}

function formatToolAction(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case 'click':
      return `Clicking "${input.selector}"...`
    case 'type':
      return `Typing "${(input.text as string)?.slice(0, 30)}${(input.text as string)?.length > 30 ? '...' : ''}" into "${input.selector}"...`
    case 'navigate':
      return `Navigating to ${input.url}...`
    case 'scroll':
      return `Scrolling ${input.direction}...`
    case 'screenshot':
      return 'Taking screenshot...'
    case 'get_text':
      return `Getting text from "${input.selector}"...`
    default:
      return `Running ${name}...`
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Invalid API key. Please check your Anthropic API key in settings.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limit exceeded. Please wait a moment and try again.'
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 400) {
      return `Bad request: ${err.message}`
    }
    return `API error (${err.status}): ${err.message}`
  }
  if (err instanceof Error) {
    if (err.message.includes('fetch')) {
      return 'Network error. Please check your internet connection.'
    }
    return err.message
  }
  return String(err)
}
