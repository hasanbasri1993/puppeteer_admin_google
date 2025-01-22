<template>
  <div class="min-h-screen bg-gray-50">
    <router-view />
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { watchEffect } from "vue";
import store from "@/store";

const router = useRouter();

// Optional: Handle initial auth state
watchEffect(() => {
  const isAuthenticated = store.state.islogged
  if (!isAuthenticated && router.currentRoute.value.meta.requiresAuth) {
    router.push("/login");
  }
});
</script>

<style>
/* Global styles can be added here */
</style>