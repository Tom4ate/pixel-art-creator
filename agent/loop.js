import { ChatGroq } from '@langchain/groq';
import { RateLimiter } from './rateLimiter.js';
import { createTools } from './tools.js';
import 'dotenv/config';

const rateLimiter = new RateLimiter();

function buildModel() {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0.7,
    maxTokens: 2048,
  });
}

function buildSystemPrompt(width, height) {
  return {
    role: 'system',
    content: `You are a pixel art assistant. The canvas is ${width}x${height} pixels.

RULES:
1. Use drawing tools (draw_pixel, draw_rect, draw_line, fill_area, set_background, clear_canvas, undo) to create pixel art.
2. Call get_canvas_preview after drawing to examine the current result.
3. If the result is not satisfactory, make corrections by calling more drawing tools.
4. Keep iterating: draw → preview → correct → preview → repeat until it looks right.
5. Call finish(summary) ONLY when you are fully satisfied with the result.
6. If the user just asks a question, answer it and call finish() when done.
7. Always respond in the same language as the user.`,
  };
}

function buildUserMessage(text) {
  return { role: 'user', content: text };
}

export async function agentLoop(userText, canvasState, io) {
  const model = buildModel();
  const tools = createTools(canvasState);
  const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));

  const toolDefs = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }));

  const messages = [buildSystemPrompt(canvasState.width, canvasState.height)];
  messages.push(buildUserMessage(userText));

  let toolCallCount = 0;
  const maxToolCalls = 100;
  let hasCalledTool = false;
  let textOnlyCount = 0;
  const maxTextOnly = 3;

  for (let i = 0; i < 50; i++) {
    let result;
    try {
      result = await rateLimiter.withRetry(() =>
        model.invoke(messages, { tools: toolDefs })
      );
    } catch (err) {
      if (err.message?.includes('tool_use')) {
        continue;
      }
      return `Erro: ${err.message}`;
    }

    const content = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    if (!result.tool_calls || result.tool_calls.length === 0) {
      if (hasCalledTool) {
        textOnlyCount++;
        messages.push({ role: 'assistant', content });
        if (textOnlyCount >= maxTextOnly) {
          return content;
        }
        continue;
      }
      return content;
    }

    textOnlyCount = 0;

    for (const tc of result.tool_calls) {
      if (toolCallCount >= maxToolCalls) {
        return 'Número máximo de ações atingido.';
      }
      toolCallCount++;

      const toolFn = toolMap[tc.name];
      if (!toolFn) {
        messages.push({ role: 'assistant', content: '', tool_calls: [tc] });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
        });
        continue;
      }

      let parsed;
      try {
        parsed = toolFn.schema.parse(tc.args);
      } catch (err) {
        messages.push({ role: 'assistant', content: '', tool_calls: [tc] });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message }),
        });
        continue;
      }

      const output = toolFn.execute(parsed);

      if (tc.name === 'finish') {
        if (io) io.emit('canvas-update', canvasState.toJSON());
        return output.summary;
      }

      hasCalledTool = true;
      messages.push({ role: 'assistant', content: '', tool_calls: [tc] });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(output),
      });

      if (io && tc.name !== 'get_canvas_preview') {
        io.emit('canvas-update', canvasState.toJSON());
      }
    }
  }

  const lastMsg = messages.filter(m => m.role === 'assistant' && m.content).pop();
  return lastMsg?.content || 'Hmm, não consegui terminar a tempo. Tente ser mais específico.';
}
