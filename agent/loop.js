import { ChatGroq } from '@langchain/groq';
import { RateLimiter } from './rateLimiter.js';
import { createTools } from './tools.js';
import 'dotenv/config';

const rateLimiter = new RateLimiter();

function buildModel() {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.2-11b-vision-preview',
    temperature: 0.7,
    maxTokens: 2048,
  });
}

function buildSystemPrompt(width, height) {
  return {
    role: 'system',
    content: [
      {
        type: 'text',
        text: `You are a pixel art assistant. The canvas is ${width}x${height} pixels.
You have tools to draw pixels, rectangles, lines, flood fill, undo, and clear.
You can call get_canvas_preview at any time to see the current canvas.
Always respond in the same language as the user.
When the user asks you to draw something, plan your steps and use the tools.
After drawing, describe what you did. Keep responses concise.`,
      },
    ],
  };
}

function buildUserMessage(text, canvasState) {
  const msg = { role: 'user', content: [] };
  msg.content.push({ type: 'text', text });
  return msg;
}

function groqContentFromText(text) {
  return [{ type: 'text', text }];
}

function groqContentFromToolResult(name, result) {
  if (name === 'get_canvas_preview' && result.dataUrl) {
    return [
      { type: 'text', text: `Canvas is ${result.width}x${result.height}.` },
      {
        type: 'image_url',
        image_url: { url: result.dataUrl, detail: 'auto' },
      },
    ];
  }
  return [{ type: 'text', text: JSON.stringify(result) }];
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
  messages.push(buildUserMessage(userText, canvasState));

  let toolCallCount = 0;
  const maxToolCalls = 30;

  for (let i = 0; i < 20; i++) {
    let result;
    try {
      result = await rateLimiter.withRetry(() =>
        model.invoke(messages, { tools: toolDefs })
      );
    } catch (err) {
      return `Erro: ${err.message}`;
    }

    if (!result.tool_calls || result.tool_calls.length === 0) {
      return result.content;
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

      const groqContent = tc.name === 'get_canvas_preview'
        ? groqContentFromToolResult(tc.name, output)
        : groqContentFromText(JSON.stringify(output));

      messages.push({ role: 'assistant', content: '', tool_calls: [tc] });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: groqContent,
      });

      if (io && tc.name !== 'get_canvas_preview') {
        io.emit('canvas-update', canvasState.toJSON());
      }
    }
  }

  return 'Hmm, não consegui terminar a tempo. Tente ser mais específico.';
}
