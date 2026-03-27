import { describe, expect, it } from 'vitest';
import { summarizeSnapshotLines } from './terminalSnapshot.js';

describe('summarizeSnapshotLines', () => {
  it('keeps the newest visible lines and strips empty tail rows', () => {
    expect(
      summarizeSnapshotLines(['$', 'npm run dev', '', '', 'ready on http://localhost:5173'], 3),
    ).toEqual(['npm run dev', '', 'ready on http://localhost:5173']);
  });

  it('strips ANSI and control-sequence noise from snapshot lines', () => {
    expect(
      summarizeSnapshotLines([
        '\u001b[K\u001b[2m  \u001b[22m\u001b[1mExplored \u001b[m \u001b[0m',
        '\u001b[?25h[12;3HFind and fix a bug',
      ], 4),
    ).toEqual([
      'Explored',
      'Find and fix a bug',
    ]);
  });
});
