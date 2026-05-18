export function normalizeBinding(binding) {
  if (!binding) return ''
  return binding
    .toLowerCase()
    .split('-')
    .map((t) => (t === 'cmd' || t === 'meta' || t === 'ctrl' || t === 'control' ? 'mod' : t === 'option' ? 'alt' : t))
    .join('-')
}

export function matchesHotkey(event, binding) {
  if (!binding) return false
  const tokens = normalizeBinding(binding).split('-')
  if (tokens.length === 0) return false

  const key = tokens[tokens.length - 1]
  const mods = new Set(tokens.slice(0, -1))

  const needsMod = mods.has('mod')
  const needsShift = mods.has('shift')
  const needsAlt = mods.has('alt')

  const eventMod = event.metaKey || event.ctrlKey

  if (needsMod !== eventMod) return false
  if (needsShift !== event.shiftKey) return false
  if (needsAlt !== event.altKey) return false

  return (event.key || '').toLowerCase() === key
}
