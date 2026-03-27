export interface TerminalHandle {
  focus(): void;
}

export function decodeTerminalData(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function focusTerminal(term: TerminalHandle | null | undefined): boolean {
  if (!term) {
    return false;
  }

  term.focus();
  return true;
}
