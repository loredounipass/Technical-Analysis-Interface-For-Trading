/**
 * Presets de ESTRATEGIAS de trading para la ventana de acciones rápidas.
 * Cada preset es declarativo (icono, color, título, descripción, pasos y el
 * prompt completo). Es una derivación pura de `symbol` e `interval`: los
 * prompts largos se construyen aquí y el llamador los memoiza (useMemo) para
 * NO reconstruir ~20KB de strings en cada render del chat.
 */
import { Zap, Target, TrendingUp, Compass, CircleDollarSign, LayoutGrid, LineChart, Waves } from "lucide-react"

export function buildTradingStrategyPresets(symbol, interval) {
  return [
    {
      icon: Zap,
      iconColor: "text-emerald-400",
      title: "Scalping MACD + RSI",
      desc: "Entradas rápidas con cruce MACD filtrado por RSI",
      steps: [
        { title: "Setup de Entrada", desc: "Cruce MACD con histograma, filtro RSI y volumen" },
        { title: "Plan de Ejecución", desc: "Entrada spot, Stop Loss y TP1/TP2/TP3 con ratios" },
        { title: "Gestión de Riesgo", desc: "Tamaño de posición y filtros de invalidación ADX" },
        { title: "Evaluación en Vivo", desc: "Diagnóstico en tiempo real con datos del terminal" },
      ],
      prompt: `Diseña una estrategia profesional de SCALPING para ${symbol} en timeframe ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: SETUP DE ENTRADA
- Condiciones exactas del cruce MACD (línea vs señal) + histograma para confirmar momentum. Usa los valores actuales de MACD línea, señal e histograma del terminal.
- Filtro RSI: zona válida de entrada basada en el RSI actual del terminal (continuación si está entre 40-60, reversal si está en extremos)
- Confirmación con volumen: compara el volumen actual del terminal contra el promedio de las últimas 10 velas

### PASO 2: PLAN DE EJECUCIÓN
- Punto de entrada específico basado en el precio spot actual y los pivots S1/R1 del terminal
- Stop Loss en precio exacto y en porcentaje (usa el soporte más cercano del terminal como referencia)
- Take Profit 1, TP2 y TP3 con parciales: 50% en TP1, 30% en TP2, 20% en TP3
- Ratio riesgo/beneficio de cada target

### PASO 3: GESTIÓN DE RIESGO
- Tamaño de posición recomendado (porcentaje del capital)
- Máximo de operaciones consecutivas si hay pérdida
- Condiciones para NO operar: ADX actual del terminal menor a 20, spread alto, volumen bajo

### PASO 4: EVALUACIÓN EN TIEMPO REAL
Evalúa con los indicadores en vivo del terminal (RSI, MACD, ADX, volumen, precio vs EMAs) si el setup está ACTIVO ahora o hay que esperar. Indica exactamente qué condición falta para que se active.`,
    },
    {
      icon: Target,
      iconColor: "text-cyan-400",
      title: "Breakout de consolidación",
      desc: "Ruptura de rango con confirmación de volumen",
      steps: [
        { title: "Identificación del Rango", desc: "Límites con Bandas de Bollinger y pivots S/R" },
        { title: "Condiciones de Ruptura", desc: "Volumen mínimo, ADX > 25 y cierre de vela" },
        { title: "Plan Longs & Shorts", desc: "Precios de entrada, SL y objetivos para ambos lados" },
        { title: "Evaluación en Vivo", desc: "Estado de compresión actual y distancia a la ruptura" },
      ],
      prompt: `Diseña una estrategia profesional de BREAKOUT DE CONSOLIDACIÓN para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: IDENTIFICACIÓN DEL RANGO
- Usa las Bandas de Bollinger (banda superior e inferior), pivots S1-S3 y R1-R3 del terminal para definir los límites exactos del rango actual
- Ancho del rango en porcentaje y en precio absoluto
- Evalúa si las Bollinger están comprimidas (ancho estrecho = breakout inminente) usando los valores actuales del terminal

### PASO 2: CONDICIONES DE BREAKOUT VÁLIDO
- Precio de ruptura alcista: nivel exacto basado en R1 o banda superior de Bollinger del terminal
- Precio de ruptura bajista: nivel exacto basado en S1 o banda inferior de Bollinger del terminal
- Volumen mínimo requerido para confirmar vs el volumen actual del terminal
- ADX: debe subir y cruzar por encima de 25 (usa el valor actual del terminal como referencia)
- Confirmación con cierre de vela completa, no mecha

### PASO 3: PLAN DE TRADING (LONGS & SHORTS)
- Entrada larga: precio exacto, SL basado en S2 del terminal, TP1/TP2/TP3 basados en R1/R2/R3
- Entrada corta: precio exacto, SL basado en R2 del terminal, TP1/TP2/TP3 basados en S1/S2/S3
- Falso breakout: cómo identificarlo con volumen y RSI, y cómo reaccionar

### PASO 4: EVALUACIÓN EN TIEMPO REAL
Usa el ADX, ancho de Bollinger, volumen y precio actual del terminal para determinar si está consolidando ahora y qué tan cerca está del breakout.`,
    },
    {
      icon: TrendingUp,
      iconColor: "text-amber-400",
      title: "Swing con medias móviles",
      desc: "Cruce EMA 20/50 con gestión de riesgo",
      steps: [
        { title: "Alineación de Tendencia", desc: "EMAs 50/100/200 y distancia del precio a la media" },
        { title: "Setup de Entrada", desc: "Pullback a EMA con confirmación de RSI y MACD" },
        { title: "Plan y Trailing Stop", desc: "Zonas de entrada, Stop Loss y TP1/TP2/TP3" },
        { title: "Evaluación en Vivo", desc: "Diagnóstico actual de fuerza y timing en el terminal" },
      ],
      prompt: `Diseña una estrategia profesional de SWING TRADING con medias móviles para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: ANÁLISIS DE TENDENCIA ACTUAL
- Alineación actual de EMA 50, EMA 100 y EMA 200 del terminal: alcista (50 > 100 > 200), bajista (inverso) o sin tendencia
- Posición del precio spot actual respecto a cada EMA del terminal
- Distancia porcentual del precio a EMA 50 para evaluar sobreextensión

### PASO 2: SETUP DE ENTRADA
- Señal primaria: cruce de EMAs o pullback a EMA con rebote (evalúa qué aplica según los datos actuales del terminal)
- Confirmaciones requeridas: RSI del terminal en zona favorable, MACD histograma a favor, ADX mayor a 25
- Patrón de velas de confirmación en la zona de entrada

### PASO 3: PLAN DE EJECUCIÓN Y TRAILING STOP
- Zona de entrada: rango de precio basado en la EMA más cercana y el precio actual del terminal
- Stop Loss debajo de la EMA de referencia o del soporte S1/S2 del terminal
- TP1 conservador en R1, TP2 moderado en R2, TP3 agresivo en R3 del terminal
- Trailing stop: cómo mover el SL usando las EMAs como guía

### PASO 4: EVALUACIÓN EN TIEMPO REAL
Usa las EMAs, RSI, MACD y ADX actuales del terminal para determinar si el setup está activo ahora o qué falta.`,
    },
    {
      icon: Compass,
      iconColor: "text-blue-400",
      title: "Tendencia con ADX",
      desc: "Seguimiento de tendencia con filtro ADX > 25",
      steps: [
        { title: "Diagnóstico de Fuerza", desc: "Nivel de ADX y dominancia direccional +DI vs -DI" },
        { title: "Reglas de Entrada", desc: "Validación de setups long/short con EMAs y RSI" },
        { title: "Niveles Operativos", desc: "Pivots S/R, Stop Loss y ratio mínimo 1:2" },
        { title: "Evaluación en Vivo", desc: "Veredicto con osciladores y datos en tiempo real" },
      ],
      prompt: `Diseña una estrategia profesional de SEGUIMIENTO DE TENDENCIA con ADX para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: DIAGNÓSTICO DE FUERZA TENDENCIAL
- Valor actual del ADX del terminal y su dirección (subiendo o bajando en las últimas velas)
- +DI vs -DI del terminal: cuál domina y por cuánto (fuerza direccional neta)
- Clasificación: sin tendencia (ADX menor a 20), tendencia débil (20-25), tendencia fuerte (25-50), tendencia extrema (mayor a 50)

### PASO 2: REGLAS DE ENTRADA DIRECCIONAL
- LONG: ADX mayor a 25 + +DI mayor que -DI + precio sobre EMA 50 + RSI confirmando. Evalúa cada condición con los datos actuales del terminal.
- SHORT: ADX mayor a 25 + -DI mayor que +DI + precio bajo EMA 50 + RSI confirmando. Evalúa cada condición con los datos actuales del terminal.
- Filtro adicional: MACD histograma del terminal debe estar a favor de la dirección

### PASO 3: NIVELES OPERATIVOS Y FILTROS
- Punto de entrada específico basado en el precio spot actual del terminal
- Stop Loss usando los pivots S1/S2 (long) o R1/R2 (short) del terminal
- TP1, TP2, TP3 basados en los niveles de pivots y resistencias del terminal
- Ratio riesgo/beneficio mínimo aceptable: 1:2

### PASO 4: EVALUACIÓN EN TIEMPO REAL
Evalúa el ADX, +DI, -DI, RSI, MACD y posición del precio vs EMAs actuales del terminal. Determina si hay tendencia operable ahora o si hay que esperar.`,
    },
    {
      icon: CircleDollarSign,
      iconColor: "text-emerald-400",
      title: "DCA (Promediar costo)",
      desc: "Compras periódicas para promediar el costo de entrada",
      steps: [
        { title: "Contexto de Mercado", desc: "Alineación de medias, RSI y flujo de dinero MFI" },
        { title: "Plan de 5 Compras", desc: "Niveles en soportes S1-S3, EMA 100 y EMA 200" },
        { title: "Horizonte y Frecuencia", desc: "Asignación de capital y calendario de compras" },
        { title: "Reglas y Evaluación", desc: "Condiciones para pausar, acelerar y tomar ganancias" },
      ],
      prompt: `Diseña un plan profesional de DCA (Dollar Cost Averaging) para ${symbol} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: CONTEXTO DE MERCADO ACTUAL
- Precio spot actual del terminal y tendencia general basada en la alineación de EMAs 50/100/200 y el ADX
- RSI del terminal: zona de sobreventa (oportunidad para DCA agresivo) o sobrecompra (precaución)
- Posición del precio dentro de las Bandas de Bollinger del terminal: cerca de banda inferior es buen momento para DCA
- MFI del terminal: acumulación institucional (favorable) o distribución (desfavorable)

### PASO 2: PLAN DE COMPRAS ESCALONADO (5 NIVELES)
Diseña 5 niveles de compra basados en los soportes reales del terminal:
| Nivel | Precio de Compra | Porcentaje del Capital | Razón Técnica |
Usa S1, S2, S3, EMA 100 y EMA 200 del terminal como niveles de compra. Cada nivel debe coincidir con un soporte técnico real.

### PASO 3: HORIZONTE, FRECUENCIA Y CAPITAL
- Frecuencia recomendada: diaria, semanal o mensual. Justifica según la volatilidad actual medida por el ancho de Bollinger
- Horizonte temporal: corto (1-3 meses), medio (3-12 meses) o largo plazo (mayor a 1 año)
- Capital total sugerido a asignar y distribución por compra

### PASO 4: EVALUACIÓN Y REGLAS DE GESTIÓN
- Condición para PAUSAR el DCA: RSI del terminal mayor a 80, precio más de 2 desviaciones sobre EMA 200
- Condición para ACELERAR el DCA: RSI menor a 25, MFI mostrando acumulación, precio en zona de soporte S2/S3
- Take profit parcial: a qué porcentaje de ganancia tomar ganancias sobre lo acumulado, usando R1/R2/R3 como objetivos
- Veredicto: con los datos actuales del terminal, ¿es buen momento para iniciar DCA?`,
    },
    {
      icon: LayoutGrid,
      iconColor: "text-cyan-400",
      title: "Grid trading",
      desc: "Órdenes escalonadas de compra/venta en rango",
      steps: [
        { title: "Definición del Rango", desc: "Techo en resistencias R1-R3 y piso en soportes S1-S3" },
        { title: "Tabla de Órdenes", desc: "Niveles escalonados de compra y venta del grid" },
        { title: "Rentabilidad por Ciclo", desc: "Tamaño de orden y rendimiento estimado" },
        { title: "Gestión de Riesgo", desc: "Protección contra breakouts y filtro ADX > 40" },
      ],
      prompt: `Diseña una estrategia profesional de GRID TRADING para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: DEFINICIÓN DEL RANGO DEL GRID
- Límite superior: usa la resistencia más fuerte entre R1/R2/R3 y la banda superior de Bollinger del terminal
- Límite inferior: usa el soporte más fuerte entre S1/S2/S3 y la banda inferior de Bollinger del terminal
- Rango total en porcentaje y en precio absoluto basado en los valores reales del terminal
- Número de niveles recomendado (entre 5-15) y separación entre cada uno

### PASO 2: TABLA DE NIVELES DE COMPRA Y VENTA
| Nivel | Tipo | Precio | Acción | Porcentaje del Capital |
Genera la tabla completa con cada nivel de compra y venta. Usa los soportes y resistencias reales del terminal para alinear los niveles del grid con zonas de confluencia técnica.

### PASO 3: PARÁMETROS Y RENTABILIDAD ESTIMADA
- Capital total a asignar al grid
- Tamaño de cada orden en USDT y en unidades del activo al precio actual
- Ganancia por ciclo (compra + venta de un nivel)
- Ganancia estimada mensual si el precio oscila en el rango definido

### PASO 4: GESTIÓN DE RIESGO Y CONTROL DE RUPTURA
- Breakout alcista (precio rompe por arriba del grid): plan de acción
- Breakdown bajista (precio rompe por abajo del grid): plan de acción
- Stop loss global del grid basado en S3 del terminal
- Condiciones para desactivar el grid: ADX del terminal mayor a 40 indica tendencia fuerte donde el grid no funciona
- Aptitud actual: ¿el mercado está lateral (ideal) o tendencial (peligroso)?`,
    },
    {
      icon: LineChart,
      iconColor: "text-amber-400",
      title: "Cruce dorado EMA 50/200",
      desc: "Cambio de tendencia con medias exponenciales",
      steps: [
        { title: "Estado de las EMAs", desc: "Distancia, convergencia y posición del precio" },
        { title: "Detección del Cruce", desc: "Evaluación de Golden Cross vs Death Cross" },
        { title: "Plan de Ejecución", desc: "Entradas, Stop Loss dinámico y objetivos" },
        { title: "Evaluación en Vivo", desc: "Confirmación con volumen, MACD y RSI" },
      ],
      prompt: `Analiza la estrategia de CRUCE DORADO y CRUCE DE LA MUERTE con EMA 50/200 para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: ESTADO Y DISTANCIA DE LAS EMAs
- EMA 50 vs EMA 200 del terminal: cuál está por encima y por cuánto (en precio y porcentaje)
- Dirección de convergencia o divergencia: las EMAs se acercan o se alejan
- Posición del precio spot actual respecto a ambas EMAs del terminal
- Evalúa las últimas velas de la serie EMA 50 y EMA 200 del terminal para determinar si hubo cruce reciente

### PASO 2: SEÑALES DE CRUCE DORADO / MUERTE
- Cruce Dorado: EMA 50 cruza por encima de EMA 200, señal alcista de largo plazo
- Cruce de la Muerte: EMA 50 cruza por debajo de EMA 200, señal bajista de largo plazo
- Estado actual con datos del terminal: golden cross activo, death cross activo, o aproximándose a un cruce

### PASO 3: PLAN DE EJECUCIÓN Y CONFIRMACIONES
- Si se confirma cruce dorado: entrada en el precio actual, SL debajo de EMA 200 del terminal, TP basados en R1/R2/R3
- Si se confirma cruce de la muerte: entrada short o salida de posiciones largas, SL encima de EMA 200
- Confirmaciones adicionales: volumen, RSI, MACD del terminal deben estar alineados con la dirección del cruce

### PASO 4: EVALUACIÓN EN TIEMPO REAL
- Falsos cruces en mercados laterales: si el ADX del terminal es menor a 20, el cruce tiene alta probabilidad de ser falso
- Veredicto: usa las EMAs, ADX, MACD y RSI actuales del terminal para determinar si se aproxima un cruce y si los indicadores lo confirman.`,
    },
    {
      icon: Waves,
      iconColor: "text-rose-400",
      title: "Momentum con volumen",
      desc: "Rupturas con volumen y RSI confirmando",
      steps: [
        { title: "Lectura Institucional", desc: "RSI, MACD, MFI institucional y Stoch RSI" },
        { title: "Setup Explosivo", desc: "Validación simultánea de las 5 condiciones" },
        { title: "Plan de Ejecución", desc: "Entradas agresiva/conservadora, SL y targets" },
        { title: "Evaluación en Vivo", desc: "Diagnóstico de confluencia y agotamiento" },
      ],
      prompt: `Diseña una estrategia profesional de MOMENTUM TRADING con confirmación de volumen para ${symbol} en ${interval} usando los datos de mercado en vivo del terminal. Estructura tu respuesta estrictamente paso a paso así:

### PASO 1: LECTURA DE MOMENTUM INSTITUCIONAL
Usa los valores exactos del terminal para cada indicador:
- RSI (14): valor actual, dirección en las últimas velas, zona (sobreventa/neutral/sobrecompra)
- MACD: línea vs señal, histograma (acelerando o desacelerando)
- MFI (14): flujo de dinero institucional, acumulación o distribución
- CCI (20): extremos de momentum
- Stochastic RSI: timing preciso de entrada

### PASO 2: SETUP DE ENTRADA EXPLOSIVA (5 CONDICIONES)
Condiciones que deben cumplirse TODAS simultáneamente para validar la entrada:
1. Volumen de la vela actual mayor a 1.5 veces el volumen promedio de las últimas 10 velas del terminal
2. RSI del terminal rompiendo nivel 50 en la dirección de la operación
3. MACD histograma del terminal cambiando de signo (negativo a positivo para long, viceversa para short)
4. Precio rompiendo EMA 50 del terminal con fuerza (cierre de vela, no mecha)
5. MFI del terminal confirmando flujo de dinero en la dirección

### PASO 3: EJECUCIÓN, STOP LOSS Y TAKE PROFIT
- Entrada agresiva: en la ruptura con volumen al precio actual si las condiciones se cumplen
- Entrada conservadora: en el pullback posterior a la ruptura, nivel basado en EMA 50 del terminal
- Stop Loss: debajo del soporte S1 del terminal (long) o encima de R1 (short)
- TP1 en R1, TP2 en R2, TP3 en R3 del terminal con trailing stop progresivo

### PASO 4: EVALUACIÓN EN TIEMPO REAL
- Alertas de agotamiento: divergencias RSI/precio y caída de MFI
- Veredicto: evalúa todos los indicadores de momentum del terminal y determina si hay momentum operable ahora y con qué confianza.`,
    },
  ]
}
