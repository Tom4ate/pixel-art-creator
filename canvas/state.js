export class CanvasState {
  constructor(width = 32, height = 32) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => Array(width).fill(null));
    this.undoStack = [];
    this.maxUndo = 50;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => Array(width).fill(null));
    this.undoStack = [];
  }

  snapshot() {
    return this.grid.map(row => [...row]);
  }

  restore(snap) {
    this.grid = snap.map(row => [...row]);
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  drawPixel(x, y, color) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    this.pushUndo();
    this.grid[y][x] = color;
    return true;
  }

  drawRect(x, y, w, h, color) {
    this.pushUndo();
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(this.width - 1, x + w - 1);
    const y2 = Math.min(this.height - 1, y + h - 1);
    for (let j = y1; j <= y2; j++) {
      for (let i = x1; i <= x2; i++) {
        this.grid[j][i] = color;
      }
    }
    return true;
  }

  drawLine(x1, y1, x2, y2, color) {
    this.pushUndo();
    let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let err = dx + dy, e2;
    while (true) {
      if (x1 >= 0 && x1 < this.width && y1 >= 0 && y1 < this.height) {
        this.grid[y1][x1] = color;
      }
      if (x1 === x2 && y1 === y2) break;
      e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
    return true;
  }

  fillArea(x, y, color) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const target = this.grid[y][x];
    if (target === color) return false;
    this.pushUndo();
    const queue = [[x, y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) continue;
      if (this.grid[cy][cx] !== target) continue;
      this.grid[cy][cx] = color;
      queue.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
    return true;
  }

  clear() {
    this.pushUndo();
    this.grid = Array.from({ length: this.height }, () => Array(this.width).fill(null));
    return true;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.grid = this.undoStack.pop();
    return true;
  }

  toJSON() {
    return { width: this.width, height: this.height, grid: this.grid };
  }

  toTextGrid() {
    const colorMap = new Map();
    const usedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nextChar = 0;

    const charFor = (color) => {
      if (!color) return null;
      if (colorMap.has(color)) return colorMap.get(color);
      if (nextChar >= usedChars.length) return '?';
      const c = usedChars[nextChar++];
      colorMap.set(color, c);
      return c;
    };

    const maxRows = 40;
    const maxCols = 80;
    const h = Math.min(this.height, maxRows);
    const w = Math.min(this.width, maxCols);
    const gridRows = [];

    for (let y = 0; y < h; y++) {
      let row = '';
      let hasPixel = false;
      for (let x = 0; x < w; x++) {
        const ch = charFor(this.grid[y][x]);
        row += ch ?? '.';
        if (ch !== null) hasPixel = true;
      }
      if (this.width > maxCols) row += '...';
      if (hasPixel) gridRows.push({ y, row });
    }

    const lines = [];

    if (colorMap.size > 0) {
      lines.push('[Colors]');
      for (const [color, ch] of colorMap) {
        lines.push(`  ${ch} = ${color}`);
      }
      lines.push('');
    }

    lines.push(`[Grid ${this.width}x${this.height}]`);

    if (gridRows.length === 0) {
      lines.push('  (empty canvas)');
    } else {
      for (const { y, row } of gridRows) {
        lines.push(`Row ${String(y).padStart(3, ' ')}: ${row}`);
      }
    }

    if (this.height > maxRows) {
      lines.push(`... (${this.height - maxRows} more empty rows omitted)`);
    }

    return lines.join('\n');
  }

  toBMP() {
    const w = this.width, h = this.height;
    const rowSize = Math.ceil((w * 3) / 4) * 4;
    const pixelDataSize = rowSize * h;
    const fileSize = 14 + 40 + pixelDataSize;
    const buf = new Uint8Array(fileSize);
    let off = 0;
    const write16 = (v) => { buf[off++] = v & 0xFF; buf[off++] = (v >> 8) & 0xFF; };
    const write32 = (v) => { buf[off++] = v & 0xFF; buf[off++] = (v >> 8) & 0xFF; buf[off++] = (v >> 16) & 0xFF; buf[off++] = (v >> 24) & 0xFF; };
    const set = (i, v) => { buf[i] = v; };
    off = 0;
    write16(0x4D42); write32(fileSize); write16(0); write16(0); write32(14 + 40);
    write32(40); write32(w); write32(h); write16(1); write16(24); write32(0); write32(pixelDataSize); write32(2835); write32(2835); write32(0); write32(0);
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const c = this.grid[y][x];
        if (c) {
          const r = parseInt(c.slice(1, 3), 16);
          const g = parseInt(c.slice(3, 5), 16);
          const b = parseInt(c.slice(5, 7), 16);
          set(off++, b); set(off++, g); set(off++, r);
        } else {
          set(off++, 0); set(off++, 0); set(off++, 0);
        }
      }
      off += rowSize - w * 3;
    }
    return Buffer.from(buf.buffer);
  }

  toDataURL() {
    const bmp = this.toBMP();
    return `data:image/bmp;base64,${bmp.toString('base64')}`;
  }
}
