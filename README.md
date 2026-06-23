# Assets Creator

Pixel art assistido por IA — desenhe pixel art conversando com um agente LangChain + Groq.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express + Socket.io |
| AI | Groq (llama-3.2-11b-vision-preview) via `@langchain/groq` |
| Agente | Loop custom com tool calling (think → act → observe) |
| Visão | BMP encoder inline (zero dependências nativas) |
| Validação | Zod (schemas das tools) |
| Frontend | HTML5 Canvas + vanilla JS |

## Requisitos

- Node.js >= 18
- Uma [API key do Groq](https://console.groq.com/keys) (gratuita)

## Instalação

```bash
git clone <repo>
cd assets-creator
npm install
cp .env.example .env
```

Edite `.env` e adicione sua chave:

```
GROQ_API_KEY=gsk_sua_chave_aqui
```

## Uso

```bash
npm start
```

Acesse `http://localhost:3000`.

## Como funciona

1. Configure o tamanho do canvas e o pixel size nos controles do topo
2. Desenhe manualmente clicando/arrastando no canvas, ou
3. Digite um comando em linguagem natural no chat (ex: *"desenhe uma maçã 8x8 no centro"*)
4. O agente LangChain recebe a mensagem + uma imagem BMP do canvas atual
5. O modelo decide quais tools chamar (`draw_pixel`, `draw_rect`, `draw_line`, etc.)
6. Cada ação é executada e transmitida em tempo real via Socket.io
7. O loop continua até o modelo responder textualmente

## Ferramentas do agente

| Tool | Descrição |
|------|-----------|
| `draw_pixel(x, y, color)` | Desenha 1 pixel |
| `draw_rect(x, y, w, h, color)` | Retângulo preenchido |
| `draw_line(x1, y1, x2, y2, color)` | Linha (Bresenham) |
| `fill_area(x, y, color)` | Flood fill (BFS) |
| `set_background(color)` | Preenche o canvas inteiro |
| `clear_canvas()` | Limpa tudo |
| `undo()` | Desfaz última ação |
| `get_canvas_preview()` | Retorna o canvas como imagem (o modelo "vê") |

## Segurança (rate limiting)

- Token bucket: 25 requisições/minuto (folga abaixo do limite real de 30)
- Fila: até 10 requisições em espera
- Backoff exponencial em caso de erro 429 (1s, 2s, 4s... até 30s)
- Limite diário: 6000 requisições

## Estrutura

```
assets-creator/
├── package.json
├── .env.example
├── server.js               # Express + Socket.io
├── canvas/
│   └── state.js            # Grid 2D, undo stack, encoder BMP
├── agent/
│   ├── tools.js            # Definição das 8 ferramentas (Zod)
│   ├── loop.js             # Loop do agente custom
│   └── rateLimiter.js      # Token bucket + backoff
└── public/
    ├── index.html           # UI: canvas + chat + controles
    ├── style.css            # Tema escuro
    └── app.js               # Socket.io client, render, input
```

## Licença

MIT
