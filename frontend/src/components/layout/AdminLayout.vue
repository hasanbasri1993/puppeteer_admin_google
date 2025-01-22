<!-- src/components/layout/AdminLayout.vue -->
<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16 items-center">
          <!-- Logo/Title -->
          <div class="flex-shrink-0 flex items-center">
            <h1 class="text-lg font-semibold text-gray-900">
              Google Admin Me
            </h1>
          </div>

          <!-- Navigation Links -->
          <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
            <!-- <router-link
              to="/reset-password"
              class="inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              :class="routeClass('/reset-password')"
            >
              Reset Password
            </router-link> -->
            <router-link
              to="/turn-off-challenge"
              class="inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              :class="routeClass('/turn-off-challenge')"
            >
              Turn Off Challenge
            </router-link>
          </div>

          <!-- Logout Button -->
          <div class="flex items-center">
            <button
              @click="handleLogout"
              class="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="py-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()
const currentRoute = useRoute()

const routeClass = (path) => computed(() => ({
  'border-blue-500 text-gray-900': currentRoute.path === path,
  'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300': currentRoute.path !== path
})).value

const handleLogout = () => {
  localStorage.removeItem('google_token')
  router.push('/login')
}
</script>

<style scoped>
/* Custom transition for navigation links */
.router-link-active {
  transition: all 0.2s ease-in-out;
}
</style>