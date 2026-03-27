import { describe, expect, it } from 'vitest';
import { shouldFitWorkspaceCanvas } from './workspaceViewport.js';

describe('shouldFitWorkspaceCanvas', () => {
  it('fits the first loaded workspace with a terminal node', () => {
    expect(shouldFitWorkspaceCanvas('ws-1', 1, null)).toBe(true);
  });

  it('does not refit the same workspace twice', () => {
    expect(shouldFitWorkspaceCanvas('ws-1', 1, 'ws-1', 1)).toBe(false);
  });

  it('refits the same workspace when terminal nodes appear after an empty state', () => {
    expect(shouldFitWorkspaceCanvas('ws-1', 1, 'ws-1', 0)).toBe(true);
  });
});
