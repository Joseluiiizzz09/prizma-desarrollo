export function parsearAdicionales(valor) {
  if (Array.isArray(valor)) return valor
  if (!valor) return []
  try {
    const items = JSON.parse(valor)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export function adicionalesTexto(valor) {
  const items = parsearAdicionales(valor)
  return items.length ? items.join(', ') : '—'
}
