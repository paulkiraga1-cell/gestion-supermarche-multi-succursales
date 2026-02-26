import { defineStore } from 'pinia'
import type { AuthState, LoginRequest, User } from '@/types/auth'
import { authService } from '@/services/auth'
import { useAppStore } from './app'
import { buildLogoUrl } from '@/config/api'
import { tokenWatcher } from '@/services/tokenWatcher'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    isAuthenticated: false
  }),

  getters: {
    isLoggedIn: (state) => state.isAuthenticated && !!state.token,
    currentUser: (state) => state.user,
    userRole: (state) => state.user?.role,
    supermarket: (state) => state.user?.supermarket,
    hasCustomBranding: (state) => !!state.user?.supermarket
  },

  actions: {
    async login(credentials: LoginRequest) {
      try {
        const response = await authService.login(credentials)

        // Stocker le token et l'utilisateur
        this.token = response.token
        this.user = response.user
        this.isAuthenticated = true

        // Persister dans localStorage
        localStorage.setItem(TOKEN_KEY, response.token)
        localStorage.setItem(USER_KEY, JSON.stringify(response.user))

        // Appliquer le thème personnalisé si disponible
        this.applyCustomBranding()

        // Démarrer la surveillance du token
        tokenWatcher.startWatching()

        return response
      } catch (error) {
        this.clearAuth()
        throw error
      }
    },

    async logout() {
      try {
        await authService.logout()
      } catch (error) {
        console.warn('Erreur lors de la déconnexion:', error)
      } finally {
        this.clearAuth()
        this.resetBranding()
        // Arrêter la surveillance du token
        tokenWatcher.stopWatching()
      }
    },

    async initAuth() {
      const token = this.token
      if (token) {
        try {
          const isValid = await authService.verifyToken(token)
          if (isValid) {
            this.isAuthenticated = true
            this.applyCustomBranding()
            // Démarrer la surveillance du token pour les sessions existantes
            tokenWatcher.startWatching()
          } else {
            this.clearAuth()
          }
        } catch {
          this.clearAuth()
        }
      }
    },

    clearAuth() {
      this.token = null
      this.user = null
      this.isAuthenticated = false
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      // Arrêter la surveillance du token lors du nettoyage
      tokenWatcher.stopWatching()
    },

    applyCustomBranding() {
      if (this.user?.supermarket) {
        const appStore = useAppStore()
        appStore.setBranding({
          logo: buildLogoUrl(this.user.supermarket.logo) || '/favicon.ico',
          primaryColor: this.user.supermarket.primaryColor || 'hsl(263.4,70%,50.4%)',
          secondaryColor: this.user.supermarket.secondaryColor || 'hsl(215,27.9%,16.9%)',
          supermarketName: this.user.supermarket.name
        })
      }
    },

    resetBranding() {
      const appStore = useAppStore()
      appStore.resetBranding()
    },

    updateUser(user: User) {
      this.user = user
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      this.applyCustomBranding()
    },

    // Déconnexion forcée en cas d'expiration de token
    forceLogout(reason: string = 'Token expiré') {
      console.warn(`🔒 Déconnexion forcée: ${reason}`)
      this.clearAuth()
      this.resetBranding()
    }
  }
})