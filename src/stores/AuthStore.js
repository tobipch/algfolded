import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {apiFetch} from '@/helpers/api'
import {useDisplayStore} from '@/stores/DisplayStore'

// WCA account session. The backend keeps the session in an httpOnly cookie;
// this store only mirrors "who is logged in" for the UI and sync stores.
export const useAuthStore = defineStore('auth', () => {
    const user = ref(null) // {id, wcaId, name, avatarUrl} or null
    const loaded = ref(false) // true once the initial /me check finished

    const loggedIn = computed(() => user.value !== null)

    const refresh = async () => {
        try {
            const data = await apiFetch('/api/auth/me')
            user.value = data?.user ?? null
        } catch (_) {
            user.value = null // API unreachable (e.g. plain `npm run dev`) -> stay logged out
        } finally {
            loaded.value = true
        }
    }

    const login = () => {
        window.location.href = '/api/auth/wca'
    }

    const logout = async () => {
        try {
            await apiFetch('/api/auth/logout', {method: 'POST'})
        } catch (_) { /* cookie is cleared server-side; ignore transport errors */ }
        user.value = null
    }

    // Surface a failed OAuth roundtrip (the callback redirects to /?auth_error=1).
    const checkAuthError = (t) => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('auth_error')) {
            useDisplayStore().showToast(t('auth.login_failed'), 'danger')
            params.delete('auth_error')
            const rest = params.toString()
            const url = window.location.pathname + (rest ? '?' + rest : '') + window.location.hash
            window.history.replaceState(null, '', url)
        }
    }

    refresh()

    return {user, loaded, loggedIn, refresh, login, logout, checkAuthError}
})
