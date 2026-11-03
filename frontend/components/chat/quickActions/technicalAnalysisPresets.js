/**
 * Presets de ANÁLISIS TÉCNICO para la ventana de acciones rápidas.
 * Mismo contrato declarativo que tradingStrategyPresets: la función build
 * es pura sobre `symbol` e `interval` y el llamador la memoiza.
 */
import { GitCompare, Scale, Gauge, BarChart3 } from "lucide-react"

export function buildTechnicalAnalysisPresets(symbol, interval) {
  return [
    {
      icon: GitCompare,
      iconColor: "text-cyan-400",
      title: "Soporte clave",
      desc: "Niveles de soporte y zonas de reacción",
      steps: [
        { title: "Niveles Estructurales", desc: "Pivots S1-S3, R1-R3, EMAs y Bollinger" },
        { title: "Liquidez del Order Book", desc: "Muros bid/ask y dominancia compradora" },
        { title: "Niveles Accionables", desc: "Soporte inmediato e invalidación" },
        { title: "Posición del Precio", desc: "Distancia porcentual a soportes/resistencias" },
      ],
      prompt: `Realiza un análisis profesional de SOPORTES Y RESISTENCIAS para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: MAPA DE NIVELES ESTRUCTURALES
Construye un mapa completo usando los Pivot Points S1/S2/S3 y R1/R2/R3, las EMAs 50/100/200 y las Bandas de Bollinger del terminal:

| Nivel | Precio exacto | Tipo (soporte o resistencia) | Indicadores que confluyen en esa zona | Fuerza estimada |
Ordena todos los niveles de mayor a menor precio. Marca las zonas donde 2 o más indicadores coinciden como confluencias fuertes.

### PASO 2: ZONAS DE LIQUIDEZ DEL ORDER BOOK
Analiza el mapa de liquidez (Bubble Map) del terminal:
- Principales muros de compra (bid walls): precio y volumen en USDT donde está la demanda institucional
- Principales muros de venta (ask walls): precio y volumen en USDT donde está la oferta institucional
- Ratio de dominancia compradora/vendedora del terminal y su implicación

### PASO 3: NIVELES ACCIONABLES Y DE INVALIDACIÓN
- Soporte inmediato: precio exacto del terminal + qué esperar si el precio lo toca (rebote probable o ruptura)
- Resistencia inmediata: precio exacto del terminal + qué esperar si el precio la alcanza
- Nivel de invalidación: si se pierde este nivel, el escenario técnico cambia completamente. Define cuál es usando los datos del terminal.

### PASO 4: POSICIÓN ACTUAL DEL PRECIO
Usa el precio spot actual del terminal para ubicarlo respecto a todos los niveles identificados. Determina si está más cerca de soporte (oportunidad de compra) o de resistencia (zona de precaución). Incluye la distancia en porcentaje al soporte y resistencia más cercanos.`,
    },
    {
      icon: Scale,
      iconColor: "text-amber-400",
      title: "Riesgo/beneficio 1:3",
      desc: "Ratio de entrada, stop y objetivos",
      steps: [
        { title: "Contexto y Sesgo", desc: "Tendencia con EMAs/ADX y balance de señales" },
        { title: "Setup R:R 1:3", desc: "Precios de entrada, Stop Loss y TP1/TP2/TP3" },
        { title: "Gestión de Capital", desc: "Riesgo 1-2% y dimensionamiento de posición" },
        { title: "Evaluación en Vivo", desc: "Validación de confluencia con osciladores" },
      ],
      prompt: `Calcula un setup profesional con RATIO RIESGO/BENEFICIO de al menos 1:3 para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: CONTEXTO Y SESGO DE MERCADO
- Tendencia actual basada en EMAs 50/100/200 y ADX del terminal. Indica el bias direccional: alcista, bajista o neutral.
- Señal predominante del terminal (COMPRA/VENTA/NEUTRAL) con el conteo exacto de señales buy/sell/neutral
- Nivel de confianza del setup: alto, medio o bajo. Justifica con los indicadores del terminal.

### PASO 2: SETUP DE ENTRADA Y NIVELES R:R (1:1, 1:2, 1:3)
| Componente | Precio exacto del terminal | Distancia porcentual | Justificación técnica |
| Entrada | Precio basado en soporte cercano o pullback a EMA | ... | ... |
| Stop Loss | Precio basado en S2 o debajo de swing low | ... | ... |
| TP1 (ratio 1:1) | Precio basado en R1 del terminal | ... | ... |
| TP2 (ratio 1:2) | Precio basado en R2 del terminal | ... | ... |
| TP3 (ratio 1:3) | Precio basado en R3 del terminal | ... | ... |

### PASO 3: GESTIÓN DE CAPITAL Y TAMAÑO DE POSICIÓN
- Riesgo máximo por operación: 1-2 porcentaje del capital
- Cálculo del tamaño de posición: con el SL definido, cuánto capital asignar para que la pérdida máxima sea el porcentaje elegido
- Parciales recomendados: distribución del cierre en cada TP

### PASO 4: EVALUACIÓN EN TIEMPO REAL
Usa los indicadores actuales del terminal (RSI, MACD, ADX, MFI, Stochastic) para evaluar si el ratio R:R justifica tomar la operación ahora. Indica si los indicadores confirman o contradicen la dirección del setup.`,
    },
    {
      icon: Gauge,
      iconColor: "text-emerald-400",
      title: "Momentum y tendencia",
      desc: "RSI, MACD y ADX evaluados en conjunto",
      steps: [
        { title: "Dashboard Osciladores", desc: "RSI, MACD, MFI institucional, CCI y ADX" },
        { title: "Confluencia y Fuerza", desc: "Conteo direccional alcista vs bajista" },
        { title: "Alertas y Divergencias", desc: "Detección de divergencias precio/indicador" },
        { title: "Conclusión Operativa", desc: "Veredicto final con nivel de confianza" },
      ],
      prompt: `Realiza un análisis profesional de MOMENTUM Y TENDENCIA para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: DASHBOARD DE OSCILADORES DE MOMENTUM
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

### PASO 2: DIAGNÓSTICO DE CONFLUENCIA Y FUERZA
- Conteo: cuántos indicadores del terminal confirman dirección alcista, cuántos bajista, cuántos neutrales
- Evaluación de divergencias entre el precio y los osciladores del terminal (RSI, MACD, MFI). Si el precio sube pero un oscilador baja, señalar la divergencia.
- Fuerza de la tendencia: combina ADX + alineación de EMAs del terminal para un diagnóstico integrado

### PASO 3: ALERTAS DE DIVERGENCIA Y EXTENSIONES
- Divergencia alcista o bajista detectada con los datos del terminal (si existe)
- Indicadores en extremos: RSI mayor a 70 o menor a 30, CCI en extremos, MFI en extremos
- Conflictos entre indicadores: señales mixtas que sugieren esperar

### PASO 4: CONCLUSIÓN OPERATIVA EN TIEMPO REAL
Veredicto claro basado en todos los datos del terminal: el momentum favorece COMPRA, VENTA o ESPERAR. Indica el nivel de confianza (alto, medio, bajo) y qué indicadores respaldan el veredicto.`,
    },
    {
      icon: BarChart3,
      iconColor: "text-rose-400",
      title: "Resumen técnico completo",
      desc: "Informe cuantitativo de todos los indicadores",
      steps: [
        { title: "Resumen Ejecutivo", desc: "Señal de mercado, volumen 24h y ratio de flujo" },
        { title: "Estructura y Volatilidad", desc: "Alineación de EMAs, ADX y Bandas de Bollinger" },
        { title: "Liquidez y Order Book", desc: "Muros bid/ask, spread y osciladores" },
        { title: "Recomendación Final", desc: "Plan de entrada, Stop Loss, TP y confianza" },
      ],
      prompt: `Genera un INFORME TÉCNICO CUANTITATIVO COMPLETO de grado institucional para ${symbol} en ${interval} usando todos los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: RESUMEN EJECUTIVO Y SEÑAL DE MERCADO
- Señal del mercado del terminal (COMPRA/VENTA/NEUTRAL) con conteo exacto de señales buy/sell/neutral
- Precio spot actual, volumen 24h y ratio de flujo de presión compradora vs vendedora del terminal
- Veredicto en una oración: qué está haciendo el mercado ahora según los datos

### PASO 2: ESTRUCTURA TENDENCIAL Y VOLATILIDAD
- Alineación de EMAs 50/100/200 del terminal: golden cross, death cross o neutral. Precios exactos de cada EMA.
- ADX del terminal y fuerzas direccionales +DI/-DI: fuerza y dirección de la tendencia actual
- Distancia porcentual del precio a cada EMA del terminal
- Bandas de Bollinger del terminal: posición del precio y compresión de volatilidad

### PASO 3: LIQUIDEZ, ORDER BOOK Y OSCILADORES
- Mapa de liquidez del terminal: dominancia compradora o vendedora, bid volume vs ask volume
- Muros de liquidez principales: bid walls y ask walls con sus precios y volúmenes
- Spread actual entre best bid y best ask del terminal
- Consenso de osciladores: RSI, MACD, CCI, MFI y Stochastic

### PASO 4: RECOMENDACIÓN FINAL ACCIONABLE
- Soportes y resistencias clave del terminal (S1-S3, R1-R3) y nivel de invalidación
- Veredicto operativo claro: COMPRA, VENTA, MANTENER o ESPERAR
- Setup con zona de entrada, Stop Loss, Take Profit y ratio riesgo/beneficio
- Nivel de confianza del informe basado en la confluencia de datos del terminal.`,
    },
  ]
}
