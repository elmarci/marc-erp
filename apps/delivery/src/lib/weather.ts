// Aviso específico de moto: nadie más necesita saber si hay garúa o pista
// mojada tanto como alguien que va sobre dos ruedas. Open-Meteo no pide
// API key y tiene CORS abierto — sirve para un aviso liviano sin backend.
// Coordenadas de Manchay, Pachacámac (zona real de reparto).
const LAT = -12.038
const LON = -76.845

export interface ViaAlert {
  nivel: 'aviso' | 'alerta'
  mensaje: string
}

// Códigos WMO (weathercode de Open-Meteo). Solo se avisa cuando hay algo
// que de verdad cambia cómo se debe manejar — un cielo despejado no genera
// ningún banner; ruido no pedido a alguien que va manejando.
function clasificar(code: number): ViaAlert | null {
  if (code >= 95) return { nivel: 'alerta', mensaje: 'Tormenta eléctrica en la zona — considera pausar tus entregas un momento' }
  if ((code >= 80 && code <= 82) || (code >= 61 && code <= 67)) return { nivel: 'alerta', mensaje: 'Lluvia en la zona — reduce la velocidad, la pista está resbalosa' }
  if ((code >= 51 && code <= 57) || code === 45 || code === 48) return { nivel: 'aviso', mensaje: 'Garúa/neblina en la zona — maneja con cuidado y usa las luces' }
  return null
}

export async function fetchViaAlert(): Promise<ViaAlert | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code&timezone=America%2FLima`,
  )
  if (!res.ok) return null
  const data = await res.json()
  const code = data?.current?.weather_code
  if (typeof code !== 'number') return null
  return clasificar(code)
}
