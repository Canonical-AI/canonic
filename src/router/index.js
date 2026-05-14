import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceSetup from '../components/layout/WorkspaceSetup.vue'
import MainLayout from '../components/layout/MainLayout.vue'
import { useAppStore } from '../store'

const routes = [
  { path: '/', component: WorkspaceSetup },
  { path: '/workspace', component: MainLayout }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// If the app reloads with the hash at /workspace but the store has a recent workspace,
// MainLayout will auto-restore it. If there are no recent workspaces at all, go to picker.
router.beforeEach((to) => {
  if (to.path === '/workspace') {
    const store = useAppStore()
    if (!store.workspacePath && !store.currentFile && store.recentWorkspaces.length === 0) {
      return '/'
    }
  }
})

export default router
