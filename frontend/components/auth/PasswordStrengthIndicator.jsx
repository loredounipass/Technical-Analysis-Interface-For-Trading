"use client"

import React from "react"
import { Check, X } from "lucide-react"

export function validatePasswordRules(password = "") {
  return [
    {
      id: "length",
      label: "8 a 72 caracteres",
      valid: password.length >= 8 && password.length <= 72,
    },
    {
      id: "uppercase",
      label: "Al menos una mayúscula (A-Z)",
      valid: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "Al menos una minúscula (a-z)",
      valid: /[a-z]/.test(password),
    },
    {
      id: "digit",
      label: "Al menos un número (0-9)",
      valid: /\d/.test(password),
    },
    {
      id: "symbol",
      label: "Al menos un carácter especial (!@#$...)",
      valid: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?\/~`'"\\^]/.test(password),
    },
  ]
}

export function PasswordStrengthIndicator({ password = "" }) {
  const rules = validatePasswordRules(password)
  const hasTyped = password.length > 0

  return (
    <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-[#09111b] border border-[#16283d] text-[11px] font-mono">
      <div className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">
        Requisitos de seguridad:
      </div>
      {rules.map((rule) => {
        const isMet = rule.valid
        return (
          <div
            key={rule.id}
            className={`flex items-center gap-1.5 transition-colors ${
              isMet
                ? "text-[#00f5c4]"
                : hasTyped
                ? "text-[#ff3b69]/80"
                : "text-slate-500"
            }`}
          >
            {isMet ? (
              <Check className="w-3 h-3 text-[#00f5c4] flex-shrink-0" />
            ) : (
              <X className={`w-3 h-3 flex-shrink-0 ${hasTyped ? "text-[#ff3b69]" : "text-slate-500"}`} />
            )}
            <span>{rule.label}</span>
          </div>
        )
      })}
    </div>
  )
}

