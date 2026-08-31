// ── Lista central de campañas (Backoffice / comercial) ──────────────────
// Para agregar una campaña nueva en el futuro, solo añade su nombre a este
// array (respeta el orden que quieras que aparezca en el desplegable).
// Se usa en el formulario de registro individual y en la carga masiva de
// Backoffice. NO se usa en Reclutamiento (ver CAMPANAS_RECLUTAMIENTO).
export const CAMPANAS = [
  'FABI',
  'M5',
  'MAFER',
  'NICOLE',
  'PAO',
  'SANTI',
  'MESSENGER',
  'REFERIDOS',
  'DIEGO',
  'JOSS',
  'YOPI',
  'MASIVO',
  'CAIDAS CLARO',
  'LEAD CRM',
]

// ── Lista de campañas de Reclutamiento ───────────────────────────────────
// Independiente de CAMPANAS (Backoffice) — cambiarla no afecta el
// formulario comercial.
export const CAMPANAS_RECLUTAMIENTO = [
  'R4',
  'R6',
  'REFERIDOS',
]
