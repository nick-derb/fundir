// Provider-neutral Claude agent loop.
//
// Drives the Messages API tool-use loop: stream a turn → if the model asked for
// tools, execute them against the AgentContext and feed results back → repeat
// until the model produces a final answer. Streaming per turn preserves the live
// typing feel in the chat panel; `runAgent` drains the stream for callers (Route C)
// that want a single complete answer.

import Anthropic from '@anthropic-ai/sdk';
import type { AgentContext } from './context';
import { toAnthropicTools, type AgentTool } from './tools';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// One place to change the model. Matches the rest of the product (the advisor
// and analyzer both run on Sonnet); bump to a stronger model here if desired.
export const AGENT_MODEL = 'claude-sonnet-4-6';

export type AgentEvent =
  | { type: 'text';       text: string }
  | { type: 'tool_start'; name: string }
  | { type: 'done';       toolsUsed: string[] };

export interface RunAgentOptions {
  context:        AgentContext;
  system:         string;
  messages:       Anthropic.MessageParam[];
  tools:          AgentTool[];
  maxIterations?: number;
  maxTokens?:     number;
}

export async function* runAgentStream(opts: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const { context, system, tools } = opts;
  const anthropicTools = toAnthropicTools(tools);
  const byName = new Map(tools.map((t) => [t.name, t] as const));
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const maxIter = opts.maxIterations ?? 6;
  const maxTokens = opts.maxTokens ?? 1500;
  const toolsUsed: string[] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const stream = client.messages.stream({
      model:      AGENT_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      ...(anthropicTools.length ? { tools: anthropicTools } : {}),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    // Preserve tool_use blocks — the API needs them paired with tool_result.
    messages.push({ role: 'assistant', content: final.content });

    if (final.stop_reason !== 'tool_use') {
      yield { type: 'done', toolsUsed };
      return;
    }

    // Execute every requested tool; collect all results into ONE user turn.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      const tool = byName.get(block.name);
      yield { type: 'tool_start', name: block.name };
      toolsUsed.push(block.name);

      let result: string;
      let isError = false;
      try {
        if (!tool) { result = `Unknown tool: ${block.name}`; isError = true; }
        else       { result = await tool.execute(context, block.input as Record<string, unknown>); }
      } catch (err) {
        result = `Tool error: ${err instanceof Error ? err.message : 'execution failed'}`;
        isError = true;
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     result,
        is_error:    isError,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Safety valve — the loop hit its iteration cap without a final answer.
  yield { type: 'text', text: '\n\n_(Reached the reasoning limit for this turn — try a more specific question.)_' };
  yield { type: 'done', toolsUsed };
}

/** Drain the stream into a single answer — for non-streaming callers (Route C). */
export async function runAgent(opts: RunAgentOptions): Promise<{ text: string; toolsUsed: string[] }> {
  let text = '';
  let toolsUsed: string[] = [];
  for await (const event of runAgentStream(opts)) {
    if (event.type === 'text') text += event.text;
    else if (event.type === 'done') toolsUsed = event.toolsUsed;
  }
  return { text: text.trim(), toolsUsed };
}
