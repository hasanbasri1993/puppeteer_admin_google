// src/composables/useGoogleLogin.js
import { ref, onMounted } from 'vue'

export function useGoogleLogin() {
  const isReady = ref(false)
  const error = ref(null)

  const initializeGoogle = () => {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => {
        if (!window.google?.accounts?.id) {
          reject(new Error('Google Identity Services failed to load'))
          return
        }
        isReady.value = true
        resolve()
      }
      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services'))
      }
      document.head.appendChild(script)
    })
  }

  const initAuth = (clientId) => {
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        redirect_uri: 'http://localhost:5173/login' // Explicitly set

      })
    } catch (e) {
      error.value = e
    }
  }

  const handleCredentialResponse = (response) => {
    if (response.credential) {
      window.dispatchEvent(new CustomEvent('google-login-success', { detail: response }))
    } else {
      window.dispatchEvent(new CustomEvent('google-login-error', { detail: response }))
    }
  }

  const renderButton = (element, options = {}) => {
    if (!window.google?.accounts?.id) {
      throw new Error('Google Identity Services not available')
    }
    
    window.google.accounts.id.renderButton(
      element,
      { 
        theme: 'outline', 
        size: 'large', 
        width: 300,
        ...options 
      }
    )
  }

  return {
    isReady,
    error,
    initializeGoogle,
    initAuth,
    renderButton
  }
}