<template>
  <AdminLayout>
    <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-md">
      <h1 class="text-2xl font-bold mb-6">Reset Passwords</h1>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <FormTextarea v-model="emails" label="Emails" required />
        <FormInput v-model="password" type="password" label="New Password" required />
        <label class="flex items-center space-x-2">
          <input v-model="changePassword" type="checkbox" class="rounded text-blue-500">
          <span>Change Password</span>
        </label>
        <button type="submit" class="btn-primary">Submit</button>
      </form>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref } from 'vue'
import AdminLayout from '../components/layout/AdminLayout.vue'
import FormTextarea from '../components/forms/FormTextarea.vue'
import FormInput from '../components/forms/FormInput.vue'

const emails = ref('')
const password = ref('')
const changePassword = ref(false)

const handleSubmit = async () => {
  // Implement API call
}
</script>