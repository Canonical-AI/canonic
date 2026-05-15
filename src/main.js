import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import 'prosemirror-view/style/prosemirror.css'

if (localStorage.getItem('canonic:window-blur') !== 'false') {
    document.documentElement.classList.add('window-blur')
}
document.documentElement.style.setProperty(
    '--blur-opacity',
    localStorage.getItem('canonic:blur-opacity') ?? '0.72'
)

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
