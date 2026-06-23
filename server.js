import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CanvasState } from './canvas/state.js';
import { agentLoop } from './agent/loop.js';
import { ChatGroq } from '@langchain/groq';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 5e6,
});

app.use(express.static(join(__dirname, 'public')));

app.get('/creator', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'creator.html'));
});

app.get('/detect', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'detect.html'));
});

const canvasState = new CanvasState(32, 32);
const activeControllers = new Map();
const pendingConfirmations = new Map();

function requestConfirmation(toolName, args, socketId) {
  return new Promise((resolve, reject) => {
    const requestId = `${socketId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingConfirmations.delete(requestId);
      resolve(false);
    }, 30000);

    pendingConfirmations.set(requestId, { resolve, reject: () => resolve(false), timer });

    io.emit('confirmation-required', {
      requestId,
      tool: toolName,
      args,
      message: `O modelo deseja executar: ${toolName}`,
    });
  });
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('canvas-update', canvasState.toJSON());
  socket.emit('palette-update', canvasState.palette ? [...canvasState.palette] : null);

  socket.on('resize-canvas', ({ width, height }) => {
    const w = Math.max(1, Math.min(500, Math.floor(width)));
    const h = Math.max(1, Math.min(500, Math.floor(height)));
    canvasState.resize(w, h);
    io.emit('canvas-update', canvasState.toJSON());
    socket.emit('agent-response', `Canvas redimensionado para ${w}x${h}`);
  });

  socket.on('draw-pixel', ({ x, y, color }) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    canvasState.drawPixel(x, y, color);
    io.emit('canvas-update', canvasState.toJSON());
  });

  socket.on('undo', () => {
    canvasState.undo();
    io.emit('canvas-update', canvasState.toJSON());
  });

  socket.on('clear-canvas', () => {
    canvasState.clear();
    io.emit('canvas-update', canvasState.toJSON());
  });

  socket.on('restore-version', ({ grid }) => {
    if (!grid || !Array.isArray(grid)) return;
    const h = grid.length;
    const w = grid[0]?.length || 0;
    if (w === 0 || h === 0) return;
    canvasState.width = w;
    canvasState.height = h;
    canvasState.grid = grid.map(row => [...row]);
    canvasState.undoStack = [];
    io.emit('canvas-update', canvasState.toJSON());
    io.emit('palette-update', canvasState.palette ? [...canvasState.palette] : null);
  });

  socket.on('chat-message', async (data) => {
    const text = typeof data === 'string' ? data : data?.text;
    const model = typeof data === 'string' ? undefined : data?.model;
    const limitGroq = typeof data === 'string' ? true : data?.limitGroq !== false;
    if (!text || typeof text !== 'string') return;

    const controller = new AbortController();
    activeControllers.set(socket.id, controller);

    io.emit('agent-thinking', true);

    try {
      const response = await agentLoop(text, canvasState, io, model, controller.signal, requestConfirmation, socket.id, limitGroq);
      socket.emit('agent-response', response);
    } catch (err) {
      if (err.message === 'Aborted' || controller.signal.aborted) return;
      socket.emit('agent-response', `Erro: ${err.message}`);
    } finally {
      activeControllers.delete(socket.id);
      io.emit('agent-thinking', false);
    }
  });

  socket.on('stop-execution', () => {
    const controller = activeControllers.get(socket.id);
    if (controller) {
      controller.abort();
      activeControllers.delete(socket.id);
    }
  });

  socket.on('confirmation-response', ({ requestId, approved }) => {
    const pending = pendingConfirmations.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(approved);
      pendingConfirmations.delete(requestId);
    }
  });

  socket.on('detect-image', async (data) => {
    const { textGrid, palette, width, height, model } = data;
    if (!textGrid) return;

    const detectModel = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: model || process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.3,
      maxTokens: 1024,
    });

    socket.emit('detect-loading', true);

    try {
      const paletteStr = palette && palette.length > 0
        ? `\nColor palette:\n${palette.map(c => `  ${c}`).join('\n')}`
        : '';

      const response = await detectModel.invoke([
        {
          role: 'system',
          content: `You are a pixel art analyzer. Your task is to analyze a pixel art image represented as a text grid and determine what it depicts.

The grid uses letters to represent colors. Look at the shape, form, and arrangement of pixels to identify the subject.

Respond with a concise description of what the pixel art represents (1-3 sentences). Be specific about the subject. If it's abstract or unclear, say so. Always respond in the same language as the prompt.`,
        },
        {
          role: 'user',
          content: `Analyze this ${width}x${height} pixel art and tell me what it represents:\n\n${textGrid}${paletteStr}`,
        },
      ]);

      const result = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      socket.emit('detect-result', { result });
    } catch (err) {
      socket.emit('detect-error', { message: err.message });
    } finally {
      socket.emit('detect-loading', false);
    }
  });

  socket.on('disconnect', () => {
    const controller = activeControllers.get(socket.id);
    if (controller) controller.abort();
    activeControllers.delete(socket.id);
    for (const [reqId, pending] of pendingConfirmations) {
      if (reqId.includes(socket.id)) {
        clearTimeout(pending.timer);
        pending.resolve(false);
        pendingConfirmations.delete(reqId);
      }
    }
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('WARNING: GROQ_API_KEY not set in .env file');
  }
});
