"use client"

import React, { useEffect, useState } from "react"
import {
  Sparkles,
  X,
  Zap,
  BarChart2,
  Scale,
  FileText,
  TrendingUp,
  Activity,
  Crosshair,
  Radar,
  Layers,
  ChevronRight,
  PiggyBank,
  LayoutGrid,
  ArrowUpRight,
  Flame,
} from "lucide-react"

/**
 * Barra inferior con botón que abre una ventana emergente de acciones
 * rápidas divididas en dos categorías: ESTRATEGIAS y ANÁLISIS.
 * Al hacer clic en una acción, se cierra la ventana y se envía el
 * comando directamente al agente.
 */
export default function ChatQuickActions({ symbol, interval, onSendQuickAction, disabled }) {
  const [isOpen, setIsOpen] = useState(false)

  // Cerrar la ventana emergente con la tecla Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  const run = (prompt) => {
    setIsOpen(false)
    onSendQuickAction(prompt)
  }

  const strategies = [
    {
      icon: Zap,
      iconColor: "text-emerald-400",
      title: "Scalping MACD + RSI",
      desc: "Entradas rápidas con cruce MACD filtrado por RSI",
      prompt: `Diseña una estrategia profesional de SCALPING para ${symbol} en timeframe ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### ⚡ Setup de Entrada
- Condiciones exactas del cruce MACD (línea vs señal) + histograma para confirmar momentum
- Filtro RSI: zona válida de entrada (ejemplo: RSI entre 40-60 para continuación, <30 para reversal)
- Confirmación con volumen: mínimo requerido vs volumen promedio actual

### 🎯 Plan de Ejecución
- Punto de entrada específico basado en el precio actual y los niveles de soporte/resistencia del terminal
- Stop Loss (en precio y en % del capital)
- Take Profit 1, TP2 y TP3 con parciales (ejemplo: 50% en TP1, 30% en TP2, 20% en TP3)
- Ratio riesgo/beneficio de cada target

### ⚙️ Gestión de Riesgo
- Tamaño de posición recomendado (% del capital)
- Máximo de operaciones consecutivas si hay pérdida
- Condiciones para NO operar (ej: ADX < 20, spread alto, volumen bajo)

### 📊 Estado Actual del Setup
Evalúa con los indicadores en vivo si el setup está ACTIVO ahora o hay que esperar. Indica exactamente qué falta para que se active.`,
    },
    {
      icon: Crosshair,
      iconColor: "text-cyan-400",
      title: "Breakout de consolidación",
      desc: "Ruptura de rango con confirmación de volumen",
      prompt: `Diseña una estrategia profesional de BREAKOUT DE CONSOLIDACIÓN para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📐 Identificación del Rango
- Usa las Bandas de Bollinger, pivots (S1-S3, R1-R3) y el precio actual para definir los límites exactos del rango de consolidación
- Ancho del rango en % y en precio absoluto
- Tiempo que lleva consolidando (basado en las últimas velas)

### 🔥 Condiciones de Breakout Válido
- Precio de ruptura alcista (por encima de qué nivel exacto)
- Precio de ruptura bajista (por debajo de qué nivel exacto)
- Volumen mínimo requerido para confirmar (vs el volumen actual)
- ADX: debe estar subiendo y cruzar >25 para confirmar fuerza
- Confirmación con cierre de vela completa (no mecha)

### 🎯 Plan de Trading
- Entrada larga: precio, SL, TP1/TP2/TP3 con ratios R:R
- Entrada corta: precio, SL, TP1/TP2/TP3 con ratios R:R
- Falso breakout: cómo identificarlo y cómo reaccionar

### 📊 Estado Actual
¿Está consolidando ahora? ¿Qué tan cerca está del breakout? Evalúa con los datos del terminal.`,
    },
    {
      icon: TrendingUp,
      iconColor: "text-amber-400",
      title: "Swing con medias móviles",
      desc: "Cruce EMA 20/50 con gestión de riesgo",
      prompt: `Diseña una estrategia profesional de SWING TRADING con medias móviles para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📈 Análisis de Tendencia Actual
- Alineación actual de EMA 50, EMA 100 y EMA 200 (¿alcista, bajista o sin tendencia?)
- Posición del precio respecto a cada EMA
- Distancia del precio a EMA 50 en % (para evaluar si está sobreextendido)

### ⚡ Setup de Entrada
- Señal primaria: cruce de EMAs o pullback a EMA con rebote
- Confirmaciones requeridas: RSI en zona favorable, MACD con histograma a favor, ADX >25
- Patrón de velas de confirmación en la zona de entrada

### 🎯 Plan de Ejecución Detallado
- Zona de entrada (rango de precio)
- Stop Loss debajo/encima de la EMA de referencia o del último swing low/high
- TP1 (conservador), TP2 (moderado), TP3 (agresivo) basados en pivots y resistencias
- Trailing stop: cómo mover el SL conforme el precio avanza

### ⏱️ Gestión de la Posición
- Tiempo esperado en la operación (días/semanas según timeframe)
- Señales de salida anticipada si la tendencia se debilita
- % de capital recomendado por operación

### 📊 Evaluación Actual
¿El setup está activo ahora con los datos del terminal? ¿Qué condiciones faltan?`,
    },
    {
      icon: Activity,
      iconColor: "text-rose-400",
      title: "Tendencia con ADX",
      desc: "Seguimiento de tendencia con filtro ADX > 25",
      prompt: `Diseña una estrategia profesional de SEGUIMIENTO DE TENDENCIA con ADX para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Diagnóstico de Tendencia
- Valor actual del ADX y su dirección (subiendo/bajando)
- +DI vs -DI: cuál domina y por cuánto (fuerza direccional)
- Clasificación: sin tendencia (<20), tendencia débil (20-25), tendencia fuerte (25-50), tendencia extrema (>50)

### ⚡ Reglas de Entrada
- LONG: ADX >25 + +DI > -DI + precio sobre EMA 50 + RSI confirmando
- SHORT: ADX >25 + -DI > +DI + precio bajo EMA 50 + RSI confirmando
- Filtro adicional: MACD histograma debe estar a favor de la dirección

### 🎯 Niveles Operativos
- Punto de entrada específico basado en el precio actual
- Stop Loss: debajo del último swing low (long) o encima del último swing high (short)
- TP1, TP2, TP3 basados en extensiones de Fibonacci y niveles de pivots del terminal
- Ratio R:R mínimo aceptable: 1:2

### 🚫 Filtros de NO Operar
- ADX cayendo desde un pico (tendencia agotada)
- ADX < 20 (mercado lateral → usar otra estrategia)
- +DI y -DI entrelazados (indecisión)

### 📊 Veredicto con Datos en Vivo
Evalúa el ADX, +DI, -DI, RSI y MACD actuales. ¿Hay tendencia operable ahora?`,
    },
    {
      icon: PiggyBank,
      iconColor: "text-emerald-400",
      title: "DCA (Promediar costo)",
      desc: "Compras periódicas para promediar el costo de entrada",
      prompt: `Diseña un plan profesional de DCA (Dollar Cost Averaging) para ${symbol} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Contexto de Mercado Actual
- Precio actual y tendencia general (alcista/bajista/lateral) basado en EMAs y ADX
- RSI: ¿estamos en zona de sobreventa (oportunidad) o sobrecompra (precaución)?
- Posición del precio dentro de las Bandas de Bollinger (¿cerca de banda inferior = buen momento para DCA?)
- Distancia del precio respecto a máximos/mínimos recientes

### 💰 Plan de Compras Escalonado
Diseña 5 niveles de compra basados en los soportes reales (S1, S2, S3, EMA 100, EMA 200):
| Nivel | Precio de Compra | % del Capital | Razón Técnica |
Cada nivel debe coincidir con un soporte técnico real del terminal.

### ⏱️ Frecuencia y Horizonte
- Frecuencia recomendada: diaria, semanal o mensual (justifica según la volatilidad actual)
- Horizonte temporal recomendado: corto (1-3 meses), medio (3-12 meses) o largo plazo (>1 año)
- Capital total sugerido a asignar y distribución por compra

### 🛡️ Reglas de Gestión
- Condición para PAUSAR el DCA (ej: RSI >80, precio >2 desviaciones sobre EMA 200)
- Condición para ACELERAR el DCA (ej: RSI <25, precio en zona de acumulación Wyckoff)
- Take profit parcial: a qué % de ganancia tomar ganancias sobre lo acumulado

### 📊 Evaluación: ¿Es Buen Momento para Iniciar DCA?
Con los datos actuales del terminal, ¿el precio está en zona favorable para comenzar? Justifica.`,
    },
    {
      icon: LayoutGrid,
      iconColor: "text-cyan-400",
      title: "Grid trading",
      desc: "Órdenes escalonadas de compra/venta en rango",
      prompt: `Diseña una estrategia profesional de GRID TRADING para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📐 Definición del Grid
- Límite superior del grid: basado en la resistencia más fuerte (R1/R2/R3 o banda superior de Bollinger)
- Límite inferior del grid: basado en el soporte más fuerte (S1/S2/S3 o banda inferior de Bollinger)
- Rango total en % y en precio absoluto
- Número de niveles recomendado (entre 5-15) y separación entre cada uno

### 📋 Tabla de Órdenes
| # | Tipo | Precio | Acción | % del Capital |
Genera la tabla completa con cada nivel de compra y venta basado en los soportes y resistencias reales del terminal.

### ⚙️ Parámetros del Grid
- Capital total a asignar al grid
- Tamaño de cada orden (en USDT y en unidades del activo)
- Ganancia por ciclo (compra + venta de un nivel)
- Ganancia estimada mensual si el precio oscila en el rango

### 🚨 Gestión de Riesgo
- ¿Qué hacer si el precio rompe por arriba del grid? (breakout alcista)
- ¿Qué hacer si el precio rompe por abajo del grid? (breakdown bajista)
- Stop loss global del grid
- Condiciones para desactivar el grid (ADX >40 = tendencia fuerte = grid no funciona)

### 📊 ¿El Mercado Actual es Apto para Grid?
Evalúa ADX, Bollinger width y volatilidad actual. ¿Es mercado lateral (ideal) o tendencial (peligroso)?`,
    },
    {
      icon: ArrowUpRight,
      iconColor: "text-amber-400",
      title: "Cruce dorado EMA 50/200",
      desc: "Cambio de tendencia con medias exponenciales",
      prompt: `Analiza la estrategia de CRUCE DORADO / CRUCE DE LA MUERTE (EMA 50/200) para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Estado Actual de las EMAs
- EMA 50 actual vs EMA 200 actual: ¿cuál está por encima?
- Distancia entre ambas EMAs en % (convergiendo o divergiendo)
- Posición del precio respecto a ambas EMAs
- ¿Hubo cruce reciente? ¿Hace cuántas velas?

### ⚡ Señales del Cruce
- **Cruce Dorado** (EMA 50 cruza ENCIMA de EMA 200): señal alcista de largo plazo
- **Cruce de la Muerte** (EMA 50 cruza DEBAJO de EMA 200): señal bajista de largo plazo
- Estado actual: ¿estamos en golden cross, death cross, o a punto de cruzar?

### 🎯 Plan de Ejecución
- Si se confirma cruce dorado: entrada, SL (debajo de EMA 200), TP basados en extensiones
- Si se confirma cruce de la muerte: entrada short o salida de posiciones largas
- Confirmaciones adicionales: volumen, RSI, MACD alineados

### ⚠️ Precauciones
- Falsos cruces en mercados laterales (ADX <20): cómo filtrarlos
- Lag natural de la señal (las EMAs son indicadores retrasados)
- Temporalidades más confiables para esta estrategia

### 📊 Veredicto con Datos en Vivo
¿Se aproxima un cruce? ¿Cuál? ¿Los indicadores de momentum confirman la dirección?`,
    },
    {
      icon: Flame,
      iconColor: "text-rose-400",
      title: "Momentum con volumen",
      desc: "Rupturas con volumen y RSI confirmando",
      prompt: `Diseña una estrategia profesional de MOMENTUM TRADING con confirmación de volumen para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Lectura de Momentum Actual
- RSI (14): valor actual, dirección y zona (sobreventa/neutral/sobrecompra)
- MACD: línea vs señal, histograma (acelerando o desacelerando)
- MFI (14): flujo de dinero institucional (acumulación o distribución)
- CCI (20): extremos de momentum
- Stochastic RSI: timing de entrada

### 🔥 Setup de Momentum Explosivo
Condiciones que deben cumplirse TODAS simultáneamente:
1. Volumen de la vela actual > 1.5x el volumen promedio
2. RSI rompiendo nivel 50 en dirección de la operación
3. MACD histograma cambiando de signo (de negativo a positivo para long, viceversa para short)
4. Precio rompiendo EMA 50 con fuerza
5. MFI confirmando flujo de dinero en la dirección

### 🎯 Ejecución
- Entrada agresiva: en la ruptura con volumen
- Entrada conservadora: en el pullback posterior a la ruptura
- Stop Loss: debajo de la vela de ruptura
- TP1, TP2, TP3 con trailing stop progresivo

### ⚠️ Señales de Agotamiento
- Divergencia RSI/precio (precio sube pero RSI no)
- Volumen decreciente en las velas de continuación
- MFI cayendo = institucionales saliendo

### 📊 ¿Hay Momentum Operable Ahora?
Evalúa todos los indicadores de momentum del terminal y da un veredicto claro.`,
    },
  ]

  const analyses = [
    {
      icon: BarChart2,
      iconColor: "text-cyan-400",
      title: "Soporte clave",
      desc: "Niveles de soporte y zonas de reacción",
      prompt: `Realiza un análisis profesional de SOPORTES Y RESISTENCIAS CLAVE para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 🏗️ Mapa de Niveles Estructurales
Usa los Pivot Points (S1/S2/S3 y R1/R2/R3), EMAs (50, 100, 200) y Bandas de Bollinger para construir un mapa completo:

| Nivel | Precio | Tipo | Confluencia | Fuerza |
Ordena todos los niveles de mayor a menor con su tipo (soporte/resistencia), qué indicadores confluyen en esa zona, y fuerza estimada (débil/moderada/fuerte).

### 💧 Zonas de Liquidez del Order Book
Analiza el mapa de liquidez (Bubble Map) del terminal:
- Principales muros de compra (bid walls): dónde está la demanda institucional
- Principales muros de venta (ask walls): dónde está la oferta institucional
- Imbalances y gaps de liquidez

### 🎯 Niveles Accionables
- Soporte inmediato: precio exacto + qué esperar si lo toca
- Resistencia inmediata: precio exacto + qué esperar si lo toca
- Nivel de invalidación: si se pierde este nivel, el escenario cambia completamente

### 📊 Posición Actual del Precio
¿Dónde está el precio ahora respecto a todos estos niveles? ¿Más cerca de soporte o resistencia?`,
    },
    {
      icon: Scale,
      iconColor: "text-amber-400",
      title: "Riesgo/beneficio 1:3",
      desc: "Ratio de entrada, stop y objetivos",
      prompt: `Calcula un setup profesional con RATIO RIESGO/BENEFICIO de al menos 1:3 para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Contexto del Setup
- Tendencia actual (EMAs, ADX) y bias direccional (alcista/bajista/neutral)
- Señal predominante del terminal (COMPRA/VENTA/NEUTRAL) y conteo de señales
- Nivel de confianza del setup: alto, medio o bajo (justifica)

### 🎯 Setup LONG (si el bias es alcista)
| Componente | Precio | Distancia | Justificación Técnica |
| Entrada | $X | — | Basado en soporte/pullback a EMA |
| Stop Loss | $X | -X% | Debajo de soporte/swing low |
| TP1 (1:1) | $X | +X% | Primera resistencia |
| TP2 (1:2) | $X | +X% | Segunda resistencia |
| TP3 (1:3) | $X | +X% | Tercera resistencia/extensión |

### 📉 Setup SHORT (si el bias es bajista)
Misma estructura pero invertida.

### 💰 Gestión de Capital
- Riesgo máximo por operación: 1-2% del capital
- Tamaño de posición calculado (si arriesgo $100, con SL a X%, la posición es de $Y)
- Parciales recomendados: % en cada TP

### ⚖️ Evaluación del Setup
¿El ratio R:R justifica tomar la operación? ¿Los indicadores confirman la dirección?`,
    },
    {
      icon: Radar,
      iconColor: "text-emerald-400",
      title: "Momentum y tendencia",
      desc: "RSI, MACD y ADX evaluados en conjunto",
      prompt: `Realiza un análisis profesional de MOMENTUM Y TENDENCIA para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Dashboard de Momentum (valores actuales del terminal)
| Indicador | Valor | Zona | Señal | Dirección |
| RSI (14) | X | Sobreventa/Neutral/Sobrecompra | Compra/Neutral/Venta | Subiendo/Bajando |
| Stochastic RSI | X | ... | ... | ... |
| Stochastic %K/%D | X/X | ... | Cruce alcista/bajista | ... |
| MACD Línea | X | ... | ... | ... |
| MACD Histograma | X | Positivo/Negativo | Acelerando/Desacelerando | ... |
| CCI (20) | X | ... | ... | ... |
| MFI (14) | X | Acumulación/Distribución | ... | ... |
| ADX (14) | X | Sin tendencia/Tendencia/Fuerte | ... | ... |
| +DI / -DI | X/X | Alcista/Bajista | Dominancia | ... |

### 🔍 Diagnóstico de Confluencia
- ¿Cuántos indicadores de momentum confirman la misma dirección?
- ¿Hay divergencias entre precio e indicadores? (señal de reversal)
- Fuerza de la tendencia: ADX + alineación de EMAs

### ⚠️ Alertas y Divergencias
- Divergencia alcista/bajista detectada (si existe)
- Indicadores en extremos (posible agotamiento)
- Conflictos entre indicadores (señales mixtas)

### 💡 Conclusión Operativa
Veredicto claro: ¿El momentum favorece COMPRA, VENTA o ESPERAR? ¿Con qué nivel de confianza?`,
    },
    {
      icon: FileText,
      iconColor: "text-rose-400",
      title: "Resumen técnico completo",
      desc: "Informe cuantitativo de todos los indicadores",
      prompt: `Genera un INFORME TÉCNICO CUANTITATIVO COMPLETO de grado institucional para ${symbol} en ${interval} usando todos los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### 📊 Resumen Ejecutivo
- Señal del mercado (COMPRA/VENTA/NEUTRAL) con conteo exacto de señales
- Precio actual, volumen 24h y flujo de presión compradora/vendedora
- Veredicto en una oración: qué está haciendo el mercado ahora

### 📈 Análisis de Estructura y Tendencia
- Alineación de EMAs (50, 100, 200): golden cross / death cross / neutral
- ADX y fuerzas direccionales (+DI/-DI): fuerza y dirección de la tendencia
- Precio vs EMAs: distancia porcentual a cada media

### 🔄 Momentum y Osciladores
Evaluación completa de cada oscilador con su valor exacto, zona y señal:
RSI, Stochastic RSI, Stochastic %K/%D, MACD (línea, señal, histograma), CCI, MFI

### 📉 Volatilidad
- Bandas de Bollinger: posición del precio (% entre banda superior e inferior)
- Ancho de bandas: ¿compresión (explosión inminente) o expansión (movimiento en curso)?
- Relación con ADX: volatilidad + dirección

### 💧 Liquidez y Order Book
- Mapa de liquidez: dominancia compradora/vendedora, bid/ask volume
- Muros de liquidez principales (bid walls / ask walls)
- Spread actual y profundidad

### 🏗️ Niveles Clave
- Soportes: S1, S2, S3 + confluencias con EMAs y Bollinger
- Resistencias: R1, R2, R3 + confluencias
- Nivel de invalidación

### 💡 Recomendación Final
Veredicto claro con entrada, SL, TP y ratio R:R. Nivel de confianza del setup.`,
    },
  ]

  const renderAction = (a) => {
    const Icon = a.icon
    return (
      <button
        key={a.title}
        onClick={() => run(a.prompt)}
        disabled={disabled}
        className="group w-full text-left bg-[#09151d]/80 hover:bg-emerald-950/50 border border-slate-700/60 hover:border-emerald-500/40 rounded-xl px-3.5 py-3 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-start gap-3 shadow-sm"
      >
        <div className="w-9 h-9 rounded-lg bg-slate-900/70 border border-slate-700/60 flex items-center justify-center flex-shrink-0 group-hover:border-emerald-500/40 transition-colors">
          <Icon className={`w-4 h-4 ${a.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-bold text-slate-200 group-hover:text-white transition-colors">
            {a.title}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{a.desc}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2.5" />
      </button>
    )
  }

  return (
    <>
      {/* Barra inferior con acceso a la ventana emergente */}
      <div className="px-5 py-2.5 sm:px-6 bg-[#050d12]/40 backdrop-blur-sm border-t border-emerald-500/10 flex items-center gap-3 z-10">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-semibold flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Acciones Rápidas:</span>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-emerald-500/30 hover:border-emerald-400/60 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-2 active:scale-95"
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Estrategias y Análisis</span>
          <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
            {strategies.length + analyses.length}
          </span>
        </button>
      </div>

      {/* Ventana Emergente de Acciones Rápidas */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-[640px] max-h-[82vh] overflow-y-auto cyber-scrollbar rounded-2xl border border-emerald-500/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(0,255,178,0.15)] animate-in zoom-in-95 duration-200"
            style={{
              background:
                "linear-gradient(180deg, rgba(8, 18, 25, 0.90) 0%, rgba(5, 12, 17, 0.92) 100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado de la Ventana Emergente */}
            <div className="sticky top-0 z-10 px-5 py-4 bg-[#071116]/80 backdrop-blur-md border-b border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-mono font-bold tracking-wider text-white">
                    ACCIONES RÁPIDAS
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Selecciona un comando para ejecutarlo con el agente
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/40 transition-colors"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido: dos cuadros separados — 1) ANÁLISIS 2) ESTRATEGIAS */}
            <div className="px-5 py-4 space-y-4">
              {/* Cuadro 1: Análisis Técnico */}
              <div className="rounded-xl border border-cyan-500/25 bg-[#071218]/50 p-3.5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                    <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-300 uppercase">
                    1 · Análisis Técnico
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/30 to-transparent" />
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {analyses.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {analyses.map(renderAction)}
                </div>
              </div>

              {/* Cuadro 2: Estrategias de Trading */}
              <div className="rounded-xl border border-emerald-500/25 bg-[#071218]/50 p-3.5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-300 uppercase">
                    2 · Estrategias de Trading
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/30 to-transparent" />
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {strategies.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {strategies.map(renderAction)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
