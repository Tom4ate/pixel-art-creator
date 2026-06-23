import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import { CanvasState } from '../canvas/state.js';

function createTestServer() {
  return new Promise((resolve) => {
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer);
    const canvasState = new CanvasState(32, 32);

    app.get('/', (req, res) => res.send('<html>ok</html>'));

    io.on('connection', (socket) => {
      socket.emit('canvas-update', canvasState.toJSON());

      socket.on('resize-canvas', ({ width, height }) => {
        canvasState.resize(width, height);
        io.emit('canvas-update', canvasState.toJSON());
      });

      socket.on('draw-pixel', ({ x, y, color }) => {
        const ok = canvasState.drawPixel(x, y, color);
        if (ok) io.emit('canvas-update', canvasState.toJSON());
      });

      socket.on('clear-canvas', () => {
        canvasState.clear();
        io.emit('canvas-update', canvasState.toJSON());
      });

      socket.on('undo', () => {
        canvasState.undo();
        io.emit('canvas-update', canvasState.toJSON());
      });

      socket.on('chat-message', async (text) => {
        socket.emit('agent-response', `echo: ${text}`);
      });
    });

    httpServer.listen(0, () => {
      const port = httpServer.address().port;
      resolve({ httpServer, io, canvasState, port });
    });
  });
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`);
    socket.on('connect', () => {});
    socket.on('canvas-update', function handler(data) {
      socket.off('canvas-update', handler);
      resolve(socket);
    });
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Timeout connecting')), 5000);
  });
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    socket.once(event, (data) => resolve(data));
    setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
  });
}

describe('Server Integration', () => {
  let server, srvIo, canvasState, port;

  before(async () => {
    const s = await createTestServer();
    server = s.httpServer;
    srvIo = s.io;
    canvasState = s.canvasState;
    port = s.port;
  });

  after(() => {
    srvIo.close();
    server.close();
  });

  it('should serve HTML on GET /', async () => {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert(text.includes('<html>'));
  });

  it('should emit canvas-update on connect', async () => {
    const socket = await connectClient(port);
    socket.close();
  });

  it('should handle draw-pixel and emit update', async () => {
    canvasState.clear();
    const socket = await connectClient(port);
    const promise = waitForEvent(socket, 'canvas-update');
    socket.emit('draw-pixel', { x: 0, y: 0, color: '#FF0000' });
    const data = await promise;
    assert.equal(data.grid[0][0], '#FF0000');
    socket.close();
  });

  it('should handle resize-canvas', async () => {
    const socket = await connectClient(port);
    const promise = waitForEvent(socket, 'canvas-update');
    socket.emit('resize-canvas', { width: 10, height: 20 });
    const data = await promise;
    assert.equal(data.width, 10);
    assert.equal(data.height, 20);
    socket.close();
  });

  it('should handle chat-message and emit agent-response', async () => {
    const socket = await connectClient(port);
    const promise = waitForEvent(socket, 'agent-response');
    socket.emit('chat-message', 'test message');
    const text = await promise;
    assert(text.includes('echo:'));
    socket.close();
  });

  it('should handle clear-canvas', async () => {
    canvasState.drawPixel(0, 0, '#FF0000');
    const socket = await connectClient(port);
    const promise = waitForEvent(socket, 'canvas-update');
    socket.emit('clear-canvas');
    const data = await promise;
    assert.equal(data.grid[0][0], null);
    socket.close();
  });

  it('should handle undo', async () => {
    const socket = await connectClient(port);
    canvasState.drawPixel(5, 5, '#00FF00');
    const prevVal = canvasState.grid[5][5];
    const promise = waitForEvent(socket, 'canvas-update');
    socket.emit('undo');
    await promise;
    assert.notEqual(canvasState.grid[5][5], prevVal);
    socket.close();
  });
});
