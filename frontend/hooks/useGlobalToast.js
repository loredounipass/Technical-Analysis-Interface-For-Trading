import {
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
  showAuthRequiredToast,
} from "@/components/global-toast"
import { useAuth } from "@/hooks/useAuth"
import { useCallback } from "react"

export function useGlobalToast() {
  const { openLoginDialog } = useAuth()

  const notifyAuthRequired = useCallback(
    (message) => {
      showAuthRequiredToast(message, () => openLoginDialog())
    },
    [openLoginDialog]
  )

  return {
    showSuccessToast,
    showErrorToast,
    showWarningToast,
    showInfoToast,
    showAuthRequiredToast: notifyAuthRequired,
  }
}

