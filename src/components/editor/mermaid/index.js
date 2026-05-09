import { $node } from '@milkdown/utils'
import { visit, SKIP } from 'unist-util-visit'

// Remark plugin: convert ```mermaid fenced code blocks into mermaidBlock AST nodes
export function mermaidRemarkPlugin() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return
      const mermaidNode = {
        type: 'mermaidBlock',
        value: node.value,
      }
      parent.children.splice(index, 1, mermaidNode)
      return [SKIP, index]
    })
  }
}

export const mermaidNode = $node('mermaid_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    value: { default: '' },
  },
  parseDOM: [{
    tag: 'div[data-type="mermaid"]',
    getAttrs: (dom) => ({ value: dom.dataset.value || '' }),
  }],
  toDOM: (node) => ['div', { 'data-type': 'mermaid', 'data-value': node.attrs.value }],
  parseMarkdown: {
    match: (node) => node.type === 'mermaidBlock',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'mermaid_block',
    runner: (state, node) => {
      state.addNode('code', undefined, node.attrs.value, { lang: 'mermaid', meta: null })
    },
  },
}))
