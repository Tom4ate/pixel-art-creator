import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasState } from '../../canvas/state.js';
import { createTools } from '../../agent/tools.js';

describe('Agent Tools', () => {
  let canvas;
  let tools;

  beforeEach(() => {
    canvas = new CanvasState(32, 32);
    tools = createTools(canvas);
  });

  it('should create 9 tools', () => {
    assert.equal(tools.length, 9);
  });

  it('each tool should have name, description, schema, execute', () => {
    for (const t of tools) {
      assert(typeof t.name === 'string', `${t.name}: missing name`);
      assert(typeof t.description === 'string', `${t.name}: missing description`);
      assert(t.schema !== undefined, `${t.name}: missing schema`);
      assert(typeof t.execute === 'function', `${t.name}: missing execute`);
    }
  });

  describe('draw_pixel', () => {
    const tool = () => tools.find(t => t.name === 'draw_pixel');

    it('should reject invalid color', () => {
      assert.throws(() => tool().schema.parse({ x: 0, y: 0, color: 'red' }));
    });

    it('should reject non-integer x', () => {
      assert.throws(() => tool().schema.parse({ x: 1.5, y: 0, color: '#FF0000' }));
    });

    it('should draw a pixel', () => {
      const r = tool().execute({ x: 5, y: 10, color: '#FF0000' });
      assert.equal(r.success, true);
      assert.equal(canvas.grid[10][5], '#FF0000');
    });

    it('should fail out of bounds', () => {
      const r = tool().execute({ x: -1, y: 0, color: '#FF0000' });
      assert.equal(r.success, false);
    });
  });

  describe('draw_rect', () => {
    const tool = () => tools.find(t => t.name === 'draw_rect');

    it('should reject negative width', () => {
      assert.throws(() => tool().schema.parse({ x: 0, y: 0, width: -1, height: 5, color: '#FF0000' }));
    });

    it('should draw a rectangle', () => {
      tool().execute({ x: 0, y: 0, width: 5, height: 5, color: '#00FF00' });
      assert.equal(canvas.grid[0][0], '#00FF00');
      assert.equal(canvas.grid[4][4], '#00FF00');
    });
  });

  describe('draw_line', () => {
    const tool = () => tools.find(t => t.name === 'draw_line');

    it('should draw a line', () => {
      tool().execute({ x1: 0, y1: 0, x2: 5, y2: 0, color: '#0000FF' });
      assert.equal(canvas.grid[0][3], '#0000FF');
    });
  });

  describe('fill_area', () => {
    const tool = () => tools.find(t => t.name === 'fill_area');

    it('should flood fill', () => {
      canvas.drawPixel(5, 5, '#FF0000');
      tool().execute({ x: 5, y: 5, color: '#00FF00' });
      assert.equal(canvas.grid[5][5], '#00FF00');
    });
  });

  describe('set_background', () => {
    const tool = () => tools.find(t => t.name === 'set_background');

    it('should fill entire canvas', () => {
      tool().execute({ color: '#123456' });
      assert.equal(canvas.grid[0][0], '#123456');
      assert.equal(canvas.grid[31][31], '#123456');
    });
  });

  describe('clear_canvas', () => {
    const tool = () => tools.find(t => t.name === 'clear_canvas');

    it('should clear all pixels', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      tool().execute({});
      assert.equal(canvas.grid[0][0], null);
    });
  });

  describe('undo', () => {
    const tool = () => tools.find(t => t.name === 'undo');

    it('should undo last action', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      tool().execute({});
      assert.equal(canvas.grid[0][0], null);
    });

    it('should return false when nothing to undo', () => {
      const r = tool().execute({});
      assert.equal(r.success, false);
    });
  });

  describe('get_canvas_preview', () => {
    const tool = () => tools.find(t => t.name === 'get_canvas_preview');

    it('should return dataUrl, dimensions, and gridText', () => {
      const r = tool().execute({});
      assert(r.dataUrl.startsWith('data:image/bmp;base64,'));
      assert.equal(r.width, 32);
      assert.equal(r.height, 32);
      assert(typeof r.gridText === 'string');
      assert(r.gridText.includes('(empty canvas)'));
    });

    it('should show pixels in gridText when canvas has content', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      const r = tool().execute({});
      assert(r.gridText.includes('A'));
      assert(r.gridText.includes('#FF0000'));
    });
  });

  describe('finish', () => {
    const tool = () => tools.find(t => t.name === 'finish');

    it('should accept a summary and return done', () => {
      const r = tool().execute({ summary: 'desenhei um quadrado azul' });
      assert.equal(r.done, true);
      assert.equal(r.summary, 'desenhei um quadrado azul');
    });

    it('should reject non-string summary', () => {
      assert.throws(() => tool().schema.parse({ summary: 42 }));
    });
  });
});
