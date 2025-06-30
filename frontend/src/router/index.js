import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/Login.vue'
import store from '@/store/index'; // Import the store

const routes = [
  { path: '/', redirect: '/turn-off-challenge' },
  { path: '/login', component: Login },
  {
    path: '/reset-password',
    component: () => import('@/views/ResetPassword.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/turn-off-challenge',
    component: () => import('@/views/TurnOffChallenge.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const isAuthenticated = store.state.islogged
  if (to.meta.requiresAuth && !isAuthenticated) next('/login')
  else next()

})

export default router