"use client"

import React from "react"

/**
 * Renderizador de Markdown adaptado a la estética Anthropic / Synapse Terminal.
 * Procesa encabezados, tablas, bloques de código, listas y citas con tipografía
 * de alta legibilidad, espaciado refinado y acentos cyan neón.
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
        <ul
          key={`ul-${elements.length}`}
          className="my-2.5 ml-5 space-y-1.5 list-disc marker:text-[#00f5c4] text-slate-300 text-[13.5px] leading-[1.65] font-sans"
        >
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div
          key={`table-${elements.length}`}
          className="my-3 overflow-x-auto border border-[#16283d] rounded-lg bg-[#050c14] shadow-sm"
        >
          <table className="w-full text-left border-collapse text-[11.5px] font-mono">
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
                        ? "bg-[#0b1622] border-b border-[#16283d] text-[#00f5c4] font-semibold"
                        : "border-b border-[#132235]/60 hover:bg-[#091522]/50 transition-colors"
                    }
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 ${
                          isHeader ? "text-[#00f5c4] font-bold" : "text-slate-300"
                        }`}
                      >
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
            className="px-1.5 py-0.5 rounded bg-[#0b1622] text-[#00f5c4] border border-[#16283d] font-mono text-[11px]"
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
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="text-white font-semibold tracking-wide">
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
                  className="inline-flex mx-1 px-1.5 py-0.5 rounded bg-[#00f5c4]/10 text-[#00f5c4] border border-[#00f5c4]/20 font-mono text-[11px] font-semibold"
                >
                  {rawBold}
                </span>
              )
            } else {
              result.push(
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="font-semibold text-white">
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
          <div key={`code-${i}`} className="my-3 rounded-lg bg-[#04080c] border border-[#16283d] overflow-hidden">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-[#0b1622] border-b border-[#16283d] text-[10px] text-[#00f5c4] font-mono uppercase tracking-wider">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3 overflow-x-auto text-[12px] text-slate-200 font-mono leading-relaxed">
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

    // Headings
    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(
        <h4 key={i} className="font-semibold text-[#00f5c4] text-[14px] mt-4 mb-2 flex items-center gap-2 font-sans tracking-tight">
          {formatInline(trimmed.slice(4), i)}
        </h4>
      )
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(
        <h3 key={i} className="font-bold text-white text-[15px] mt-5 mb-2.5 border-b border-[#16283d] pb-1.5 tracking-tight font-sans">
          {formatInline(trimmed.slice(3), i)}
        </h3>
      )
    } else if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(
        <h2 key={i} className="font-bold text-white text-[17px] mt-6 mb-3 tracking-tight font-sans">
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
        <div key={i} className="my-1.5 flex gap-2 text-[13.5px] font-sans">
          <span className="text-[#00f5c4] font-mono font-bold flex-shrink-0 mt-0.5">{trimmed.match(/^\d+\./)[0]}</span>
          <span className="text-slate-300">{formatInline(trimmed.replace(/^\d+\.\s/, ""), i)}</span>
        </div>
      )
    } else if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={i} className="pl-3 border-l-2 border-[#00f5c4] my-2.5 text-slate-300 italic bg-[#00f5c4]/5 py-2 pr-3 rounded-r text-[13.5px] font-sans">
          {formatInline(trimmed.slice(2), i)}
        </blockquote>
      )
    } else if (trimmed === "") {
      flushList()
      elements.push(<div key={i} className="h-2" />)
    } else {
      flushList()
      elements.push(
        <p key={i} className="text-slate-200 my-1.5 leading-[1.68] text-[13.5px] sm:text-[14px] font-sans">
          {formatInline(trimmed, i)}
        </p>
      )
    }
  })

  if (inCodeBlock) {
    elements.push(
      <div key="code-unclosed" className="my-3 rounded-lg bg-[#04080c] border border-[#16283d] overflow-hidden">
        <pre className="p-3 overflow-x-auto text-[12px] text-slate-200 font-mono leading-relaxed">
          <code>{codeBlockLines.join("\n")}</code>
        </pre>
      </div>
    )
  }

  flushList()
  flushTable()
  return elements
}
