/**
 * Servicio de autenticación — comunicación con /api/auth/*.
 *
 * Cada función habla con un endpoint concreto del backend y devuelve la
 * respuesta JSON parseada o lanza un Error con el mensaje del servidor.
 *
 * Las rutas @public (register, login, refresh) usan `skipAuth: true` para
 * que el interceptor de httpClient NO inyecte el Bearer token.
 */
import { httpRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"
import {
  getRefreshToken,
  setSession,
  updateTokens,
  clearSession,
  getAccessToken,
} from "../auth/tokenManager"

/**
 * POST /api/auth/register — Crea una cuenta nueva.
 * @param {{ email: string, username: string, password: string }} data
 * @returns {Promise<AuthResponseDTO>}
 */
export async function registerUser(data) {
  const response = await httpRequest(ENDPOINTS.authRegister(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data,
    skipAuth: true,
    retries: 0,
  })
  setSession(response)
  return response
}

/**
 * POST /api/auth/login — Inicia sesión.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<AuthResponseDTO>}
 */
export async function loginUser(credentials) {
  const response = await httpRequest(ENDPOINTS.authLogin(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: credentials,
    skipAuth: true,
    retries: 0,
  })
  setSession(response)
  return response
}

/**
 * POST /api/auth/refresh — Renueva el access token usando el refresh token.
 * @returns {Promise<{ access_token, refresh_token, token_type, expires_in }>}
 */
export async function refreshAccessToken() {
  const refresh_token = getRefreshToken()
  if (!refresh_token) {
    throw new Error("No refresh token available.")
  }
  const response = await httpRequest(ENDPOINTS.authRefresh(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { refresh_token },
    skipAuth: true,
    retries: 0,
  })
  updateTokens(response)
  return response
}

/**
 * POST /api/auth/logout — Cierra la sesión actual (o todas).
 * @param {{ refresh_token?: string, all_devices?: boolean }} [options]
 */
export async function logoutUser(options = {}) {
  const accessToken = getAccessToken()
  try {
    if (accessToken) {
      await httpRequest(ENDPOINTS.authLogout(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: options,
        retries: 0,
      })
    }
  } catch {
    // Si el logout falla en el servidor (token ya expirado, etc.),
    // limpiamos la sesión local de todas formas.
  }
  clearSession()
}

/**
 * GET /api/auth/profile — Obtiene el perfil del usuario autenticado.
 * @returns {Promise<UserResponseDTO>}
 */
export async function fetchUserProfile() {
  return httpRequest(ENDPOINTS.authProfile(), { retries: 0 })
}

