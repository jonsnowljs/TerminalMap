import { useCallback, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

export type ShellStatus = 'idle' | 'initializing' | 'ready' | 'error';

export interface CompletedCommand {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  timestamp: number;
}

/**
 * Drives a real bash process compiled to WASM via @wasmer/sdk.
 *
 * I/O model:
 *  - xterm.js is used purely for display; we write all output to it
 *  - Typed characters are echoed to xterm and forwarded to bash stdin
 *  - Bash runs with PROMPT_COMMAND that emits OSC 133;D;$? before each prompt
 *    so we can detect command completion and capture the exit code
 *
 * Note: @wasmer/sdk requires SharedArrayBuffer, which needs the hosting server
 * to set Cross-Origin-Opener-Policy: same-origin and
 * Cross-Origin-Embedder-Policy: require-corp headers.
 */
export function useWasmShell(
  termRef: React.MutableRefObject<Terminal | null>,
  onCommandComplete: (cmd: CompletedCommand) => void,
) {
  const [status, setStatus] = useState<ShellStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Typed input accumulated between Enter presses
  const inputBufferRef = useRef('');
  // The command currently executing
  const activeCommandRef = useRef<{
    id: string;
    command: string;
    rawOutput: string;
    timestamp: number;
  } | null>(null);

  // OSC sequence parser state
  const oscBufferRef = useRef('');
  const inOscRef = useRef(false);

  /**
   * Process a raw stdout chunk:
   *  - Strip OSC 133 sequences and use them to fire onCommandComplete
   *  - Accumulate visible output for the active command
   *  - Write printable bytes to xterm
   */
  const processOutputChunk = useCallback(
    (chunk: string, term: Terminal) => {
      let visible = '';
      let i = 0;

      while (i < chunk.length) {
        const ch = chunk[i]!;

        if (inOscRef.current) {
          oscBufferRef.current += ch;
          const seq = oscBufferRef.current;
          // OSC ends with BEL (0x07) or ST (ESC \)
          const done = ch === '\x07' || seq.endsWith('\x1b\\');
          if (done) {
            inOscRef.current = false;
            const body = seq.replace(/\x07$/, '').replace(/\x1b\\$/, '');
            oscBufferRef.current = '';

            // OSC 133;D;exitCode → command finished
            if (body.startsWith('133;D')) {
              const exitCodeStr = body.split(';')[2];
              const exitCode = exitCodeStr !== undefined ? parseInt(exitCodeStr, 10) : null;
              if (activeCommandRef.current) {
                onCommandComplete({
                  id: activeCommandRef.current.id,
                  command: activeCommandRef.current.command,
                  output: activeCommandRef.current.rawOutput,
                  exitCode: Number.isNaN(exitCode) ? null : exitCode,
                  timestamp: activeCommandRef.current.timestamp,
                });
                activeCommandRef.current = null;
              }
            }
            // OSC 133;A, B, C — swallow silently
          }
          i++;
          continue;
        }

        // ESC ] starts an OSC sequence
        if (ch === '\x1b' && chunk[i + 1] === ']') {
          inOscRef.current = true;
          oscBufferRef.current = '';
          i += 2;
          continue;
        }

        visible += ch;
        i++;
      }

      if (visible) {
        term.write(visible);
        if (activeCommandRef.current) {
          activeCommandRef.current.rawOutput += visible;
        }
      }
    },
    [onCommandComplete],
  );

  const startShell = useCallback(async () => {
    const term = termRef.current;
    if (!term || status !== 'idle') return;

    setStatus('initializing');
    term.write('\x1b[33mInitialising WASM runtime…\x1b[0m\r\n');

    try {
      // Dynamic import keeps the main bundle lean — Wasmer SDK is large
      const { init, Wasmer } = await import('@wasmer/sdk');
      await init();

      term.write('\x1b[33mFetching bash from Wasmer registry…\x1b[0m\r\n');
      const pkg = await Wasmer.fromRegistry('sharrattj/bash');

      if (!pkg.entrypoint) {
        throw new Error('Package has no entrypoint command');
      }

      // Run bash in interactive mode (-i forces PS1/PROMPT_COMMAND even on piped stdin)
      const instance = await pkg.entrypoint.run({
        args: ['-i'],
        env: {
          TERM: 'xterm-color',
          HOME: '/root',
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          HISTFILE: '/dev/null',
        },
      });

      const encoder = new TextEncoder();
      const writer = instance.stdin!.getWriter();

      // Configure bash:
      //  PROMPT_COMMAND emits OSC 133;D;$? (command-end + exit code) before each prompt
      //  PS1 wraps the visible prompt text with OSC 133;A / 133;B markers
      const setup = [
        `PROMPT_COMMAND='printf "\\033]133;D;$?\\007"'`,
        `PS1='\\[\\033]133;A\\007\\]\\[\\033[32m\\]$ \\[\\033[0m\\]\\[\\033]133;B\\007\\]'`,
        'clear',
        '',
      ].join('\n');
      await writer.write(encoder.encode(setup));

      // Wire xterm input → bash stdin.
      // Because bash reads line-by-line from a piped stdin (not a real TTY),
      // we handle echo, backspace, and Ctrl+C ourselves.
      const dataDisposable = term.onData((data) => {
        if (data === '\r') {
          const cmd = inputBufferRef.current.trim();
          term.write('\r\n');
          if (cmd) {
            activeCommandRef.current = {
              id: crypto.randomUUID(),
              command: cmd,
              rawOutput: '',
              timestamp: Date.now(),
            };
          }
          inputBufferRef.current = '';
          writer.write(encoder.encode('\n')).catch(() => {});
        } else if (data === '\x7f') {
          // Backspace
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (data === '\x03') {
          // Ctrl+C
          term.write('^C\r\n');
          inputBufferRef.current = '';
          activeCommandRef.current = null;
          writer.write(encoder.encode('\x03')).catch(() => {});
        } else if (data === '\x04') {
          // Ctrl+D
          writer.write(encoder.encode('\x04')).catch(() => {});
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          inputBufferRef.current += data;
          term.write(data);
        }
      });

      // Pipe bash stdout → our OSC parser → xterm
      const stdoutReader = instance.stdout
        .pipeThrough(new TextDecoderStream())
        .getReader();
      (async () => {
        try {
          for (;;) {
            const { done, value } = await stdoutReader.read();
            if (done) break;
            processOutputChunk(value, term);
          }
        } catch {
          /* stream closed on shell exit */
        }
      })();

      // Pipe bash stderr straight to xterm
      const stderrReader = instance.stderr
        .pipeThrough(new TextDecoderStream())
        .getReader();
      (async () => {
        try {
          for (;;) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            term.write(value);
          }
        } catch {
          /* stream closed */
        }
      })();

      setStatus('ready');

      return () => {
        dataDisposable.dispose();
        writer.close().catch(() => {});
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus('error');
      termRef.current?.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`);
    }
  }, [termRef, status, processOutputChunk]);

  return { status, error, startShell };
}
