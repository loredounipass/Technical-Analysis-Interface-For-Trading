"use client"

import React, { useEffect, useState } from "react"
import {
  X,
  ChevronRight,
  Layers,
  Bot,
  Cpu,
  CandlestickChart,
  GitCompare,
  Scale,
  Gauge,
  BarChart3,
  Zap,
  Target,
  TrendingUp,
  Compass,
  CircleDollarSign,
  LayoutGrid,
  LineChart,
  Waves,
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

### SETUP DE ENTRADA
- Condiciones exactas del cruce MACD (línea vs señal) + histograma para confirmar momentum. Usa los valores actuales de MACD línea, señal e histograma del terminal.
- Filtro RSI: zona válida de entrada basada en el RSI actual del terminal (continuación si está entre 40-60, reversal si está en extremos)
- Confirmación con volumen: compara el volumen actual del terminal contra el promedio de las últimas 10 velas

### PLAN DE EJECUCIÓN
- Punto de entrada específico basado en el precio spot actual y los pivots S1/R1 del terminal
- Stop Loss en precio exacto y en porcentaje (usa el soporte más cercano del terminal como referencia)
- Take Profit 1, TP2 y TP3 con parciales: 50% en TP1, 30% en TP2, 20% en TP3
- Ratio riesgo/beneficio de cada target

### GESTIÓN DE RIESGO
- Tamaño de posición recomendado (porcentaje del capital)
- Máximo de operaciones consecutivas si hay pérdida
- Condiciones para NO operar: ADX actual del terminal menor a 20, spread alto, volumen bajo

### ESTADO ACTUAL DEL SETUP
Evalúa con los indicadores en vivo del terminal (RSI, MACD, ADX, volumen, precio vs EMAs) si el setup está ACTIVO ahora o hay que esperar. Indica exactamente qué condición falta para que se active.`,
    },
    {
      icon: Target,
      iconColor: "text-cyan-400",
      title: "Breakout de consolidación",
      desc: "Ruptura de rango con confirmación de volumen",
      prompt: `Diseña una estrategia profesional de BREAKOUT DE CONSOLIDACIÓN para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### IDENTIFICACIÓN DEL RANGO
- Usa las Bandas de Bollinger (banda superior e inferior), pivots S1-S3 y R1-R3 del terminal para definir los límites exactos del rango actual
- Ancho del rango en porcentaje y en precio absoluto
- Evalúa si las Bollinger están comprimidas (ancho estrecho = breakout inminente) usando los valores actuales del terminal

### CONDICIONES DE BREAKOUT VÁLIDO
- Precio de ruptura alcista: nivel exacto basado en R1 o banda superior de Bollinger del terminal
- Precio de ruptura bajista: nivel exacto basado en S1 o banda inferior de Bollinger del terminal
- Volumen mínimo requerido para confirmar vs el volumen actual del terminal
- ADX: debe subir y cruzar por encima de 25 (usa el valor actual del terminal como referencia)
- Confirmación con cierre de vela completa, no mecha

### PLAN DE TRADING
- Entrada larga: precio exacto, SL basado en S2 del terminal, TP1/TP2/TP3 basados en R1/R2/R3
- Entrada corta: precio exacto, SL basado en R2 del terminal, TP1/TP2/TP3 basados en S1/S2/S3
- Falso breakout: cómo identificarlo con volumen y RSI, y cómo reaccionar

### ESTADO ACTUAL
Usa el ADX, ancho de Bollinger, volumen y precio actual del terminal para determinar si está consolidando ahora y qué tan cerca está del breakout.`,
    },
    {
      icon: TrendingUp,
      iconColor: "text-amber-400",
      title: "Swing con medias móviles",
      desc: "Cruce EMA 20/50 con gestión de riesgo",
      prompt: `Diseña una estrategia profesional de SWING TRADING con medias móviles para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### ANÁLISIS DE TENDENCIA ACTUAL
- Alineación actual de EMA 50, EMA 100 y EMA 200 del terminal: alcista (50 > 100 > 200), bajista (inverso) o sin tendencia
- Posición del precio spot actual respecto a cada EMA del terminal
- Distancia porcentual del precio a EMA 50 para evaluar sobreextensión

### SETUP DE ENTRADA
- Señal primaria: cruce de EMAs o pullback a EMA con rebote (evalúa qué aplica según los datos actuales del terminal)
- Confirmaciones requeridas: RSI del terminal en zona favorable, MACD histograma a favor, ADX mayor a 25
- Patrón de velas de confirmación en la zona de entrada

### PLAN DE EJECUCIÓN DETALLADO
- Zona de entrada: rango de precio basado en la EMA más cercana y el precio actual del terminal
- Stop Loss debajo de la EMA de referencia o del soporte S1/S2 del terminal
- TP1 conservador en R1, TP2 moderado en R2, TP3 agresivo en R3 del terminal
- Trailing stop: cómo mover el SL usando las EMAs como guía

### GESTIÓN DE LA POSICIÓN
- Tiempo esperado en la operación según el timeframe ${interval}
- Señales de salida anticipada: RSI en sobrecompra, MACD cruce bajista, ADX cayendo
- Porcentaje de capital recomendado por operación

### EVALUACIÓN ACTUAL
Usa las EMAs, RSI, MACD y ADX actuales del terminal para determinar si el setup está activo ahora o qué falta.`,
    },
    {
      icon: Compass,
      iconColor: "text-blue-400",
      title: "Tendencia con ADX",
      desc: "Seguimiento de tendencia con filtro ADX > 25",
      prompt: `Diseña una estrategia profesional de SEGUIMIENTO DE TENDENCIA con ADX para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### DIAGNÓSTICO DE TENDENCIA
- Valor actual del ADX del terminal y su dirección (subiendo o bajando en las últimas velas)
- +DI vs -DI del terminal: cuál domina y por cuánto (fuerza direccional neta)
- Clasificación: sin tendencia (ADX menor a 20), tendencia débil (20-25), tendencia fuerte (25-50), tendencia extrema (mayor a 50)

### REGLAS DE ENTRADA
- LONG: ADX mayor a 25 + +DI mayor que -DI + precio sobre EMA 50 + RSI confirmando. Evalúa cada condición con los datos actuales del terminal.
- SHORT: ADX mayor a 25 + -DI mayor que +DI + precio bajo EMA 50 + RSI confirmando. Evalúa cada condición con los datos actuales del terminal.
- Filtro adicional: MACD histograma del terminal debe estar a favor de la dirección

### NIVELES OPERATIVOS
- Punto de entrada específico basado en el precio spot actual del terminal
- Stop Loss usando los pivots S1/S2 (long) o R1/R2 (short) del terminal
- TP1, TP2, TP3 basados en los niveles de pivots y resistencias del terminal
- Ratio riesgo/beneficio mínimo aceptable: 1:2

### FILTROS DE NO OPERAR
- ADX cayendo desde un pico: tendencia agotada
- ADX menor a 20: mercado lateral, usar otra estrategia
- +DI y -DI entrelazados: indecisión del mercado

### VEREDICTO CON DATOS EN VIVO
Evalúa el ADX, +DI, -DI, RSI, MACD y posición del precio vs EMAs actuales del terminal. Determina si hay tendencia operable ahora o si hay que esperar.`,
    },
    {
      icon: CircleDollarSign,
      iconColor: "text-emerald-400",
      title: "DCA (Promediar costo)",
      desc: "Compras periódicas para promediar el costo de entrada",
      prompt: `Diseña un plan profesional de DCA (Dollar Cost Averaging) para ${symbol} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### CONTEXTO DE MERCADO ACTUAL
- Precio spot actual del terminal y tendencia general basada en la alineación de EMAs 50/100/200 y el ADX
- RSI del terminal: zona de sobreventa (oportunidad para DCA agresivo) o sobrecompra (precaución)
- Posición del precio dentro de las Bandas de Bollinger del terminal: cerca de banda inferior es buen momento para DCA
- MFI del terminal: acumulación institucional (favorable) o distribución (desfavorable)

### PLAN DE COMPRAS ESCALONADO
Diseña 5 niveles de compra basados en los soportes reales del terminal:
| Nivel | Precio de Compra | Porcentaje del Capital | Razón Técnica |
Usa S1, S2, S3, EMA 100 y EMA 200 del terminal como niveles de compra. Cada nivel debe coincidir con un soporte técnico real.

### FRECUENCIA Y HORIZONTE
- Frecuencia recomendada: diaria, semanal o mensual. Justifica según la volatilidad actual medida por el ancho de Bollinger
- Horizonte temporal: corto (1-3 meses), medio (3-12 meses) o largo plazo (mayor a 1 año)
- Capital total sugerido a asignar y distribución por compra

### REGLAS DE GESTIÓN
- Condición para PAUSAR el DCA: RSI del terminal mayor a 80, precio más de 2 desviaciones sobre EMA 200
- Condición para ACELERAR el DCA: RSI menor a 25, MFI mostrando acumulación, precio en zona de soporte S2/S3
- Take profit parcial: a qué porcentaje de ganancia tomar ganancias sobre lo acumulado, usando R1/R2/R3 como objetivos

### EVALUACIÓN ACTUAL
Con el precio, RSI, MFI, Bollinger y EMAs actuales del terminal, determina si es buen momento para iniciar DCA. Da un veredicto claro y justificado.`,
    },
    {
      icon: LayoutGrid,
      iconColor: "text-cyan-400",
      title: "Grid trading",
      desc: "Órdenes escalonadas de compra/venta en rango",
      prompt: `Diseña una estrategia profesional de GRID TRADING para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### DEFINICIÓN DEL GRID
- Límite superior: usa la resistencia más fuerte entre R1/R2/R3 y la banda superior de Bollinger del terminal
- Límite inferior: usa el soporte más fuerte entre S1/S2/S3 y la banda inferior de Bollinger del terminal
- Rango total en porcentaje y en precio absoluto basado en los valores reales del terminal
- Número de niveles recomendado (entre 5-15) y separación entre cada uno

### TABLA DE ÓRDENES
| Nivel | Tipo | Precio | Acción | Porcentaje del Capital |
Genera la tabla completa con cada nivel de compra y venta. Usa los soportes y resistencias reales del terminal para alinear los niveles del grid con zonas de confluencia técnica.

### PARÁMETROS DEL GRID
- Capital total a asignar al grid
- Tamaño de cada orden en USDT y en unidades del activo al precio actual
- Ganancia por ciclo (compra + venta de un nivel)
- Ganancia estimada mensual si el precio oscila en el rango definido

### GESTIÓN DE RIESGO
- Breakout alcista (precio rompe por arriba del grid): plan de acción
- Breakdown bajista (precio rompe por abajo del grid): plan de acción
- Stop loss global del grid basado en S3 del terminal
- Condiciones para desactivar el grid: ADX del terminal mayor a 40 indica tendencia fuerte donde el grid no funciona

### APTITUD DEL MERCADO ACTUAL
Evalúa el ADX, ancho de Bollinger, y volatilidad actual del terminal. Determina si el mercado está lateral (ideal para grid) o tendencial (peligroso para grid).`,
    },
    {
      icon: LineChart,
      iconColor: "text-amber-400",
      title: "Cruce dorado EMA 50/200",
      desc: "Cambio de tendencia con medias exponenciales",
      prompt: `Analiza la estrategia de CRUCE DORADO y CRUCE DE LA MUERTE con EMA 50/200 para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### ESTADO ACTUAL DE LAS EMAs
- EMA 50 vs EMA 200 del terminal: cuál está por encima y por cuánto (en precio y porcentaje)
- Dirección de convergencia o divergencia: las EMAs se acercan o se alejan
- Posición del precio spot actual respecto a ambas EMAs del terminal
- Evalúa las últimas velas de la serie EMA 50 y EMA 200 del terminal para determinar si hubo cruce reciente

### SEÑALES DEL CRUCE
- Cruce Dorado: EMA 50 cruza por encima de EMA 200, señal alcista de largo plazo
- Cruce de la Muerte: EMA 50 cruza por debajo de EMA 200, señal bajista de largo plazo
- Estado actual con datos del terminal: golden cross activo, death cross activo, o aproximándose a un cruce

### PLAN DE EJECUCIÓN
- Si se confirma cruce dorado: entrada en el precio actual, SL debajo de EMA 200 del terminal, TP basados en R1/R2/R3
- Si se confirma cruce de la muerte: entrada short o salida de posiciones largas, SL encima de EMA 200
- Confirmaciones adicionales: volumen, RSI, MACD del terminal deben estar alineados con la dirección del cruce

### PRECAUCIONES
- Falsos cruces en mercados laterales: si el ADX del terminal es menor a 20, el cruce tiene alta probabilidad de ser falso
- Lag natural de la señal: las EMAs son indicadores retrasados, evaluar con MACD para anticipar
- Temporalidades más confiables para esta estrategia

### VEREDICTO CON DATOS EN VIVO
Usa las EMAs, ADX, MACD y RSI actuales del terminal para determinar si se aproxima un cruce, cuál sería, y si los indicadores de momentum lo confirman.`,
    },
    {
      icon: Waves,
      iconColor: "text-rose-400",
      title: "Momentum con volumen",
      desc: "Rupturas con volumen y RSI confirmando",
      prompt: `Diseña una estrategia profesional de MOMENTUM TRADING con confirmación de volumen para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### LECTURA DE MOMENTUM ACTUAL
Usa los valores exactos del terminal para cada indicador:
- RSI (14): valor actual, dirección en las últimas velas, zona (sobreventa/neutral/sobrecompra)
- MACD: línea vs señal, histograma (acelerando o desacelerando)
- MFI (14): flujo de dinero institucional, acumulación o distribución
- CCI (20): extremos de momentum
- Stochastic RSI: timing preciso de entrada

### SETUP DE MOMENTUM
Condiciones que deben cumplirse TODAS simultáneamente para validar la entrada:
1. Volumen de la vela actual mayor a 1.5 veces el volumen promedio de las últimas 10 velas del terminal
2. RSI del terminal rompiendo nivel 50 en la dirección de la operación
3. MACD histograma del terminal cambiando de signo (negativo a positivo para long, viceversa para short)
4. Precio rompiendo EMA 50 del terminal con fuerza (cierre de vela, no mecha)
5. MFI del terminal confirmando flujo de dinero en la dirección

### EJECUCIÓN
- Entrada agresiva: en la ruptura con volumen al precio actual si las condiciones se cumplen
- Entrada conservadora: en el pullback posterior a la ruptura, nivel basado en EMA 50 del terminal
- Stop Loss: debajo del soporte S1 del terminal (long) o encima de R1 (short)
- TP1 en R1, TP2 en R2, TP3 en R3 del terminal con trailing stop progresivo

### SEÑALES DE AGOTAMIENTO
- Divergencia RSI/precio: precio sube pero RSI del terminal no acompaña
- Volumen decreciente en las velas de continuación
- MFI del terminal cayendo: institucionales saliendo de la posición

### VEREDICTO ACTUAL
Evalúa todos los indicadores de momentum del terminal y determina si hay momentum operable ahora, en qué dirección, y con qué nivel de confianza.`,
    },
  ]

  const analyses = [
    {
      icon: GitCompare,
      iconColor: "text-cyan-400",
      title: "Soporte clave",
      desc: "Niveles de soporte y zonas de reacción",
      prompt: `Realiza un análisis profesional de SOPORTES Y RESISTENCIAS para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### MAPA DE NIVELES ESTRUCTURALES
Construye un mapa completo usando los Pivot Points S1/S2/S3 y R1/R2/R3, las EMAs 50/100/200 y las Bandas de Bollinger del terminal:

| Nivel | Precio exacto | Tipo (soporte o resistencia) | Indicadores que confluyen en esa zona | Fuerza estimada |
Ordena todos los niveles de mayor a menor precio. Marca las zonas donde 2 o más indicadores coinciden como confluencias fuertes.

### ZONAS DE LIQUIDEZ DEL ORDER BOOK
Analiza el mapa de liquidez (Bubble Map) del terminal:
- Principales muros de compra (bid walls): precio y volumen en USDT donde está la demanda institucional
- Principales muros de venta (ask walls): precio y volumen en USDT donde está la oferta institucional
- Ratio de dominancia compradora/vendedora del terminal y su implicación

### NIVELES ACCIONABLES
- Soporte inmediato: precio exacto del terminal + qué esperar si el precio lo toca (rebote probable o ruptura)
- Resistencia inmediata: precio exacto del terminal + qué esperar si el precio la alcanza
- Nivel de invalidación: si se pierde este nivel, el escenario técnico cambia completamente. Define cuál es usando los datos del terminal.

### POSICIÓN ACTUAL DEL PRECIO
Usa el precio spot actual del terminal para ubicarlo respecto a todos los niveles identificados. Determina si está más cerca de soporte (oportunidad de compra) o de resistencia (zona de precaución). Incluye la distancia en porcentaje al soporte y resistencia más cercanos.`,
    },
    {
      icon: Scale,
      iconColor: "text-amber-400",
      title: "Riesgo/beneficio 1:3",
      desc: "Ratio de entrada, stop y objetivos",
      prompt: `Calcula un setup profesional con RATIO RIESGO/BENEFICIO de al menos 1:3 para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### CONTEXTO DEL SETUP
- Tendencia actual basada en EMAs 50/100/200 y ADX del terminal. Indica el bias direccional: alcista, bajista o neutral.
- Señal predominante del terminal (COMPRA/VENTA/NEUTRAL) con el conteo exacto de señales buy/sell/neutral
- Nivel de confianza del setup: alto, medio o bajo. Justifica con los indicadores del terminal.

### SETUP LONG (si el bias es alcista)
| Componente | Precio exacto del terminal | Distancia porcentual | Justificación técnica |
| Entrada | Precio basado en soporte cercano o pullback a EMA | ... | ... |
| Stop Loss | Precio basado en S2 o debajo de swing low | ... | ... |
| TP1 (ratio 1:1) | Precio basado en R1 del terminal | ... | ... |
| TP2 (ratio 1:2) | Precio basado en R2 del terminal | ... | ... |
| TP3 (ratio 1:3) | Precio basado en R3 del terminal | ... | ... |

### SETUP SHORT (si el bias es bajista)
Misma estructura con niveles invertidos usando los datos reales del terminal.

### GESTIÓN DE CAPITAL
- Riesgo máximo por operación: 1-2 porcentaje del capital
- Cálculo del tamaño de posición: con el SL definido, cuánto capital asignar para que la pérdida máxima sea el porcentaje elegido
- Parciales recomendados: distribución del cierre en cada TP

### EVALUACIÓN DEL SETUP
Usa los indicadores actuales del terminal (RSI, MACD, ADX, MFI, Stochastic) para evaluar si el ratio R:R justifica tomar la operación ahora. Indica si los indicadores confirman o contradicen la dirección del setup.`,
    },
    {
      icon: Gauge,
      iconColor: "text-emerald-400",
      title: "Momentum y tendencia",
      desc: "RSI, MACD y ADX evaluados en conjunto",
      prompt: `Realiza un análisis profesional de MOMENTUM Y TENDENCIA para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### DASHBOARD DE MOMENTUM
Usa los valores exactos del terminal para completar cada fila:
| Indicador | Valor actual | Zona | Señal individual | Dirección |
| RSI (14) | valor del terminal | Sobreventa/Neutral/Sobrecompra | Compra/Neutral/Venta | Subiendo/Bajando |
| Stochastic RSI | valor del terminal | OS/Neutral/OB | ... | ... |
| Stochastic %K/%D | valores del terminal | ... | Cruce alcista/bajista | ... |
| MACD Línea vs Señal | valores del terminal | ... | Por encima/debajo de señal | ... |
| MACD Histograma | valor del terminal | Positivo/Negativo | Acelerando/Desacelerando | ... |
| CCI (20) | valor del terminal | OS/Neutral/OB | ... | ... |
| MFI (14) | valor del terminal | Acumulación/Distribución | Flujo institucional | ... |
| ADX (14) | valor del terminal | Sin tendencia/Tendencia/Fuerte | ... | ... |
| +DI / -DI | valores del terminal | Alcista/Bajista | Dominancia direccional | ... |

### DIAGNÓSTICO DE CONFLUENCIA
- Conteo: cuántos indicadores del terminal confirman dirección alcista, cuántos bajista, cuántos neutrales
- Evaluación de divergencias entre el precio y los osciladores del terminal (RSI, MACD, MFI). Si el precio sube pero un oscilador baja, señalar la divergencia.
- Fuerza de la tendencia: combina ADX + alineación de EMAs del terminal para un diagnóstico integrado

### ALERTAS Y DIVERGENCIAS
- Divergencia alcista o bajista detectada con los datos del terminal (si existe)
- Indicadores en extremos: RSI mayor a 70 o menor a 30, CCI en extremos, MFI en extremos
- Conflictos entre indicadores: señales mixtas que sugieren esperar

### CONCLUSIÓN OPERATIVA
Veredicto claro basado en todos los datos del terminal: el momentum favorece COMPRA, VENTA o ESPERAR. Indica el nivel de confianza (alto, medio, bajo) y qué indicadores respaldan el veredicto.`,
    },
    {
      icon: BarChart3,
      iconColor: "text-rose-400",
      title: "Resumen técnico completo",
      desc: "Informe cuantitativo de todos los indicadores",
      prompt: `Genera un INFORME TÉCNICO CUANTITATIVO COMPLETO de grado institucional para ${symbol} en ${interval} usando todos los datos de mercado en vivo del terminal. Estructura tu respuesta así:

### RESUMEN EJECUTIVO
- Señal del mercado del terminal (COMPRA/VENTA/NEUTRAL) con conteo exacto de señales buy/sell/neutral
- Precio spot actual, volumen 24h y ratio de flujo de presión compradora vs vendedora del terminal
- Veredicto en una oración: qué está haciendo el mercado ahora según los datos

### ESTRUCTURA Y TENDENCIA
- Alineación de EMAs 50/100/200 del terminal: golden cross, death cross o neutral. Precios exactos de cada EMA.
- ADX del terminal y fuerzas direccionales +DI/-DI: fuerza y dirección de la tendencia actual
- Distancia porcentual del precio a cada EMA del terminal

### MOMENTUM Y OSCILADORES
Evaluación de cada oscilador con su valor exacto del terminal, zona y señal:
- RSI (14), Stochastic RSI, Stochastic %K/%D, CCI (20), MFI (14)
- MACD: línea, señal e histograma con su interpretación
- Consenso de momentum: mayoría alcista, bajista o mixta

### VOLATILIDAD
- Bandas de Bollinger del terminal: posición del precio como porcentaje entre banda inferior y superior
- Ancho de bandas: compresión (explosión de volatilidad inminente) o expansión (movimiento en curso)
- Relación ADX + Bollinger: volatilidad con o sin dirección

### LIQUIDEZ Y ORDER BOOK
- Mapa de liquidez del terminal: dominancia compradora o vendedora, bid volume vs ask volume
- Muros de liquidez principales: bid walls y ask walls con sus precios y volúmenes
- Spread actual entre best bid y best ask del terminal

### NIVELES CLAVE
- Soportes: S1, S2, S3 del terminal + confluencias con EMAs y banda inferior de Bollinger
- Resistencias: R1, R2, R3 del terminal + confluencias con EMAs y banda superior de Bollinger
- Nivel de invalidación: precio donde el escenario técnico cambia completamente

### RECOMENDACIÓN FINAL
Veredicto operativo claro: COMPRA, VENTA, MANTENER o ESPERAR. Incluye zona de entrada, Stop Loss, Take Profit y ratio riesgo/beneficio. Indica el nivel de confianza del setup basado en la confluencia de los indicadores del terminal.`,
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
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
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
                  <Bot className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-mono font-bold tracking-wider text-white">
                    WOODY AGENT • ACCIONES RÁPIDAS
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
                    <CandlestickChart className="w-3.5 h-3.5 text-cyan-400" />
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
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
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
