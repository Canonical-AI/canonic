import { $node } from '@milkdown/utils'
import { visit, SKIP } from 'unist-util-visit'

export function wikiLinkRemarkPlugin() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      const regex = /\[\[\s*([^\]#\s][^\]#]*?)\s*(?:#([^\]]+?))?\s*\]\]/g
      let match
      let lastIndex = 0
      const newNodes = []
      let found = false

      regex.lastIndex = 0
      while ((match = regex.exec(node.value)) !== null) {
        found = true
        if (match.index > lastIndex) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) })
        }
        const wlName = match[1].trim()
        const wlAnchor = match[2] ? `#${match[2].trim()}` : null
        newNodes.push({
          type: 'wikiLink',
          value: wlAnchor ? `${wlName}${wlAnchor}` : wlName,
          data: { name: wlName, anchor: wlAnchor },
        })
        lastIndex = regex.lastIndex
      }

      if (found) {
        if (lastIndex < node.value.length) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex) })
        }
        parent.children.splice(index, 1, ...newNodes)
        return [SKIP, index + newNodes.length]
      }
    })
  }
}

export const wikiLinkNode = $node('wiki_link', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    name: { default: '' },
    anchor: { default: null },
  },
  parseDOM: [{
    tag: 'span[data-type="wiki-link"]',
    getAttrs: (dom) => ({
      name: dom.dataset.name || '',
      anchor: dom.dataset.anchor || null,
    }),
  }],
  toDOM: (node) => ['span', {
    'data-type': 'wiki-link',
    'data-name': node.attrs.name,
    'data-anchor': node.attrs.anchor || '',
  }],
  parseMarkdown: {
    match: (node) => node.type === 'wikiLink',
    runner: (state, node, type) => {
      // Prefer structured data.name/anchor; fall back to splitting value for compat
      let name, anchor
      if (node.data?.name !== undefined) {
        name = node.data.name
        anchor = node.data.anchor ?? null
      } else {
        const raw = node.value || ''
        const hashIdx = raw.indexOf('#')
        name = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw
        anchor = hashIdx >= 0 ? `#${raw.slice(hashIdx + 1)}` : null
      }
      state.addNode(type, { name, anchor })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wiki_link',
    runner: (state, node) => {
      const anchor = node.attrs.anchor || ''
      state.addNode('text', undefined, `[[${node.attrs.name}${anchor}]]`)
    },
  },
}))
