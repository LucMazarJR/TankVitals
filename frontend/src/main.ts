import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

// O Pinia entra antes do router: a guarda das rotas consulta o store de login.
createApp(App).use(createPinia()).use(router).mount('#app')
