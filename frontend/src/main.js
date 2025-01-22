import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './index.css';
import vue3GoogleLogin from 'vue3-google-login';
import Vue3Toastify from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import store from './store'; // Import the store

const app = createApp(App);

// Set global property
app.config.globalProperties.$isLogged = false

// Pass the app instance to the router
router.app = app;

// Use the store
app.use(store);

app.use(router)
    .use(vue3GoogleLogin, {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    })
    .use(Vue3Toastify, {
        autoClose: 3000,
        // ...
    })
    .mount('#app');

