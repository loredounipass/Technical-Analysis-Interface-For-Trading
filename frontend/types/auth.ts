export interface User {
  id: string
  email: string
  username: string
  is_active: boolean
  created_at: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  authDialogMode: "login" | "register" | null
  authDialogMessage: string | null
  openLoginDialog: (message?: string | null) => void
  openRegisterDialog: () => void
  closeAuthDialog: () => void
  login: (credentials: { email: string; password: string }) => Promise<any>
  register: (data: { email: string; username: string; password: string }) => Promise<any>
  logout: () => Promise<void>
}

