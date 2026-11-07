import { describe, it, expect, vi, beforeEach } from "vitest"
import { showErrorToast, showSuccessToast, showWarningToast } from "@/components/global-toast/GlobalToast"
import { toast as sonnerToast } from "sonner"

vi.mock("sonner", () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    Toaster: () => null,
  }
})

describe("Global Toast System Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("extracts backend error string from { error: '...' } payload", () => {
    showErrorToast({ error: "Invalid email or password." })
    expect(sonnerToast.error).toHaveBeenCalledWith(
      "Invalid email or password.",
      expect.objectContaining({ description: undefined })
    )
  })

  it("extracts backend message string from { message: '...' } payload", () => {
    showErrorToast({ message: "Network error occurred." })
    expect(sonnerToast.error).toHaveBeenCalledWith(
      "Network error occurred.",
      expect.objectContaining({ description: undefined })
    )
  })

  it("handles string error messages directly", () => {
    showErrorToast("Simple error string", "CUSTOM ERROR")
    expect(sonnerToast.error).toHaveBeenCalledWith(
      "Simple error string",
      expect.objectContaining({ description: "CUSTOM ERROR" })
    )
  })

  it("triggers success toast with customized styling options", () => {
    showSuccessToast("Sesión iniciada correctamente", "BIENVENIDO")
    expect(sonnerToast.success).toHaveBeenCalledWith(
      "Sesión iniciada correctamente",
      expect.objectContaining({ description: "BIENVENIDO" })
    )
  })

  it("triggers warning toast with customized styling options", () => {
    showWarningToast("Demasiados intentos de acceso", "RATE LIMIT")
    expect(sonnerToast.warning).toHaveBeenCalledWith(
      "Demasiados intentos de acceso",
      expect.objectContaining({ description: "RATE LIMIT" })
    )
  })
})
