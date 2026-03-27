import { describe, expect, it } from 'vitest'
import { isCanvasBranchDropTarget } from './terminalBranchDrop.js'

function createElement(classes: string[] = [], parent: HTMLElement | null = null): HTMLElement {
  return {
    closest: (selector: string) => {
      const className = selector.startsWith('.') ? selector.slice(1) : selector
      if (classes.includes(className)) {
        return {} as Element
      }
      return parent?.closest(selector) ?? null
    },
  } as HTMLElement
}

describe('isCanvasBranchDropTarget', () => {
  it('accepts background and pane drops for creating a branched terminal', () => {
    const pane = createElement(['react-flow__pane'])
    const background = createElement(['react-flow__background'], pane)

    expect(isCanvasBranchDropTarget(pane)).toBe(true)
    expect(isCanvasBranchDropTarget(background)).toBe(true)
  })

  it('rejects drops on nodes, handles, edges, and chrome', () => {
    const node = createElement(['react-flow__node'])
    const handle = createElement(['react-flow__handle'], node)
    const edge = createElement(['react-flow__edge'])
    const controls = createElement(['react-flow__controls'])

    expect(isCanvasBranchDropTarget(node)).toBe(false)
    expect(isCanvasBranchDropTarget(handle)).toBe(false)
    expect(isCanvasBranchDropTarget(edge)).toBe(false)
    expect(isCanvasBranchDropTarget(controls)).toBe(false)
  })
})
