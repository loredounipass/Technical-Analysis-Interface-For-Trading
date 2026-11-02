"use client"

import React from "react"

/**
 * Logo de Woody Agent: cabeza robotica (antena + orejas) con ojos de velas
 * japonesas (verde alcista / rojo bajista, siguiendo la convencion de color de
 * la app) y boca de mini-grafico. Es vectorial (SVG) para que se vea nitido en
 * cualquier tamano: header del chat, lanzador flotante, etc.
 *
 * Las partes estructurales usan currentColor (heredan el color del contenedor);
 * los ojos mantienen verde/rojo fijos para conservar la identidad "trader".
 */
export default function WoodyAgentIcon({ className }) {
  const up = "#00f5c4"
  const down = "#ff3b69"
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Woody Agent"
    >
      {/* Antena + nodo */}
      <line x1="12" y1="7" x2="12" y2="4.3" />
      <circle cx="12" cy="3.2" r="1" fill="currentColor" stroke="none" />

      {/* Cabeza robotica */}
      <rect x="4.5" y="7" width="15" height="11.3" rx="2.8" />

      {/* Orejas */}
      <line x1="4.5" y1="10.2" x2="3.1" y2="10.2" />
      <line x1="4.5" y1="14" x2="3.1" y2="14" />
      <line x1="19.5" y1="10.2" x2="20.9" y2="10.2" />
      <line x1="19.5" y1="14" x2="20.9" y2="14" />

      {/* Ojo izquierdo: vela alcista */}
      <line x1="8.6" y1="9.4" x2="8.6" y2="13.7" stroke={up} />
      <rect x="7.6" y="10.3" width="2" height="2.4" rx="0.4" fill={up} stroke="none" />

      {/* Ojo derecho: vela bajista */}
      <line x1="15.4" y1="9.4" x2="15.4" y2="13.7" stroke={down} />
      <rect x="14.4" y="10.3" width="2" height="2.4" rx="0.4" fill={down} stroke="none" />

      {/* Boca: linea de precio */}
      <polyline points="7,16.2 9.6,15.2 12,16.5 14.4,15 17,16.2" />
    </svg>
  )
}
