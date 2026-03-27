export function isCanvasBranchDropTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return false
  }

  const blockedSelectors = [
    '.react-flow__handle',
    '.react-flow__node',
    '.react-flow__edge',
    '.react-flow__controls',
    '.react-flow__minimap',
    '.react-flow__panel',
  ]

  return !blockedSelectors.some((selector) => target.closest(selector))
}
