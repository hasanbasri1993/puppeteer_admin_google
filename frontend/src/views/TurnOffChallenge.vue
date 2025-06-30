<template>
  <AdminLayout>
    <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-md">
      <h1 class="text-2xl font-bold mb-6">Turn Off Challenge</h1>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <FormTextarea v-model="emails" label="NIS SANTRI" helper="contoh: 216124,234044,220644. Dengan pemisah koma." required />
        <button type="submit" class="btn-primary">Submit</button>
      </form>
      <div v-if="message" class="mt-4 p-4 rounded-lg bg-blue-50 text-blue-700">
        {{ message }}
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { usePusher } from "@/composables/usePusher";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import FormTextarea from "@/components/forms/FormTextarea.vue";
import { toast } from "vue3-toastify";

const emails = ref("");
const message = ref("");

const { subscribe } = usePusher();
let unsubscribe = null;

const handleSubmit = async () => {
  // Process emails into comma-separated IDs
  const emailsArray = emails.value
    .split(/[\n,]/)
    .map((email) => email.trim())
    .filter((email) => email);

  if (emailsArray.length === 0) {
    message.value = "Please enter at least one valid NIS SANTRI.";
    return;
  }
  

  try {
    message.value = `Loading...`;
    const response = await fetch("api/turn_off", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idS: emailsArray.join(",") }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    message.value = `Request submitted successfully!`;

  } catch (error) {
    console.error("Submission error:", error);
    message.value = "Error submitting request. Please try again.";
  }
};

onMounted(() => {
  // Subscribe to Pusher after successful POST
  unsubscribe = subscribe("turn_off", "status-update", (data) => {
    console.log("Pusher event received:", data);
    toast(`ID: ${data.id} Status: ${data.message}`, {
      autoClose: 3000,
      position: toast.POSITION.TOP_RIGHT,
    });
  });
});
</script>