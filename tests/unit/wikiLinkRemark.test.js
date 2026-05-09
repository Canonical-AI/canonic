import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

const { wikiLinkRemarkPlugin } = await import('../../src/components/editor/wiki-link/index.js')

function parse(md) {
  const processor = unified().use(remarkParse).use(wikiLinkRemarkPlugin)
  const tree = processor.runSync(processor.parse(md))
  const links = []
  visit(tree, 'wikiLink', (node) => { links.push(node) })
  return links
}

describe('wikiLinkRemarkPlugin', () => {
  it('parses a basic wiki link', () => {
    const links = parse('See [[design]] for details.')
    expect(links).toHaveLength(1)
    expect(links[0].data.name).toBe('design')
    expect(links[0].data.anchor).toBeNull()
  })

  it('parses a wiki link with heading anchor', () => {
    const links = parse('See [[product-vision#risks]].')
    expect(links).toHaveLength(1)
    expect(links[0].data.name).toBe('product-vision')
    expect(links[0].data.anchor).toBe('#risks')
  })

  it('parses a wiki link with line anchor', () => {
    const links = parse('See [[doc#L23-L55]].')
    expect(links).toHaveLength(1)
    expect(links[0].data.name).toBe('doc')
    expect(links[0].data.anchor).toBe('#L23-L55')
  })

  it('parses multiple wiki links in one paragraph', () => {
    const links = parse('See [[alpha]] and [[beta]].')
    expect(links).toHaveLength(2)
    expect(links[0].data.name).toBe('alpha')
    expect(links[1].data.name).toBe('beta')
  })

  it('does not parse incomplete brackets', () => {
    expect(parse('[not a link]')).toHaveLength(0)
    expect(parse('[[unclosed')).toHaveLength(0)
  })

  it('trims whitespace from name', () => {
    const links = parse('[[ design ]]')
    expect(links[0].data.name).toBe('design')
  })
})
