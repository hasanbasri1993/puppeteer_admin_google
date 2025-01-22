<!-- src/views/Login.vue -->
<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow rounded-lg sm:px-10">
        <div class="text-center">
          <h2 class="text-3xl font-extrabold text-gray-900 mb-8">
            Google Admin Management
          </h2>
          <div class="mt-6">
            <GoogleLogin @success="handleLoginSuccess" @error="handleLoginError" />
          </div>
          <p v-if="errorMessage" class="mt-4 text-red-600 text-sm">
            {{ errorMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import GoogleLogin from '../components/auth/GoogleLogin.vue'
import store from '../store'

const router = useRouter()
const errorMessage = ref('') 

// Handle successful Google login
const handleLoginSuccess = (response) => {

}

// Handle login errors
const handleLoginError = (error) => {
  console.error('Login error:', error)
  errorMessage.value = 'Failed to login with Google. Please try again.'
}

onMounted(() => {
})
</script>

<style scoped>
/* Additional custom styles if needed */
</style>