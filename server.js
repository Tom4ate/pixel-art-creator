import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CanvasState } from './canvas/state.js';
import { agentLoop } from './agent/loop.js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, 'public')));

const canvasState = new CanvasState(32, 32);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('canvas-update', canvasState.toJSON());

  socket.on('resize-canvas', ({ width, height }) => {
    const w = Math.max(1, Math.min(500, Math.floor(width)));
    const h = Math.max(1, Math.min(500, Math.floor(height)));
    canvasState.resize(w, h);
    io.emit('canvas-update', canvasState.toJSON());
    socket.emit('agent-response', `Canvas redimensionado para ${w}x${h}`);
  });

  socket.on('draw-pixel', ({ x, y, color }) => {
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

  socket.on('chat-message', async (text) => {
    if (!text || typeof text !== 'string') return;
    io.emit('agent-thinking', true);
    try {
      const response = await agentLoop(text, canvasState, io);
      socket.emit('agent-response', response);
    } catch (err) {
      socket.emit('agent-response', `Erro: ${err.message}`);
    }
    io.emit('agent-thinking', false);
  });

  socket.on('disconnect', () => {
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
