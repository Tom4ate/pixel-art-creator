import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasState } from '../../canvas/state.js';

describe('CanvasState', () => {
  let canvas;

  beforeEach(() => { canvas = new CanvasState(32, 32); });

  describe('constructor', () => {
    it('should create default 32x32 canvas', () => {
      assert.equal(canvas.width, 32);
      assert.equal(canvas.height, 32);
      assert.equal(canvas.grid.length, 32);
      assert.equal(canvas.grid[0].length, 32);
    });

    it('should create custom size canvas', () => {
      const c = new CanvasState(16, 8);
      assert.equal(c.width, 16);
      assert.equal(c.height, 8);
    });

    it('should have null (transparent) pixels', () => {
      assert.equal(canvas.grid[0][0], null);
      assert.equal(canvas.grid[15][15], null);
    });
  });

  describe('drawPixel', () => {
    it('should draw a pixel at valid coordinates', () => {
      assert.equal(canvas.drawPixel(5, 10, '#FF0000'), true);
      assert.equal(canvas.grid[10][5], '#FF0000');
    });

    it('should reject out-of-bounds negative x', () => {
      assert.equal(canvas.drawPixel(-1, 0, '#FF0000'), false);
    });

    it('should reject out-of-bounds x >= width', () => {
      assert.equal(canvas.drawPixel(32, 0, '#FF0000'), false);
    });

    it('should reject out-of-bounds y', () => {
      assert.equal(canvas.drawPixel(0, -1, '#FF0000'), false);
      assert.equal(canvas.drawPixel(0, 32, '#FF0000'), false);
    });

    it('should push undo on success', () => {
      assert.equal(canvas.undoStack.length, 0);
      canvas.drawPixel(0, 0, '#00FF00');
      assert.equal(canvas.undoStack.length, 1);
    });
  });

  describe('drawRect', () => {
    it('should fill a rectangle', () => {
      canvas.drawRect(2, 2, 3, 3, '#00FF00');
      assert.equal(canvas.grid[2][2], '#00FF00');
      assert.equal(canvas.grid[4][4], '#00FF00');
      assert.equal(canvas.grid[1][2], null);
    });

    it('should clamp rectangle at edges', () => {
      canvas.drawRect(-1, 0, 5, 5, '#FF0000');
      assert.equal(canvas.grid[0][0], '#FF0000');
    });

    it('should handle rectangle larger than canvas', () => {
      canvas.drawRect(30, 30, 10, 10, '#FF0000');
      assert.equal(canvas.grid[31][30], '#FF0000');
      assert.equal(canvas.grid[31][31], '#FF0000');
    });
  });

  describe('drawLine', () => {
    it('should draw a horizontal line', () => {
      canvas.drawLine(0, 5, 4, 5, '#FF0000');
      for (let x = 0; x <= 4; x++) {
        assert.equal(canvas.grid[5][x], '#FF0000');
      }
    });

    it('should draw a vertical line', () => {
      canvas.drawLine(3, 0, 3, 4, '#00FF00');
      for (let y = 0; y <= 4; y++) {
        assert.equal(canvas.grid[y][3], '#00FF00');
      }
    });

    it('should draw a diagonal line', () => {
      canvas.drawLine(0, 0, 4, 4, '#0000FF');
      for (let i = 0; i <= 4; i++) {
        assert.equal(canvas.grid[i][i], '#0000FF');
      }
    });

    it('should handle single pixel line', () => {
      canvas.drawLine(3, 3, 3, 3, '#FFFFFF');
      assert.equal(canvas.grid[3][3], '#FFFFFF');
    });
  });

  describe('fillArea', () => {
    it('should flood fill a bounded area', () => {
      canvas.drawRect(0, 0, 10, 10, '#FF0000');
      canvas.drawRect(2, 2, 6, 6, null);
      canvas.fillArea(3, 3, '#00FF00');
      assert.equal(canvas.grid[3][3], '#00FF00');
      assert.equal(canvas.grid[0][0], '#FF0000');
    });

    it('should return false if target already has the fill color', () => {
      canvas.drawPixel(5, 5, '#FF0000');
      assert.equal(canvas.fillArea(5, 5, '#FF0000'), false);
    });

    it('should return false for out-of-bounds', () => {
      assert.equal(canvas.fillArea(-1, -1, '#FF0000'), false);
      assert.equal(canvas.fillArea(99, 99, '#FF0000'), false);
    });

    it('should fill entire canvas if all same color', () => {
      canvas.clear();
      canvas.fillArea(0, 0, '#FF0000');
      assert.equal(canvas.grid[31][31], '#FF0000');
    });
  });

  describe('undo', () => {
    it('should undo a single action', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      assert.equal(canvas.grid[0][0], '#FF0000');
      assert.equal(canvas.undo(), true);
      assert.equal(canvas.grid[0][0], null);
    });

    it('should undo multiple actions in order', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      canvas.drawPixel(1, 0, '#00FF00');
      canvas.undo();
      assert.equal(canvas.grid[1][0], null);
      assert.equal(canvas.grid[0][0], '#FF0000');
      canvas.undo();
      assert.equal(canvas.grid[0][0], null);
    });

    it('should return false if nothing to undo', () => {
      assert.equal(canvas.undo(), false);
    });

    it('should limit undo stack to maxUndo', () => {
      for (let i = 0; i < 60; i++) canvas.drawPixel(i % 32, 0, `#${String(i).padStart(6, '0')}`);
      assert.equal(canvas.undoStack.length, canvas.maxUndo);
    });
  });

  describe('clear', () => {
    it('should clear all pixels', () => {
      canvas.drawRect(0, 0, 32, 32, '#FF0000');
      canvas.clear();
      assert.equal(canvas.grid[0][0], null);
      assert.equal(canvas.grid[31][31], null);
    });

    it('should push undo before clearing', () => {
      canvas.drawRect(0, 0, 32, 32, '#FF0000');
      canvas.clear();
      assert.equal(canvas.undoStack.length, 2);
      canvas.undo();
      assert.equal(canvas.grid[0][0], '#FF0000');
    });
  });

  describe('resize', () => {
    it('should change dimensions and reset grid', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      canvas.resize(10, 20);
      assert.equal(canvas.width, 10);
      assert.equal(canvas.height, 20);
      assert.equal(canvas.grid.length, 20);
      assert.equal(canvas.grid[0].length, 10);
      assert.equal(canvas.grid[0][0], null);
    });

    it('should clear undo stack on resize', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      canvas.resize(32, 32);
      assert.equal(canvas.undoStack.length, 0);
    });
  });

  describe('toBMP and toDataURL', () => {
    it('should return a valid BMP buffer', () => {
      const buf = canvas.toBMP();
      assert(Buffer.isBuffer(buf));
      assert(buf[0] === 0x42 && buf[1] === 0x4D);
      const fileSize = buf.readUInt32LE(2);
      assert.equal(fileSize, buf.length);
    });

    it('should return a data URL string', () => {
      const url = canvas.toDataURL();
      assert(url.startsWith('data:image/bmp;base64,'));
    });

    it('should produce different output for different canvases', () => {
      const url1 = canvas.toDataURL();
      canvas.drawPixel(0, 0, '#FF0000');
      const url2 = canvas.toDataURL();
      assert.notEqual(url1, url2);
    });
  });

  describe('toTextGrid', () => {
    it('should show "(empty canvas)" for blank canvas', () => {
      const text = canvas.toTextGrid();
      assert(text.includes('(empty canvas)'));
    });

    it('should show color legend when pixels are drawn', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      const text = canvas.toTextGrid();
      assert(text.includes('[Colors]'));
      assert(text.includes('A = #FF0000'));
    });

    it('should map each unique color to a letter', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      canvas.drawPixel(1, 0, '#00FF00');
      const text = canvas.toTextGrid();
      assert(text.includes('A = #FF0000'));
      assert(text.includes('B = #00FF00'));
    });

    it('should show pixels as letters in the grid', () => {
      canvas.drawPixel(5, 10, '#FF0000');
      const text = canvas.toTextGrid();
      assert(text.includes('Row  10:'));
      assert(text.includes('A'));
    });

    it('should skip completely empty rows', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      const text = canvas.toTextGrid();
      assert(text.includes('Row   0:'));
      assert(!text.includes('Row   1:'));
    });

    it('should handle multiple rows with pixels', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      canvas.drawPixel(0, 31, '#FF0000');
      const text = canvas.toTextGrid();
      assert(text.includes('Row   0:'));
      assert(text.includes('Row  31:'));
    });

    it('should truncate at 40 rows', () => {
      const big = new CanvasState(32, 100);
      big.drawRect(0, 0, 5, 100, '#FF0000');
      const text = big.toTextGrid();
      assert(text.includes('... (60 more empty rows omitted)'));
    });

    it('should truncate at 80 columns', () => {
      const wide = new CanvasState(200, 5);
      wide.drawRect(0, 0, 200, 5, '#FF0000');
      const text = wide.toTextGrid();
      assert(text.includes('...'));
      assert(text.length < 15000);
    });

    it('should return different output for different canvases', () => {
      const c1 = new CanvasState(8, 8);
      c1.drawPixel(0, 0, '#FF0000');
      const c2 = new CanvasState(8, 8);
      c2.drawPixel(1, 1, '#00FF00');
      assert.notEqual(c1.toTextGrid(), c2.toTextGrid());
    });
  });

  describe('snapshot and restore', () => {
    it('should snapshot and restore canvas state', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      const snap = canvas.snapshot();
      canvas.drawPixel(1, 1, '#00FF00');
      canvas.restore(snap);
      assert.equal(canvas.grid[0][0], '#FF0000');
      assert.equal(canvas.grid[1][1], null);
    });
  });

  describe('toJSON', () => {
    it('should return correct JSON representation', () => {
      canvas.drawPixel(0, 0, '#FF0000');
      const json = canvas.toJSON();
      assert.equal(json.width, 32);
      assert.equal(json.height, 32);
      assert.equal(json.grid[0][0], '#FF0000');
      assert.equal(json.grid[1][1], null);
    });
  });
});
