export function shouldFitWorkspaceCanvas(
  workspaceId: string | null | undefined,
  nodeCount: number,
  lastFittedWorkspaceId: string | null,
  lastFittedNodeCount = -1,
): boolean {
  if (!workspaceId || nodeCount <= 0) return false;
  if (workspaceId !== lastFittedWorkspaceId) return true;
  return lastFittedNodeCount !== nodeCount;
}
