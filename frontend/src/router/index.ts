import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import PlaceholderView from '../views/PlaceholderView.vue'
import { PAGES, type PageDef } from './pages'

declare module 'vue-router' {
  interface RouteMeta {
    /** Rota que abre sem login. */
    public?: boolean
    title?: string
    page?: PageDef
  }
}

const pageRoutes: RouteRecordRaw[] = PAGES.map((page) => ({
  path: page.path,
  name: page.name,
  component: page.component ?? PlaceholderView,
  meta: { title: page.title, page },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true, title: 'Entrar' } },
    {
      path: '/',
      component: AppLayout,
      children: [{ path: '', redirect: { name: 'dashboard' } }, ...pageRoutes],
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // Quem já está logado não tem o que fazer na tela de login.
    return auth.isAuthenticated && to.name === 'login' ? { name: 'dashboard' } : true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // O menu já esconde o que o papel não pode; isto barra quem digita a URL direto.
  const permission = to.meta.page?.permission
  if (permission && !auth.can(permission)) return { name: 'dashboard' }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TankVitals` : 'TankVitals'
})

export default router
