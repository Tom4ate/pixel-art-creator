const socket = io();

const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const uploadPreview = document.getElementById('upload-preview');
const previewImg = document.getElementById('preview-img');
const uploadCanvas = document.getElementById('upload-canvas');
const changeImageBtn = document.getElementById('change-image-btn');
const detectBtn = document.getElementById('detect-btn');
const detectLoading = document.getElementById('detect-loading');
const detectInfo = document.getElementById('detect-info');
const detectDims = document.getElementById('detect-dims');
const detectPaletteCount = document.getElementById('detect-palette-count');
const detectPalette = document.getElementById('detect-palette');
const textGridOutput = document.getElementById('text-grid-output');
const detectResult = document.getElementById('detect-result');
const detectExportArea = document.getElementById('detect-export-area');
const exportString = document.getElementById('export-string');
const copyGridBtn = document.getElementById('copy-grid-btn');
const copyExportBtn = document.getElementById('copy-export-btn');
const detectModelInput = document.getElementById('detect-model-input');

const MAX_WIDTH = 64;
const MAX_HEIGHT = 64;

let uploadedImageData = null;
let extractedPalette = null;
let extractedGrid = null;
let extractedTextGrid = '';

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('upload-area--over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('upload-area--over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('upload-area--over');
  const files = e.dataTransfer.files;
  if (files.length > 0) handleFile(files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

changeImageBtn.addEventListener('click', () => {
  resetDetection();
  fileInput.click();
});

detectBtn.addEventListener('click', () => {
  if (!extractedTextGrid) return;
  sendForDetection();
});

copyGridBtn.addEventListener('click', () => {
  copyToClipboard(textGridOutput.textContent);
});

copyExportBtn.addEventListener('click', () => {
  copyToClipboard(exportString.textContent);
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => processImage(img);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function processImage(img) {
  const w = Math.min(img.width, MAX_WIDTH);
  const h = Math.min(img.height, MAX_HEIGHT);

  uploadCanvas.width = w;
  uploadCanvas.height = h;
  const ctx = uploadCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);

  previewImg.src = uploadCanvas.toDataURL();
  previewImg.style.display = 'block';
  uploadPlaceholder.style.display = 'none';
  uploadPreview.style.display = 'flex';

  extractPaletteAndGrid(ctx, w, h);

  detectInfo.style.display = 'block';
  detectDims.textContent = `${w} x ${h}`;
  detectPaletteCount.textContent = extractedPalette ? extractedPalette.length : 0;
  detectBtn.style.display = '';
  detectBtn.disabled = false;

  uploadedImageData = { width: w, height: h };
}

function extractPaletteAndGrid(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const colorSet = new Set();
  const grid = [];

  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 128) {
        row.push(null);
        continue;
      }

      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      colorSet.add(hex);
      row.push(hex);
    }
    grid.push(row);
  }

  extractedPalette = [...colorSet].sort();
  extractedGrid = grid;
  renderPalette(extractedPalette);
  renderTextGrid(grid, w, h);
}

function renderPalette(colors) {
  detectPalette.innerHTML = '';
  if (!colors || colors.length === 0) {
    detectPalette.innerHTML = '<span class="palette-empty">—</span>';
    return;
  }
  for (const color of colors) {
    const swatch = document.createElement('button');
    swatch.className = 'palette-swatch';
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      navigator.clipboard.writeText(color);
    });
    detectPalette.appendChild(swatch);
  }
}

function renderTextGrid(grid, w, h) {
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
  const hh = Math.min(h, maxRows);
  const ww = Math.min(w, maxCols);
  const gridRows = [];

  for (let y = 0; y < hh; y++) {
    let row = '';
    let hasPixel = false;
    for (let x = 0; x < ww; x++) {
      const ch = charFor(grid[y][x]);
      row += ch ?? '.';
      if (ch !== null) hasPixel = true;
    }
    if (w > maxCols) row += '...';
    gridRows.push({ y, row, hasPixel });
  }

  const lines = [];

  if (colorMap.size > 0) {
    lines.push('[Colors]');
    for (const [color, ch] of colorMap) {
      lines.push(`  ${ch} = ${color}`);
    }
    lines.push('');
  }

  lines.push(`[Grid ${w}x${h}]`);

  const hasAnyPixel = gridRows.some(r => r.hasPixel);
  if (!hasAnyPixel) {
    lines.push('  (empty canvas)');
  } else {
    for (const { y, row } of gridRows) {
      lines.push(`Row ${String(y).padStart(3, ' ')}: ${row}`);
    }
  }

  if (h > maxRows) {
    lines.push(`... (${h - maxRows} more empty rows omitted)`);
  }

  extractedTextGrid = lines.join('\n');
  textGridOutput.textContent = extractedTextGrid;

  const exportLines = [...lines];
  if (extractedPalette) {
    const paletteIdx = exportLines.findIndex(l => l === '[Colors]');
    if (paletteIdx === -1) {
      exportLines.unshift('');
      exportLines.unshift('[Colors]');
      for (const color of extractedPalette) {
        exportLines.push(`  ${color}`);
      }
    }
  }
  exportLines.push('');
  exportLines.push('[Palette]');
  for (const color of extractedPalette) {
    exportLines.push(`  ${color}`);
  }

  const fullExport = exportLines.join('\n');
  exportString.textContent = fullExport;
}

function sendForDetection() {
  detectBtn.disabled = true;
  detectLoading.style.display = 'flex';
  detectResult.innerHTML = '<span class="palette-empty">Aguardando resposta do modelo...</span>';
  detectExportArea.style.display = 'none';

  socket.emit('detect-image', {
    textGrid: extractedTextGrid,
    palette: extractedPalette,
    width: uploadedImageData.width,
    height: uploadedImageData.height,
    model: detectModelInput.value.trim() || undefined,
  });
}

function resetDetection() {
  detectResult.innerHTML = '<span class="palette-empty">Aguardando detecção...</span>';
  detectExportArea.style.display = 'none';
  detectLoading.style.display = 'none';
  detectBtn.style.display = 'none';
  detectBtn.disabled = false;
  detectInfo.style.display = 'none';
}

socket.on('detect-result', (data) => {
  detectLoading.style.display = 'none';
  detectBtn.disabled = false;
  detectResult.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = data.result;
  detectResult.appendChild(p);
  detectExportArea.style.display = 'block';
});

socket.on('detect-error', (data) => {
  detectLoading.style.display = 'none';
  detectBtn.disabled = false;
  detectResult.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'detect-error-text';
  p.textContent = `Erro: ${data.message}`;
  detectResult.appendChild(p);
});

socket.on('detect-loading', (thinking) => {
  if (!thinking) {
    detectLoading.style.display = 'none';
  }
});
