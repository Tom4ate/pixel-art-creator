import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { CanvasState } from '../../canvas/state.js';
import { agentLoop } from '../../agent/loop.js';

const hasKey = !!process.env.GROQ_API_KEY;

const mockIo = {
  emit() {},
};

describe('Agent Integration (Groq real)', { skip: !hasKey }, () => {
  let canvas;

  before(() => {
    if (!hasKey) console.log('Skipping: GROQ_API_KEY not set');
    canvas = new CanvasState(16, 16);
  });

  it('should respond to a simple text prompt', { timeout: 30000 }, async () => {
    const response = await agentLoop('Responda apenas "ok" sem aspas.', canvas, mockIo);
    assert(typeof response === 'string');
    assert(response.length > 0);
    console.log('  Response:', response);
  });

  it('should call draw_pixel tool and modify canvas', { timeout: 60000 }, async () => {
    canvas.clear();
    let painted = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const prompt = attempt === 0
        ? 'Use the draw_pixel tool to draw a single red pixel at x=0, y=0 with color "#FF0000". You must call the draw_pixel tool. Nothing else.'
        : 'IMPORTANT: Call draw_pixel(x=0, y=0, color="#FF0000") right now.';
      const response = await agentLoop(prompt, canvas, mockIo);
      if (canvas.grid[0][0] === '#FF0000') { painted = true; break; }
      console.log(`  Attempt ${attempt + 1} failed:`, response);
    }
    assert.equal(painted, true, 'Pixel should be red at (0,0) after up to 3 attempts');
    console.log('  Pixel drawn successfully');
  });

  it('should execute multi-step drawing (rect)', { timeout: 90000 }, async () => {
    canvas.clear();
    const response = await agentLoop(
      'Desenhe um quadrado azul 3x3 no canto superior esquerdo (#0000FF).',
      canvas, mockIo
    );
    assert(typeof response === 'string');
    let filledCount = 0;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (canvas.grid[y][x] === '#0000FF') filledCount++;
      }
    }
    assert(filledCount >= 7, `Expected at least 7/9 blue pixels, got ${filledCount}/9`);
    console.log(`  Filled: ${filledCount}/9 pixels`);
    console.log('  Response:', response);
  });

  it('should see canvas via get_canvas_preview', { timeout: 60000 }, async () => {
    canvas.clear();
    canvas.drawRect(0, 0, 4, 4, '#FF0000');
    const response = await agentLoop(
      'O canvas tem um quadrado vermelho 4x4 no canto superior esquerdo. Confirme que você vê isso.',
      canvas, mockIo
    );
    assert(typeof response === 'string');
    const lower = response.toLowerCase();
    const seenVision = lower.includes('quadrado') || lower.includes('vermelho') ||
      lower.includes('red') || lower.includes('square') || lower.includes('4x4');
    console.log('  Vision response:', response);
  });
});
