"use client"

import React from "react"

/**
 * Renderizador de Markdown adaptado a la estética Cyber-Quant.
 * Procesa encabezados, tablas, bloques de código, listas, citas,
 * y destaca automáticamente pares y temporalidades con píldoras de estilo terminal.
 */
export function renderMarkdown(text, currentSymbol, currentInterval) {
  if (!text) return null
  const lines = text.split("\n")
  const elements = []
  let listItems = []
  let tableRows = []
  let inTable = false
  let inCodeBlock = false
  let codeBlockLines = []
  let codeBlockLang = ""

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 ml-5 space-y-1.5 list-disc marker:text-emerald-400 text-slate-300 text-[13px]">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto border border-emerald-500/20 rounded-lg bg-[#04090d]">
          <table className="w-full text-left border-collapse text-[12px] font-mono">
            <tbody>
              {tableRows.map((row, rIdx) => {
                const isHeader = rIdx === 0
                const isSeparator = row.every((cell) => cell.includes("---"))
                if (isSeparator) return null
                return (
                  <tr
                    key={rIdx}
                    className={
                      isHeader
                        ? "bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-300 font-semibold"
                        : "border-b border-slate-800/60 hover:bg-emerald-950/20"
                    }
                  >
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`px-3 py-2 ${isHeader ? "text-emerald-300 font-bold" : "text-slate-300"}`}>
                        {formatInline(cell.trim(), `${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      tableRows = []
      inTable = false
    }
  }

  const formatInline = (line, keyPrefix) => {
    let result = []
    let keyIdx = 0

    // Inline code (`text`)
    const partsCode = line.split(/(`.*?`)/)
    partsCode.forEach((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        result.push(
          <code
            key={`${keyPrefix}-c-${keyIdx++}`}
            className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        )
      } else {
        // Bold (**text**)
        const partsBold = part.split(/(\*\*.*?\*\*)/)
        partsBold.forEach((bPart) => {
          if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length >= 4) {
            const rawBold = bPart.slice(2, -2)
            if (rawBold === currentSymbol || rawBold.includes("USDT") || rawBold.includes("/")) {
              result.push(
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="text-white font-bold tracking-wide">
                  {rawBold}
                </strong>
              )
            } else if (
              rawBold.toLowerCase().includes("minuto") ||
              rawBold.toLowerCase().includes("hora") ||
              rawBold === currentInterval
            ) {
              result.push(
                <span
                  key={`${keyPrefix}-badge-${keyIdx++}`}
                  className="inline-flex mx-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-semibold"
                >
                  {rawBold}
                </span>
              )
            } else {
              result.push(
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="font-semibold text-emerald-300">
                  {rawBold}
                </strong>
              )
            }
          } else {
            // Italics (*text*)
            const partsItalic = bPart.split(/(\*.*?\*)/)
            partsItalic.forEach((iPart) => {
              if (iPart.startsWith("*") && iPart.endsWith("*") && iPart.length >= 2) {
                result.push(
                  <em key={`${keyPrefix}-i-${keyIdx++}`} className="italic text-slate-400">
                    {iPart.slice(1, -1)}
                  </em>
                )
              } else if (iPart) {
                result.push(iPart)
              }
            })
          }
        })
      }
    })
    return result.length > 0 ? result : line
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg bg-[#04080c] border border-emerald-500/25 overflow-hidden">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-emerald-950/40 border-b border-emerald-500/20 text-[10px] text-emerald-400 font-mono uppercase tracking-wider">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3 overflow-x-auto text-[12px] text-emerald-300 font-mono leading-relaxed">
              <code>{codeBlockLines.join("\n")}</code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeBlockLines = []
        codeBlockLang = ""
      } else {
        flushList()
        flushTable()
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
      }
      return
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      return
    }

    // Table parsing
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList()
      inTable = true
      const cells = trimmed.split("|").slice(1, -1)
      tableRows.push(cells)
      return
    } else if (inTable) {
      flushTable()
    }

    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(
        <h4 key={i} className="font-semibold text-emerald-300 text-[14px] mt-4 mb-2 flex items-center gap-2">
          {formatInline(trimmed.slice(4), i)}
        </h4>
      )
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(
        <h3 key={i} className="font-bold text-white text-[16px] mt-5 mb-2.5 border-b border-emerald-500/20 pb-1.5 tracking-wide">
          {formatInline(trimmed.slice(3), i)}
        </h3>
      )
    } else if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(
        <h2 key={i} className="font-bold text-white text-[18px] mt-6 mb-3 uppercase tracking-wider font-mono">
          {formatInline(trimmed.slice(2), i)}
        </h2>
      )
    } else if (/^[-*•]\s/.test(trimmed)) {
      listItems.push(
        <li key={i} className="text-slate-300">
          {formatInline(trimmed.replace(/^[-*•]\s/, ""), i)}
        </li>
      )
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList()
      elements.push(
        <div key={i} className="my-1.5 flex gap-2 text-[13px]">
          <span className="text-emerald-400 font-mono font-bold flex-shrink-0 mt-0.5">{trimmed.match(/^\d+\./)[0]}</span>
          <span className="text-slate-300">{formatInline(trimmed.replace(/^\d+\.\s/, ""), i)}</span>
        </div>
      )
    } else if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={i} className="pl-3 border-l-2 border-emerald-400 my-2 text-slate-300 italic bg-emerald-950/20 py-1.5 pr-2 rounded-r text-[13px]">
          {formatInline(trimmed.slice(2), i)}
        </blockquote>
      )
    } else if (trimmed === "") {
      flushList()
      elements.push(<div key={i} className="h-2" />)
    } else {
      flushList()
      elements.push(
        <p key={i} className="text-slate-200 my-1.5 leading-relaxed text-[13px]">
          {formatInline(trimmed, i)}
        </p>
      )
    }
  })

  if (inCodeBlock) {
    elements.push(
      <div key="code-unclosed" className="my-3 rounded-lg bg-[#04080c] border border-emerald-500/25 overflow-hidden">
        <pre className="p-3 overflow-x-auto text-[12px] text-emerald-300 font-mono leading-relaxed">
          <code>{codeBlockLines.join("\n")}</code>
        </pre>
      </div>
    )
  }

  flushList()
  flushTable()
  return elements
}
