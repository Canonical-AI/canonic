import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceSetup from '../components/WorkspaceSetup.vue'
import MainLayout from '../components/MainLayout.vue'

const routes = [
  { path: '/', component: WorkspaceSetup },
  { path: '/workspace', component: MainLayout }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
