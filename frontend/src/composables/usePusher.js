// src/composables/usePusher.js (note lowercase 'u')
import Pusher from 'pusher-js';

export function usePusher() {
  const pusher = new Pusher(import.meta.env.VITE_PUSHER_APP_KEY, {
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
    forceTLS: true
  });

  const subscribe = (channelName, eventName, callback) => {
    const channel = pusher.subscribe(channelName);
    channel.bind(eventName, callback);
    return () => pusher.unsubscribe(channelName);
  };

  return { subscribe };
}