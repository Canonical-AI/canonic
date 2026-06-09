import './tauri-bridge.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import 'prosemirror-view/style/prosemirror.css'

import { storage } from './utils/storage.js'

if (storage.getItem('canonic:window-transparency') !== 'false') {
    document.documentElement.classList.add('window-transparency')
}
document.documentElement.style.setProperty(
    '--blur-opacity',
    storage.getItem('canonic:transparency-opacity') ?? '0.88'
)

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
