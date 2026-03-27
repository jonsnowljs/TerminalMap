import { nanoid } from 'nanoid';
import type { Branch } from '@mindmap/shared';
import { Queries } from '../db/queries.js';

export class BranchService {
  constructor(private queries: Queries) {}

  createRootBranch(sessionId: string): string {
    const id = nanoid();
    this.queries.createBranch(id, sessionId, null, null, 'main');
    return id;
  }

  branchFromNode(sessionId: string, forkNodeId: string, name?: string): string {
    const id = nanoid();
    // Find which branch the fork node belongs to
    const nodes = this.queries.getSessionNodes(sessionId);
    const forkNode = nodes.find(n => n.id === forkNodeId);
    const parentBranchId = forkNode?.branchId ?? null;
    const branchName = name || `branch-${id.slice(0, 6)}`;
    this.queries.createBranch(id, sessionId, parentBranchId, forkNodeId, branchName);
    return id;
  }

  listBranches(sessionId: string): Branch[] {
    return this.queries.listBranches(sessionId);
  }
}
