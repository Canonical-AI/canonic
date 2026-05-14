import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'

// Session-only state — resets on every app launch
const sessionDismissed = ref([])
const sessionHidden = ref(false)

// Set by MainLayout on startup; suppresses the default-editor hint immediately
const alreadyDefaultEditor = ref(false)
export function markDefaultEditorActive() { alreadyDefaultEditor.value = true }

export const HINTS = [
  {
    id: 'inline-completions-setup',
    title: 'Inline completions',
    body: 'Get ghost-text completions as you type — Tab to accept. Needs a free Codestral key.',
    action: { label: 'Set up', target: 'settings:providers' },
    condition: (config) => !config?.completion?.providerId,
  },
  {
    id: 'default-editor-setup',
    title: 'Default editor',
    body: 'Make Canonic your default markdown editor so .md files open here directly from Finder.',
    action: { label: 'Set as default', target: 'settings:profile' },
    condition: () => !alreadyDefaultEditor.value,
  },
  {
    id: 'git-history',
    title: 'Version history',
    body: 'Every save is a git commit. Your full edit history is always recoverable from the version panel.',
  },
  {
    id: 'real-time-sharing',
    title: 'Live sharing',
    body: 'Share a workspace with teammates and see edits sync in real time. Enable it in Settings → Sharing.',
    action: { label: 'Sharing settings', target: 'settings:sharing' },
  },
  {
    id: 'ai-spark',
    title: 'AI assistant',
    body: 'Canonic has a built-in AI writing assistant. Add a provider in Settings → AI to get started.',
    action: { label: 'Add provider', target: 'settings:providers' },
  },
  {
    id: 'hotkeys',
    title: 'Custom hotkeys',
    body: 'Select-line, move-up, and move-down are all remappable. Find them in Settings → Hotkeys.',
    action: { label: 'Hotkeys', target: 'settings:hotkeys' },
  },
  {
    id: 'peer-network',
    title: 'Peer discovery',
    body: 'Canonic finds other Canonic users on your local network. Their files appear in your sidebar automatically.',
  },
  {
    id: 'auto-save',
    title: 'Auto-save',
    body: 'Every keystroke is saved immediately. No Cmd+S, no lost work.',
  },
  {
    id: 'drag-md-file',
    title: 'Open any file',
    body: 'Drag any .md file onto Canonic to open it — no workspace or git repo required.',
  },
  {
    id: 'multiple-workspaces',
    title: 'Multiple workspaces',
    body: 'Add as many git repos as you like and switch between them instantly from the sidebar.',
  },
  {
    id: 'default-workspace',
    title: 'Default workspace',
    body: 'Set a default workspace folder in Settings → Workspace so Canonic opens ready to write.',
    action: { label: 'Workspace settings', target: 'settings:workspace' },
  },
  {
    id: 'local-first',
    title: 'Local-first & open source',
    body: 'Your files never leave your machine unless you share them. Canonic is fully open source on GitHub.',
  },
]

export function useHints(config) {
  const enabled = useLocalStorage('canonic:hintsEnabled', true)
  const currentIndex = ref(0)

  const visibleHints = computed(() => {
    if (!enabled.value || sessionHidden.value) return []
    return HINTS.filter(
      (h) => !sessionDismissed.value.includes(h.id) && (!h.condition || h.condition(config?.value))
    )
  })

  const current = computed(() => visibleHints.value[currentIndex.value] ?? null)
  const total = computed(() => visibleHints.value.length)
  const hasNext = computed(() => currentIndex.value < visibleHints.value.length - 1)
  const hasPrev = computed(() => currentIndex.value > 0)

  function next() {
    if (hasNext.value) currentIndex.value++
  }

  function prev() {
    if (hasPrev.value) currentIndex.value--
  }

  function dismiss() {
    sessionHidden.value = true
  }

  function disableAll() {
    enabled.value = false
  }

  function reset() {
    sessionDismissed.value = []
    sessionHidden.value = false
    currentIndex.value = 0
  }

  return { enabled, current, total, hasNext, hasPrev, next, prev, dismiss, disableAll, reset, currentIndex }
}
