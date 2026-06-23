import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color like #FF0000');

export function createTools(canvasState) {
  return [
    {
      name: 'draw_pixel',
      description: 'Draw a single pixel at (x, y) with the given hex color',
      schema: z.object({
        x: z.number().int().describe('X coordinate (0 to width-1)'),
        y: z.number().int().describe('Y coordinate (0 to height-1)'),
        color: hexColor.describe('Hex color like #FF0000'),
      }),
      execute: ({ x, y, color }) => {
        const ok = canvasState.drawPixel(x, y, color);
        if (!ok) return { success: false, error: `Pixel (${x},${y}) is out of bounds (${canvasState.width}x${canvasState.height})` };
        return { success: true, x, y, color };
      },
    },
    {
      name: 'draw_rect',
      description: 'Draw a filled rectangle at (x, y) with given width, height and color',
      schema: z.object({
        x: z.number().int().describe('Top-left X'),
        y: z.number().int().describe('Top-left Y'),
        width: z.number().int().positive().describe('Width in pixels'),
        height: z.number().int().positive().describe('Height in pixels'),
        color: hexColor.describe('Hex fill color'),
      }),
      execute: ({ x, y, width, height, color }) => {
        canvasState.drawRect(x, y, width, height, color);
        return { success: true, x, y, width, height, color };
      },
    },
    {
      name: 'draw_line',
      description: 'Draw a line from (x1,y1) to (x2,y2) with given color',
      schema: z.object({
        x1: z.number().int().describe('Start X'),
        y1: z.number().int().describe('Start Y'),
        x2: z.number().int().describe('End X'),
        y2: z.number().int().describe('End Y'),
        color: hexColor.describe('Hex color'),
      }),
      execute: ({ x1, y1, x2, y2, color }) => {
        canvasState.drawLine(x1, y1, x2, y2, color);
        return { success: true, x1, y1, x2, y2, color };
      },
    },
    {
      name: 'fill_area',
      description: 'Flood fill from (x, y) with the given color, replacing all adjacent matching pixels',
      schema: z.object({
        x: z.number().int().describe('Start X'),
        y: z.number().int().describe('Start Y'),
        color: hexColor.describe('Hex fill color'),
      }),
      execute: ({ x, y, color }) => {
        const ok = canvasState.fillArea(x, y, color);
        if (!ok) return { success: false, error: `Cannot fill at (${x},${y}) - out of bounds or already that color` };
        return { success: true, x, y, color };
      },
    },
    {
      name: 'set_background',
      description: 'Fill the entire canvas with a solid color',
      schema: z.object({
        color: hexColor.describe('Hex background color'),
      }),
      execute: ({ color }) => {
        canvasState.drawRect(0, 0, canvasState.width, canvasState.height, color);
        return { success: true, color };
      },
    },
    {
      name: 'clear_canvas',
      description: 'Clear the entire canvas (make all pixels transparent/empty)',
      schema: z.object({}),
      execute: () => {
        canvasState.clear();
        return { success: true, message: 'Canvas cleared' };
      },
    },
    {
      name: 'undo',
      description: 'Undo the last drawing action',
      schema: z.object({}),
      execute: () => {
        const ok = canvasState.undo();
        return { success: ok, message: ok ? 'Undone' : 'Nothing to undo' };
      },
    },
    {
      name: 'get_canvas_preview',
      description: 'Get a text representation and stats of the current canvas. Use this frequently to see what has been drawn. Each unique color is represented by a letter in the grid.',
      schema: z.object({}),
      execute: () => {
        return {
          width: canvasState.width,
          height: canvasState.height,
          gridText: canvasState.toTextGrid(),
        };
      },
    },
    {
      name: 'get_canvas_image',
      description: 'Get the canvas as a base64 data URL (BMP format). Only use this when you need the actual pixel data, e.g. for analysis or verification. Prefer get_canvas_preview for quick checks.',
      schema: z.object({}),
      execute: () => {
        return { dataUrl: canvasState.toDataURL() };
      },
    },
    {
      name: 'set_palette',
      description: 'Define a color palette limiting which colors can be used for drawing. Call this before drawing to establish the art style. The colors array must have between 1 and 32 colors.',
      schema: z.object({
        colors: z.array(hexColor).min(1).max(32).describe('Array of hex colors defining the palette, e.g. ["#FF0000","#000000"]'),
      }),
      execute: ({ colors }) => {
        canvasState.setPalette(colors);
        return { success: true, message: `Palette defined with ${colors.length} colors`, colors };
      },
    },
    {
      name: 'get_palette',
      description: 'Get the currently defined color palette. Returns the list of colors or indicates no palette is set.',
      schema: z.object({}),
      execute: () => {
        if (canvasState.palette) {
          return { defined: true, colors: canvasState.palette, count: canvasState.palette.length };
        }
        return { defined: false, message: 'No palette defined. Use set_palette to define one before drawing.' };
      },
    },
    {
      name: 'clear_palette',
      description: 'Remove the color palette constraint, allowing any colors to be used for drawing.',
      schema: z.object({}),
      execute: () => {
        canvasState.clearPalette();
        return { success: true, message: 'Palette cleared. Any colors may now be used.' };
      },
    },
    {
      name: 'finish',
      description: 'Call this ONLY when you are fully satisfied with the pixel art. Provide a summary of what was drawn. Do NOT call this until you have examined the result and confirmed it matches the user\'s request.',
      schema: z.object({
        summary: z.string().describe('Summary of what was drawn'),
      }),
      execute: ({ summary }) => ({ done: true, summary }),
    },
  ];
}


