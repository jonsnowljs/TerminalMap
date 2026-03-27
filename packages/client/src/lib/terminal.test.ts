import { describe, expect, it, vi } from 'vitest';
import { decodeTerminalData, focusTerminal } from './terminal.js';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

describe('decodeTerminalData', () => {
  it('decodes utf-8 terminal output without mojibake', () => {
    const text = '╭─ OpenAI Codex';

    expect(decodeTerminalData(toBase64(text))).toBe(text);
  });
});

describe('focusTerminal', () => {
  it('focuses the terminal when a node selection should hand input back', () => {
    const focus = vi.fn();

    expect(focusTerminal({ focus })).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the terminal is not ready yet', () => {
    expect(focusTerminal(null)).toBe(false);
  });
});
