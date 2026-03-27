import { EventEmitter } from 'events';
import { OutputBuffer } from './OutputBuffer.js';

export interface CommandStartEvent {
  command: string;
}

export interface CommandEndEvent {
  exitCode: number | null;
  durationMs: number;
  output: string;
}

/**
 * Detects command boundaries in terminal output.
 *
 * Tier 1: OSC 133 shell integration sequences (precise)
 * Tier 2: Regex prompt detection + silence timeout (fallback)
 */
export class CommandDetector extends EventEmitter {
  private outputBuffer = new OutputBuffer();
  private state: 'idle' | 'prompt' | 'executing' = 'idle';
  private currentCommand = '';
  private commandStartTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // Common prompt patterns — match end of line after stripping ANSI
  private static PROMPT_PATTERNS = [
    /[$%#>]\s*$/,         // Simple prompt endings
    /\]\s*[$%#>]\s*$/,    // Bracket-enclosed prompts
    /\)\s*[$%#>]\s*$/,    // Paren-enclosed prompts
    /❯\s*$/,              // Starship/powerline arrow
    /➜\s*$/,              // oh-my-zsh arrow
    /λ\s*$/,              // Lambda prompt
  ];

  // OSC 133 sequences
  private static OSC_PROMPT_START = '\x1b]133;A';
  private static OSC_COMMAND_START = '\x1b]133;B';
  private static OSC_COMMAND_EXECUTED = '\x1b]133;C';
  private static OSC_COMMAND_FINISHED = '\x1b]133;D';

  constructor() {
    super();
  }

  /**
   * Feed raw PTY data into the detector.
   */
  feed(data: string): void {
    // Try OSC 133 first
    if (this.tryOsc133(data)) return;

    // Fallback: regex-based detection
    this.feedRegex(data);
  }

  private tryOsc133(data: string): boolean {
    if (!data.includes('\x1b]133;')) return false;

    if (data.includes(CommandDetector.OSC_PROMPT_START)) {
      if (this.state === 'executing') {
        this.finishCommand(null);
      }
      this.state = 'prompt';
    }

    if (data.includes(CommandDetector.OSC_COMMAND_START)) {
      this.state = 'executing';
      this.commandStartTime = Date.now();
    }

    if (data.includes(CommandDetector.OSC_COMMAND_EXECUTED)) {
      this.outputBuffer = new OutputBuffer();
    }

    const finishMatch = data.match(/\x1b\]133;D;?(\d*)/);
    if (finishMatch) {
      const exitCode = finishMatch[1] ? parseInt(finishMatch[1], 10) : null;
      this.finishCommand(exitCode);
    }

    // Buffer output if executing
    const cleaned = this.stripOsc(data);
    if (this.state === 'executing' && cleaned) {
      this.outputBuffer.append(cleaned);
    }

    return true;
  }

  private feedRegex(data: string): void {
    const stripped = this.stripAnsi(data);

    // Check if this looks like a prompt (even while executing — this ends the command)
    const isPrompt = CommandDetector.PROMPT_PATTERNS.some(p => p.test(stripped));

    if (isPrompt) {
      if (this.state === 'executing') {
        this.finishCommand(null);
      }
      this.state = 'prompt';
    } else if (this.state === 'executing') {
      this.outputBuffer.append(data);
    }

    this.resetSilenceTimer();
  }

  /**
   * Call this when the user sends input (stdin).
   */
  onStdin(data: string): void {
    if (data === '\r' || data === '\n') {
      if (this.currentCommand.trim()) {
        const command = this.currentCommand.trim();
        this.state = 'executing';
        this.commandStartTime = Date.now();
        this.outputBuffer = new OutputBuffer();
        this.emit('commandStart', { command } as CommandStartEvent);
        this.currentCommand = '';
      } else {
        this.currentCommand = '';
      }
    } else if (data === '\x7f') {
      // Backspace
      this.currentCommand = this.currentCommand.slice(0, -1);
    } else if (data === '\x03') {
      // Ctrl+C — cancel current input
      this.currentCommand = '';
      if (this.state === 'executing') {
        this.finishCommand(130);
      }
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Printable character
      this.currentCommand += data;
    }
  }

  private finishCommand(exitCode: number | null): void {
    if (this.state !== 'executing') return;
    const durationMs = Date.now() - this.commandStartTime;
    const output = this.outputBuffer.flush();
    this.state = 'idle';
    this.clearSilenceTimer();
    this.emit('commandEnd', { exitCode, durationMs, output } as CommandEndEvent);
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.state === 'executing') {
      this.silenceTimer = setTimeout(() => {
        // Long silence while executing — command likely done
        // We'll wait for the next prompt detection to confirm
      }, 300);
    }
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b[()][0-9A-Z]/g, '');
  }

  private stripOsc(str: string): string {
    return str.replace(/\x1b\]133;[^\x07]*\x07/g, '');
  }
}
