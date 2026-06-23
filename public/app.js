const socket = io();

const canvasEl = document.getElementById('pixel-canvas');
const wrapper = document.getElementById('canvas-wrapper');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const stopBtn = document.getElementById('stop-btn');
const colorPicker = document.getElementById('color-picker');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const applySizeBtn = document.getElementById('apply-size');
const widthInput = document.getElementById('canvas-width');
const heightInput = document.getElementById('canvas-height');
const pixelSizeInput = document.getElementById('pixel-size');
const modelInput = document.getElementById('model-input');
const logContent = document.getElementById('log-content');
const logToggle = document.getElementById('log-toggle');

let ctx = canvasEl.getContext('2d');
let currentGrid = { width: 32, height: 32, grid: [] };
let pixelSize = 20;
let painting = false;
let logExpanded = false;
let logMessages = [];

function renderCanvas(data) {
  currentGrid = data;
  const w = data.width;
  const h = data.height;
  canvasEl.width = w * pixelSize;
  canvasEl.height = h * pixelSize;
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = data.grid[y]?.[x];
      if (color) {
        ctx.fillStyle = color;
      } else {
        ctx.fillStyle = '#1a1a2e';
      }
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }

  ctx.strokeStyle = '#2a2a4e';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * pixelSize, 0);
    ctx.lineTo(x * pixelSize, h * pixelSize);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * pixelSize);
    ctx.lineTo(w * pixelSize, y * pixelSize);
    ctx.stroke();
  }
}

function getCanvasCoords(e) {
  const rect = canvasEl.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / rect.width * currentGrid.width);
  const y = Math.floor((e.clientY - rect.top) / rect.height * currentGrid.height);
  return { x, y };
}

canvasEl.addEventListener('mousedown', (e) => {
  painting = true;
  const { x, y } = getCanvasCoords(e);
  if (x >= 0 && x < currentGrid.width && y >= 0 && y < currentGrid.height) {
    socket.emit('draw-pixel', { x, y, color: colorPicker.value });
  }
});

canvasEl.addEventListener('mousemove', (e) => {
  if (!painting) return;
  const { x, y } = getCanvasCoords(e);
  if (x >= 0 && x < currentGrid.width && y >= 0 && y < currentGrid.height) {
    socket.emit('draw-pixel', { x, y, color: colorPicker.value });
  }
});

canvasEl.addEventListener('mouseup', () => { painting = false; });
canvasEl.addEventListener('mouseleave', () => { painting = false; });

function addMessage(text, type) {
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addLogEntry(entry) {
  const div = document.createElement('div');
  div.className = `log-entry log-${entry.type}`;

  const time = new Date(entry.timestamp);
  const ts = time.toLocaleTimeString('pt-BR', { hour12: false });

  div.textContent = `[${ts}] ${entry.message}`;
  logContent.appendChild(div);
  logContent.scrollTop = logContent.scrollHeight;
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text || chatSend.disabled) return;
  chatInput.value = '';
  addMessage(text, 'user');
  chatSend.disabled = true;
  stopBtn.style.display = '';
  socket.emit('chat-message', { text, model: modelInput.value.trim() || undefined });
}

stopBtn.addEventListener('click', () => {
  socket.emit('stop-execution');
  stopBtn.style.display = 'none';
  addMessage('Parando execução...', 'log');
});

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

undoBtn.addEventListener('click', () => socket.emit('undo'));
clearBtn.addEventListener('click', () => socket.emit('clear-canvas'));

applySizeBtn.addEventListener('click', () => {
  const w = Math.max(1, Math.min(500, parseInt(widthInput.value) || 32));
  const h = Math.max(1, Math.min(500, parseInt(heightInput.value) || 32));
  widthInput.value = w;
  heightInput.value = h;
  socket.emit('resize-canvas', { width: w, height: h });
});

pixelSizeInput.addEventListener('change', () => {
  pixelSize = Math.max(4, Math.min(100, parseInt(pixelSizeInput.value) || 20));
  pixelSizeInput.value = pixelSize;
  renderCanvas(currentGrid);
});

modelInput.addEventListener('change', () => {
  addLogEntry({
    type: 'info',
    message: `Modelo alterado para: ${modelInput.value.trim() || '(usando .env)'}`,
    timestamp: Date.now(),
  });
});

logToggle.addEventListener('click', () => {
  logExpanded = !logExpanded;
  logContent.style.display = logExpanded ? 'block' : 'none';
  logToggle.textContent = logExpanded ? '▲' : '▼';
});

socket.on('canvas-update', renderCanvas);

socket.on('agent-thinking', (thinking) => {
  chatSend.disabled = thinking;
  stopBtn.style.display = thinking ? '' : 'none';
  if (thinking) {
    addMessage('...', 'thinking');
  } else {
    const msgs = chatMessages.querySelectorAll('.msg.thinking');
    if (msgs.length) msgs[msgs.length - 1].remove();
  }
});

socket.on('agent-response', (text) => {
  addMessage(text, 'agent');
  chatSend.disabled = false;
  stopBtn.style.display = 'none';
});

socket.on('agent-log', (entry) => {
  logMessages.push(entry);
  addLogEntry(entry);

  const icons = {
    model_call: '🤖',
    tool_call: '🔧',
    tool_result: '✅',
    rate_limit: '⏳',
    error: '❌',
    info: 'ℹ️',
  };

  const icon = icons[entry.type] || '';
  addMessage(`${icon} ${entry.message}`, 'log');
});
