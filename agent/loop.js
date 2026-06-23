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
You have tools to draw pixels, rectangles, lines, flood fill, undo, and clear.
You can call get_canvas_preview at any time to see the current canvas.
Always respond in the same language as the user.
When the user asks you to draw something, plan your steps and use the tools.
After drawing, describe what you did. Keep responses concise.`,
  };
}

function buildUserMessage(text) {
  return { role: 'user', content: text };
}

function buildVisionUserMessage(text, dataUrl) {
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
    ],
  };
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
  const maxToolCalls = 30;

  for (let i = 0; i < 20; i++) {
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
      return content;
    }

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

  return 'Hmm, não consegui terminar a tempo. Tente ser mais específico.';
}
