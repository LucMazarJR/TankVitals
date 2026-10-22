import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Fonte servida pelo próprio app: a apresentação não depende de internet.
import '@fontsource/nunito-sans/400.css'
import '@fontsource/nunito-sans/600.css'
import '@fontsource/nunito-sans/700.css'
import '@fontsource/nunito-sans/800.css'
import './style.css'
// Aplica o contraste guardado antes de montar, para a tela não piscar.
import './composables/usePreferences'
import App from './App.vue'
import router from './router'

// O Pinia entra antes do router: a guarda das rotas consulta o store de login.
createApp(App).use(createPinia()).use(router).mount('#app')
