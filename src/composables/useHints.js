import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export const HINTS = [
  {
    id: 'inline-completions-setup',
    title: 'Inline completions',
    body: 'Get ghost-text completions as you type — Tab to accept. Needs a free Codestral key.',
    action: { label: 'Set up', target: 'settings:providers' },
    condition: (config) => !config?.completion?.providerId,
  },
]

export function useHints(config) {
  const enabled = useLocalStorage('canonic:hintsEnabled', true)
  const dismissed = useLocalStorage('canonic:dismissedHints', [])

  const current = computed(() => {
    if (!enabled.value) return null
    return HINTS.find(
      (h) =>
        !dismissed.value.includes(h.id) &&
        (!h.condition || h.condition(config?.value))
    ) ?? null
  })

  function dismiss(id) {
    dismissed.value = [...dismissed.value, id]
  }

  function reset() {
    dismissed.value = []
  }

  return { enabled, current, dismiss, reset }
}
