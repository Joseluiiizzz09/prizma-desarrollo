import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import MediaViewer from '../components/MediaViewer'
import { HistorialVentaModal, ReasignarVentaModal } from '../components/VentaAssignmentModal'
import { VentaEditarModal } from '../components/VentaEditarModal'
import ObsSeguimientoCell from '../components/ObsSeguimientoCell'
import ProgramacionInfoCell from '../components/ProgramacionInfoCell'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import { API, ncHeaders } from '../services/api'
import { permisosDeUsuario, usuarioTieneCargo } from '../utils/roles'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import Chart from 'chart.js/auto'
import * as XLSX from 'xlsx'
import '../styles/jefatura.css'

/* ── constantes ── */
const JEF_APARTADO_KEY     = 'nc_jefatura_apartado'
const JEF_SALA_REPORTE_KEY = 'nc_jefatura_sala_reporte'
const JEF_SEG_FILTRO_KEY   = 'nc_jefatura_seg_filtro'

const CARGOS = [
  { id:'asesor',         label:'Asesor',           cls:'bc-asesor'         },
  { id:'supervisor',     label:'Supervisor',        cls:'bc-supervisor'     },
  { id:'backoffice',     label:'Back Data',         cls:'bc-backoffice'     },
  { id:'validacion',     label:'Validación',        cls:'bc-validacion'     },
  { id:'grabaciones',    label:'Grabaciones',       cls:'bc-grabaciones'    },
  { id:'seguimiento',    label:'Seguimiento',       cls:'bc-seguimiento'    },
  { id:'jefatura',       label:'Jefatura',          cls:'bc-jefatura'       },
  { id:'usuarios',       label:'Usuarios',          cls:'bc-usuarios'       },
  { id:'cobranzas',      label:'Cobranzas',         cls:'bc-cobranzas'      },
  { id:'calidad',        label:'Calidad',           cls:'bc-calidad'        },
  { id:'supcalidad',     label:'Super de Calidad',  cls:'bc-calidad'        },
  { id:'backreclutamiento',   label:'Back Data Reclutaminto',  cls:'bc-backreclutamiento'   },
  { id:'asesorreclutamiento', label:'Asesor de Reclutamiento', cls:'bc-asesorreclutamiento' },
]
const SALAS = ['SALA 1','SALA 2']
const CARGOS_CON_SALA = ['asesor','supervisor','validacion']

function usuarioRequiereSala(cargo, cargo2) {
  return CARGOS_CON_SALA.includes(cargo) || CARGOS_CON_SALA.includes(cargo2)
}

const SEG_MAP = {
  en_ejecucion:'ejecucion',
  instalado:'instalado',caida:'caida',rechazo_campo:'rechazo',tecnico_casa:'tecnico',
  levantar_sot:'levantar_sot', tecnicos_camino:'tecnicos_camino',
  instalado_no_validado:'instalado_no_validado', reasignacion:'reasignacion',
  derivado_planta_externa:'derivado_planta_externa', servicio_activo:'servicio_activo',
}
// Colores idénticos al resultado final real de seguimiento.css (cascada de
// .bs-ejec/.bs-inst/.bs-rech/.bs-caida/.bs-tecnico + overrides !important en
// .leyenda-item.l-*, que son los que realmente ganan en /seguimiento).
const SEG_BADGES = {
  ejecucion:{ label:'EN EJECUCIÓN',    bg:'#ecfdf5', color:'#047857', border:'rgba(52,211,153,.35)'  },
  instalado:{ label:'INSTALADO',       bg:'#eff6ff', color:'#2563eb', border:'rgba(96,165,250,.35)'  },
  rechazo:  { label:'RECHAZO CAMPO',   bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)'  },
  caida:    { label:'CAÍDA',           bg:'#ffedd5', color:'#c2410c', border:'rgba(248,113,113,.35)' },
  tecnico:  { label:'TÉCNICO EN CASA', bg:'#fce7f3', color:'#be185d', border:'rgba(244,114,182,.45)' },
  levantar_sot:{ label:'LEVANTAR SOT', bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)' },
  tecnicos_camino:{ label:'TÉCNICOS EN CAMINO', bg:'#fce7f3', color:'#be185d', border:'rgba(244,114,182,.45)' },
  instalado_no_validado:{ label:'INSTALADO NO VALIDADO', bg:'#eff6ff', color:'#2563eb', border:'rgba(96,165,250,.35)' },
  reasignacion:{ label:'REASIGNACIÓN', bg:'#ecfdf5', color:'#047857', border:'rgba(52,211,153,.35)' },
  derivado_planta_externa:{ label:'DERIVADO A PLANTA EXTERNA', bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)' },
  servicio_activo:{ label:'SERVICIO ACTIVO', bg:'#f3f4f6', color:'#1f2937', border:'rgba(156,163,175,.45)' },
}
const SEG_ORD = { caida:0, rechazo:1, levantar_sot:2, derivado_planta_externa:3, tecnico:4, tecnicos_camino:5, reasignacion:6, ejecucion:7, instalado_no_validado:8, servicio_activo:9, instalado:10 }

const PROG_STYLES = {
  PROGRAMADO:       { bg:'#dcfce7',color:'#15803d',border:'rgba(74,222,128,.4)'  },
  BLOQUEADO:        { bg:'#ffedd5',color:'#9a3412',border:'rgba(248,113,113,.4)' },
  RECHAZADO:        { bg:'#ffedd5',color:'#9a3412',border:'rgba(251,146,60,.4)'  },
  SIN_AGENDA:       { bg:'#fef9c3',color:'#854d0e',border:'rgba(250,204,21,.4)'  },
  CARACTER_ESPECIAL:{ bg:'#ede9fe',color:'#5b21b6',border:'rgba(167,139,250,.4)' },
  FRAUDE:           { bg:'#1f2937',color:'#f9fafb',border:'rgba(75,85,99,.4)'    },
  ZONA_RESTRINGIDA: { bg:'#ffedd5',color:'#9a3412',border:'rgba(251,146,60,.4)'  },
  PENDIENTE:        { bg:'#f3f4f6',color:'#6b7280',border:'rgba(156,163,175,.4)' },
}
function estadoProg(raw) {
  const s = (raw || '').toUpperCase()
  if (!s) return { key:'PENDIENTE', label:'PENDIENTE' }
  if (s === 'VALIDADO') return { key:'RECHAZADO', label:'RECHAZADO' }
  const m = { PROGRAMADO:'PROGRAMADO',BLOQUEADO:'BLOQUEADO',RECHAZADO:'RECHAZADO',SIN_AGENDA:'SIN AGENDA',CARACTER_ESPECIAL:'CARÁCTER ESPECIAL',FRAUDE:'FRAUDE',ZONA_RESTRINGIDA:'ZONA RESTRINGIDA' }
  return { key:s, label:m[s]||s }
}

const ACCESOS_MODS = [
  { nombre:'Back Data',        desc:'Gestión y asignación de leads', icon:'clipboard', path:'/backoffice',      color:'#fed7aa', cargo:'backoffice' },
  { nombre:'Validación',       desc:'Control y revisión de ventas',  icon:'shield',    path:'/validacion',      color:'#fdba74', cargo:'validacion' },
  { nombre:'Grabaciones',      desc:'Auditoría de llamadas',         icon:'mic',       path:'/grabaciones',     color:'#fb923c', cargo:'grabaciones' },
  { nombre:'Seguimiento',      desc:'Seguimiento postventa',         icon:'activity',  path:'/seguimiento',     color:'#f97316', cargo:'seguimiento' },
  { nombre:'Supervisor',       desc:'Gestión de equipos y salas',    icon:'briefcase', path:'/supervisor',      color:'#ea580c', cargo:'supervisor' },
  { nombre:'Dashboard CRM',    desc:'Panel individual del asesor',   icon:'chart',     path:'/dashboard',       color:'#c2410c', cargo:'asesor' },
  { nombre:'Gestión Usuarios', desc:'Administración de accesos',     icon:'users',     path:'/usuarios',        color:'#9a3412', cargo:'usuarios' },
  { nombre:'Cobranzas',        desc:'Clientes instalados y contratos',icon:'wallet',    path:'/cobranzas',       color:'#fdba74', cargo:'cobranzas' },
  { nombre:'Calidad',          desc:'Control de clientes instalados',   icon:'quality',   path:'/calidad',         color:'#fb923c', cargo:'calidad' },
  { nombre:'Super de Calidad', desc:'Supervisión del equipo de Calidad',icon:'quality',   path:'/sup-calidad',     color:'#f97316', cargo:'supcalidad' },
  { nombre:'Back Data Reclutaminto',        desc:'Gestión y asignación de candidatos', icon:'clipboard', path:'/backdata-reclutamiento', color:'#4338ca', cargo:'backreclutamiento' },
  { nombre:'Sistema de Llamadas Reclutamiento', desc:'Contacto y seguimiento de postulantes', icon:'chart', path:'/reclutamiento', color:'#0e7490', cargo:'asesorreclutamiento' },
]

function ModuloIcon({ tipo, size = 24 }) {
  const trazos = {
    clipboard: <><rect x="7" y="4.5" width="10" height="15" rx="2.3"/><path d="M10 8.5h4M10 12h4M10 15.5h4"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></>,
    activity: <><path d="M3 12h4l2.2-5 4.1 10 2.2-5H21"/><circle cx="12" cy="12" r="9"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 5-3 6 5 5-4"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></>,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M18 19h-2v-7h4v5a2 2 0 0 1-2 2ZM6 19H4a2 2 0 0 1-2-2v-5h4v7Z"/></>,
    wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3h11"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></>,
    quality: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{display:'block', margin:'auto', flex:'0 0 auto'}}>{trazos[tipo] || trazos.activity}</svg>
}

/* ── helpers puros ── */
function fechaHoy()    { return new Date().toISOString().split('T')[0] }
function horaAhora()   { return new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}) }
function mesActual()   { return fechaHoy().slice(0,7) }
function formatF(f)    { if(!f)return'—'; const p=f.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
function cargoObj(id)  { return CARGOS.find(c=>c.id===id)||{label:id,cls:'bc-default'} }
function colorAvatar(n){ const c=["#3b82f6","#8b5cf6","#22c55e","#f97316","#f97316","#06b6d4","#ec4899","#f59e0b"]; let s=0; for(const ch of n) s+=ch.charCodeAt(0); return c[s%c.length] }
function iniciales(n)  { return n.trim().split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
function mapSeg(e)     { const s=(e||'').toLowerCase(); if(SEG_MAP[s])return SEG_MAP[s]; if(s.includes('tecnico'))return'tecnico'; if(s.includes('rechazo'))return'rechazo'; if(s.includes('ejecucion'))return'ejecucion'; return null }
function efColor(v)    { return v>=70?'#16a34a':v>=40?'#d97706':'#ea580c' }
// EJECUTADA (Seguimiento) es el equivalente vigente del antiguo estado
// INSTALADO — cuenta igual en todos los KPIs/gráficos de instalaciones.
function esVentaInstalada(estado) {
  const e = String(estado || '').trim().toLowerCase()
  return e === 'instalado' || e === 'ejecutada'
}
function normEstado(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
const FLUJO_NO_VALIDA = new Set(['venta','corta_llamada','fraude','no_desea','no_contesta','buzon_voz','servicio_activo','no_validado','bloqueado','zona_restringida','caracter_especial','sin_agenda','corregir','mala_oferta'])
const FLUJO_GRABADA = new Set(['grabado','grabada','aprobado','programado','en_ejecucion','instalado','caida','rechazo_campo','tecnico_casa','levantar_sot','tecnicos_camino','instalado_no_validado','reasignacion','derivado_planta_externa'])
const FLUJO_SEGUIMIENTO = new Set(['en_ejecucion','instalado','caida','rechazo_campo','tecnico_casa','levantar_sot','tecnicos_camino','instalado_no_validado','reasignacion','derivado_planta_externa','servicio_activo'])
function estadoSeguimiento(v) {
  const estado = normEstado(v?.estado || v?.estado_venta)
  if (FLUJO_SEGUIMIENTO.has(estado)) return estado
  // CONFORME es la puerta de entrada real a Seguimiento. Algunas ventas
  // históricas conservan PROGRAMADO como estado global, pero operativamente
  // ya están EN EJECUCIÓN y deben reflejarse así en esta columna.
  if (normEstado(v?.estado_supgrab) === 'conforme') return 'en_ejecucion'
  return ''
}
function flujoTieneAudio(v) {
  return Boolean(v?.audio || v?.audio_url || v?.archivo_audio || v?.archivoAudio || v?.grabacion || v?.grabacion_url || v?.audio_path)
}
function flujoNoValidada(v) {
  const estado = normEstado(v?.estado || v?.estado_venta)
  if (estado === 'servicio_activo' && normEstado(v?.estado_supgrab) === 'conforme') return false
  return FLUJO_NO_VALIDA.has(estado)
}
function flujoValidada(v) {
  const e = normEstado(v?.estado || v?.estado_venta)
  return Boolean(e) && e !== 'venta' && !flujoNoValidada(v)
}
function flujoGrabada(v) {
  return FLUJO_GRABADA.has(normEstado(v?.estado || v?.estado_venta))
    || normEstado(v?.estado_grab) === 'grabado'
    || flujoTieneAudio(v)
}
function flujoNoGrabada(v) { return flujoValidada(v) && !flujoGrabada(v) }
const ESTADOS_PROPIOS_VALIDACION = new Set([
  'venta','validado','no_validado','corta_llamada','fraude','no_desea',
  'no_contesta','buzon_voz','servicio_activo','corregir','mala_oferta',
])
function estadoValidacion(v) {
  // La validación tiene un estado histórico propio. Nunca debe heredar el
  // estado global que luego cambia en Programación o Seguimiento.
  const e = normEstado(v?.estado_validacion)
  const propio = ESTADOS_PROPIOS_VALIDACION.has(e) ? e : 'venta'
  return propio.replace(/_/g, ' ').toUpperCase()
}
function coincideFiltroValidacion(v, filtro) {
  const estado = estadoValidacion(v)
  if (filtro === 'validado') return estado === 'VALIDADO'
  if (filtro === 'no_validado') return estado !== 'VALIDADO' && estado !== 'VENTA'
  if (filtro === 'ventas') return estado === 'VENTA'
  return true
}
function estadoGrabacion(v) {
  const g = (v?.estado_grab || '').trim()
  return g || 'PENDIENTE'
}
function flujoLabelEstado(estado) {
  const e = normEstado(estado)
  return ({
    venta:'Venta subida',
    validado:'Validada',
    validada:'Validada',
    no_validado:'No validada',
    grabado:'Grabada',
    grabada:'Grabada',
    aprobado:'Grabada',
    observado:'Observada',
    en_revision:'En revisión',
    programado:'Programada',
    en_ejecucion:'En ejecución',
    instalado:'Instalada',
    caida:'Caída',
    rechazo_campo:'Rechazo campo',
    tecnico_casa:'Técnico en casa',
    levantar_sot:'Levantar SOT',
    tecnicos_camino:'Técnicos en camino',
    instalado_no_validado:'Instalado no validado',
    reasignacion:'Reasignación',
    derivado_planta_externa:'Derivado a planta externa',
    corta_llamada:'Corta llamada',
    fraude:'Fraude',
    no_desea:'No desea',
    no_contesta:'No contesta',
    servicio_activo:'Servicio activo',
    buzon_voz:'Buzón de voz',
    bloqueado:'Bloqueado',
    zona_restringida:'Zona restringida',
    caracter_especial:'Carácter especial',
    sin_agenda:'Sin agenda',
  })[e] || (estado || 'Venta subida')
}

const MOD_FORM_VACIO = { nombre:'', usuario:'', cargo:'', cargo2:'', sala:'', pass:'', pass2:'' }

// Valores únicos y ordenados para poblar selects dinámicos (Asesor/Sala/Distrito/Plan) —
// nunca hardcodeados, siempre derivados de los datos reales ya cargados.
function opcionesUnicas(valores) {
  return [...new Set(valores.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

// Fecha "YYYY-MM-DD" comparable como texto — sin conversiones de Date/timezone,
// desde/hasta quedan inclusivos en ambos extremos.
function soloFecha(v) {
  return String(v || '').split(' ')[0].split('T')[0]
}

function snapshotEliminado(item) {
  if (!item?.snapshot_json) return null
  if (typeof item.snapshot_json === 'object') return item.snapshot_json
  try { return JSON.parse(item.snapshot_json) } catch { return null }
}

function etiquetaTipoEliminacion(tipo) {
  return ({
    VENTA: 'Venta',
    POSTULANTE: 'Postulante',
    NUMERO_BACKDATA: 'Número Back Data',
    NUMERO_RECLUTAMIENTO: 'Número Reclutamiento',
    ASIGNACION_BACKDATA: 'Asignación quitada',
  })[tipo] || tipo || 'Registro'
}

// Exportación genérica a Excel: recibe filas ya filtradas (nunca solo la
// página visible) y una lista de columnas [encabezado, getter(fila)].
function descargarExcel(filas, columnas, nombreArchivo) {
  const datos = filas.map(fila => {
    const obj = {}
    columnas.forEach(([header, getter]) => { obj[header] = getter(fila) ?? '-' })
    return obj
  })
  const hoja  = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos')
  XLSX.writeFile(libro, nombreArchivo)
}

// Filtro de estado multi-seleccion (estilo Excel), igual al de /seguimiento
// pero con una lista plana de strings en vez de {id,label}.
function textoFiltroMayuscula(valor) {
  return String(valor || '').replace(/_/g, ' ').toLocaleUpperCase('es-PE')
}

function FiltroEstadoMultiple({ opciones, seleccionados, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onClickFuera(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const todos = seleccionados.length === 0
  function toggleUno(valor) {
    onChange(seleccionados.includes(valor) ? seleccionados.filter(x => x !== valor) : [...seleccionados, valor])
  }

  const label = todos
    ? 'TODOS'
    : seleccionados.length === 1
      ? textoFiltroMayuscula(seleccionados[0])
      : `${seleccionados.length} ESTADOS SELECCIONADOS`

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" className="filtro-estado-btn" onClick={() => setAbierto(o => !o)}>
        <span>{label}</span>
        <span style={{ marginLeft: 6, opacity: .6 }}>▾</span>
      </button>
      {abierto && (
        <div className="filtro-estado-panel">
          <label className="filtro-estado-item filtro-estado-todos">
            <input type="checkbox" checked={todos} onChange={() => onChange([])} />
            <span>TODOS</span>
          </label>
          <div className="filtro-estado-divider" />
          {opciones.map(o => (
            <label key={o} className="filtro-estado-item">
              <input type="checkbox" checked={seleccionados.includes(o)} onChange={() => toggleUno(o)} />
              <span>{textoFiltroMayuscula(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Jefatura() {
  const navigate = useNavigate()
  const { sesion, logout, refrescarSesion } = useAuth()
  const usuarioNombre = sesion?.nombre || 'Jefatura'
  const mainRef = useRef(null)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  /* nav */
  const [seccion, setSeccion] = useState(() => {
    try { return sessionStorage.getItem(JEF_APARTADO_KEY) || 'dashboard' } catch { return 'dashboard' }
  })

  /* data */
  const [usuarios,    setUsuarios]    = useState([])
  const [usuariosCarga, setUsuariosCarga] = useState({ cargando:true, error:'' })
  const [ventasCache, setVentasCache] = useState([])
  const [ventasSeg,   setVentasSeg]   = useState([])
  const [reclutados, setReclutados] = useState([])
  const [cargandoReclutados, setCargandoReclutados] = useState(false)
  const [eliminaciones, setEliminaciones] = useState([])
  const [cargandoEliminaciones, setCargandoEliminaciones] = useState(false)
  const [eliminacionBorrandoId, setEliminacionBorrandoId] = useState(null)
  const [detalleEliminacion, setDetalleEliminacion] = useState(null)


  /* filtros persistentes */
  const [filtroSeg, setFiltroSeg] = useState(() => {
    try { return sessionStorage.getItem(JEF_SEG_FILTRO_KEY) || '' } catch { return '' }
  })
  const [salaReporte, setSalaReporte] = useState(() => {
    try { return sessionStorage.getItem(JEF_SALA_REPORTE_KEY) || 'todas' } catch { return 'todas' }
  })
  const [mesReporte, setMesReporte] = useState('')
  const [busqUsuarios, setBusqUsuarios] = useState('')
  const [filtroCargoUsuarios, setFiltroCargoUsuarios] = useState('')
  const [filtroSalaUsuarios, setFiltroSalaUsuarios] = useState('')
  const [filtroFlujoVentas, setFiltroFlujoVentas] = useState('todas')
  const [busqFlujoVentas, setBusqFlujoVentas] = useState('')

  /* filtros avanzados — Ventas generales (se combinan con filtroFlujoVentas/busqFlujoVentas) */
  const [fvEstados,    setFvEstados]    = useState([])
  const [fvValidacion, setFvValidacion] = useState('')
  const [fvGrabacion,  setFvGrabacion]  = useState('')
  const [fvAsesor,     setFvAsesor]     = useState('')
  const [fvSala,       setFvSala]       = useState('')
  const [fvDistrito,   setFvDistrito]   = useState('')
  const [fvDesde,      setFvDesde]      = useState('')
  const [fvHasta,      setFvHasta]      = useState('')
  const [paginaFlujo, setPaginaFlujo] = useState(1)
  const [porPaginaFlujo, setPorPaginaFlujo] = useState(18)

  /* filtros avanzados — Seguimiento en campo (se combinan con filtroSeg) */
  const [fsAsesor,    setFsAsesor]    = useState('')
  const [fsSala,      setFsSala]      = useState('')
  const [fsDistrito,  setFsDistrito]  = useState('')
  const [fsPlan,      setFsPlan]      = useState('')
  const [fsDesde,     setFsDesde]     = useState('')
  const [fsHasta,     setFsHasta]     = useState('')
  const [fsBusqueda,  setFsBusqueda]  = useState('')

  /* dashboard de leads para Marketing — exclusivo de esta vista de Jefatura */
  const [marketingFiltros, setMarketingFiltros] = useState({ desde:'', hasta:'', campana:'', tipificacion:'' })
  const [marketingData, setMarketingData] = useState([])
  const [marketingCatalogos, setMarketingCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingCarga, setMarketingCarga] = useState({ cargando:false, error:'' })

  /* logs */
  const [logs, setLogs] = useState(() => {
    try { const r = localStorage.getItem('jef_logs'); return r ? JSON.parse(r) : [] } catch { return [] }
  })

  /* modal usuario */
  const [modalUsu,    setModalUsu]    = useState(false)
  const [editandoId,  setEditandoId]  = useState(null)
  const [modForm,     setModForm]     = useState(MOD_FORM_VACIO)
  const [modErrores,  setModErrores]  = useState({})
  const [guardandoUsu,setGuardandoUsu]= useState(false)
  const [modalEliminar, setModalEliminar] = useState(null)
  const [eliminandoUsu, setEliminandoUsu] = useState(false)

  /* selector de usuario por módulo */
  const [selectorModulo, setSelectorModulo] = useState({ open:false, modulo:null, buscar:'' })
  const [mediaVenta, setMediaVenta] = useState(null)
  const [ventaReasignar, setVentaReasignar] = useState(null)
  const [ventaHistorial, setVentaHistorial] = useState(null)
  const [ventaEditar, setVentaEditar] = useState(null)

  /* charts */
  const canvasEstados = useRef(null)
  const canvasSalas   = useRef(null)
  const canvasDiario  = useRef(null)
  const chartInst     = useRef({})

  /* toast */
  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3200)
  }

  function agregarLog(accion, detalle = '') {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, fecha: fechaHoy(), hora: horaAhora(), usuario: usuarioNombre, accion, detalle, color: '#7C3AED' }
    setLogs(prev => {
      const next = [entry, ...prev].slice(0, 200)
      try { localStorage.setItem('jef_logs', JSON.stringify(next.slice(0, 100))) } catch {}
      return next
    })
  }

  /* ── carga de datos ── */
  const cargarUsuarios = useCallback(async () => {
    setUsuariosCarga({ cargando:true, error:'' })
    try {
      const res  = await fetch(`${API}/usuarios`, { headers: ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        sessionStorage.removeItem('nc_token')
        sessionStorage.removeItem('nc_usuario')
        window.location.replace('/login')
        return
      }
      if (!res.ok || !data.ok) {
        setUsuariosCarga({ cargando:false, error:data.mensaje || 'No se pudo cargar la lista de usuarios.' })
        return
      }
      setUsuarios(Array.isArray(data.data) ? data.data : [])
      setUsuariosCarga({ cargando:false, error:'' })
    } catch {
      setUsuariosCarga({ cargando:false, error:'No fue posible conectar con la API. Los usuarios no han sido eliminados.' })
    }
  }, [])

  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentasCache = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok) {
        if (!responseChanged(firmaVentasRef, data.data)) return
        setVentasCache(data.data.map(v => ({ ...v, _fecha: (v.created_at || '').split(' ')[0] })))
      }
    } catch { console.error('Error cargando ventas') }
    finally { cargandoVentasRef.current = false }
  }, [])

  const ESTADOS_CAMPO = FLUJO_SEGUIMIENTO
  const cargarSeguimiento = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/ventas?seguimiento_campo=1`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok) {
        setVentasSeg(data.data
          .filter(v => ESTADOS_CAMPO.has((v.estado||'').toLowerCase().trim()))
          .map(v => ({ ...v, _seg: mapSeg(v.estado)||(v.estado||'').toLowerCase(), _fecha: (v.created_at||'').split(' ')[0] }))
        )
      }
    } catch { console.error('Error seguimiento') }
  }, [])

  const cargarReclutados = useCallback(async () => {
    setCargandoReclutados(true)
    try {
      const res = await fetch(`${API}/ventas-reclutamiento`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      setReclutados(res.ok && data.ok && Array.isArray(data.data) ? data.data : [])
    } catch {
      setReclutados([])
    } finally {
      setCargandoReclutados(false)
    }
  }, [])

  const cargarEliminaciones = useCallback(async () => {
    setCargandoEliminaciones(true)
    try {
      const res = await fetch(`${API}/eliminaciones`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      setEliminaciones(res.ok && data.ok && Array.isArray(data.data) ? data.data : [])
    } catch {
      setEliminaciones([])
    } finally {
      setCargandoEliminaciones(false)
    }
  }, [])

  const cargarMarketing = useCallback(async (filtros = marketingFiltros) => {
    setMarketingCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      setMarketingData(Array.isArray(data.data) ? data.data : [])
      setMarketingCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingCarga({ cargando:false, error:'' })
    } catch (error) {
      setMarketingCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingFiltros])

  async function eliminarRegistroEliminacion(item) {
    if (!item?.id || eliminacionBorrandoId !== null) return
    if (!window.confirm('¿Eliminar este registro del historial?\n\nEsta acción solo borra el registro de auditoría.')) return
    setEliminacionBorrandoId(item.id)
    try {
      const res = await fetch(`${API}/eliminaciones/${item.id}`, {
        method:'DELETE',
        headers:ncHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el registro')
      setEliminaciones(actuales => actuales.filter(registro => registro.id !== item.id))
      if (detalleEliminacion?.id === item.id) setDetalleEliminacion(null)
      mostrarToast(data.mensaje || 'Registro eliminado del historial')
    } catch (error) {
      mostrarToast(error.message || 'Error de conexión')
    } finally {
      setEliminacionBorrandoId(null)
    }
  }

  async function eliminarReclutado(postulante) {
    if (!window.confirm(`¿Eliminar definitivamente a ${postulante.nombre || 'este postulante'}?`)) return
    const res = await fetch(`${API}/ventas-reclutamiento/${postulante.id}`, {
      method:'DELETE',
      headers:ncHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      console.error(data.mensaje || 'No se pudo eliminar el postulante')
      return
    }
    setReclutados(prev => prev.filter(item => item.id !== postulante.id))
  }

  async function completarReasignacion(data) {
    const venta = ventaReasignar
    setVentaReasignar(null)
    await Promise.all([cargarSeguimiento(), cargarVentasCache()])
    agregarLog('Venta reasignada', data?.mensaje || `Venta ${venta?.id || ''}`)
  }

  async function eliminarVenta(venta) {
    const cliente = venta?.nombre || `venta ${venta?.id}`
    if (!window.confirm(`¿Eliminar definitivamente la venta de ${cliente}? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`${API}/ventas/${venta.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar la venta.')
      setVentasSeg(prev => prev.filter(item => item.id !== venta.id))
      setVentasCache(prev => prev.filter(item => item.id !== venta.id))
      agregarLog('Venta eliminada', `${cliente} · DNI ${venta?.dni || '—'}`)
    } catch (error) {
      mostrarToast(error.message || 'Error de conexión')
    }
  }

  /* mount */
  useEffect(() => {
    cargarUsuarios()
    cargarVentasCache()
    agregarLog('Sesión iniciada', 'Panel de Jefatura')
    const iv = setVisibleInterval(cargarVentasCache, 5000)
    return () => clearVisibleInterval(iv)
  }, [cargarUsuarios, cargarVentasCache])

  useEffect(() => {
    if (seccion === 'seguimiento') cargarSeguimiento()
    if (seccion === 'reclutados-generales') cargarReclutados()
    if (seccion === 'eliminaciones') cargarEliminaciones()
    if (seccion === 'marketing-leads') cargarMarketing()
  }, [seccion, cargarSeguimiento, cargarReclutados, cargarEliminaciones, cargarMarketing])

  /* charts — siempre en DOM; solo recrear cuando estamos en dashboard */
  useEffect(() => {
    if (seccion !== 'dashboard') return

    function destroy(key) {
      if (chartInst.current[key]) { try { chartInst.current[key].destroy() } catch {} delete chartInst.current[key] }
    }

    /* Chart 1 — doughnut estados */
    if (canvasEstados.current) {
      destroy('estados')
      const e  = s => (s || '').toLowerCase()
      const estados = [
        { label:'Validadas',       val: ventasCache.filter(v=>!['venta','','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length, color:'#7C3AED' },
        { label:'No validadas',    val: ventasCache.filter(v=>['venta','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length,        color:'#f97316' },
        { label:'Grabadas',        val: ventasCache.filter(flujoGrabada).length,   color:'#d97706' },
        { label:'No grabadas',     val: ventasCache.filter(flujoNoGrabada).length, color:'#9ca3af' },
        { label:'No programadas',  val: ventasCache.filter(v=>['bloqueado','sin_agenda','caracter_especial','fraude','zona_restringida'].includes(e(v.estado))).length, color:'#6366f1' },
        { label:'Instaladas',      val: ventasCache.filter(v=>esVentaInstalada(v.estado)).length, color:'#16a34a' },
        { label:'Caídas',          val: ventasCache.filter(v=>e(v.estado)==='caida').length,     color:'#ea580c' },
        { label:'Rechazos',        val: ventasCache.filter(v=>e(v.estado)==='rechazo_campo').length, color:'#f97316' },
      ].filter(x => x.val > 0)
      if (estados.length) {
        chartInst.current.estados = new Chart(canvasEstados.current, {
          type: 'doughnut',
          data: { labels: estados.map(x=>x.label), datasets: [{ data: estados.map(x=>x.val), backgroundColor: estados.map(x=>x.color), borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
          options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{position:'right',labels:{font:{size:11},boxWidth:12,padding:10}}, tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw}`}} } }
        })
      }
    }

    /* Chart 2 — bar salas */
    if (canvasSalas.current) {
      destroy('salas')
      const mesUsar   = mesReporte || mesActual()
      const ventasMes = ventasCache.filter(v => v._fecha && v._fecha.startsWith(mesUsar))
      const salas     = SALAS
      const instaladas = salas.map(s => {
        const nombres = usuarios.filter(u=>u.sala===s).map(u=>u.nombre)
        return ventasMes.filter(v=>nombres.includes(v.asesor_nombre||'')&&esVentaInstalada(v.estado)).length
      })
      const caidas = salas.map(s => {
        const nombres = usuarios.filter(u=>u.sala===s).map(u=>u.nombre)
        return ventasMes.filter(v=>nombres.includes(v.asesor_nombre||'')&&(v.estado||'').toLowerCase()==='caida').length
      })
      chartInst.current.salas = new Chart(canvasSalas.current, {
        type: 'bar',
        data: { labels:salas, datasets:[
          { label:'Instaladas', data:instaladas, backgroundColor:'#fb923c', borderRadius:6 },
          { label:'Caídas',     data:caidas,     backgroundColor:'#7c2d12', borderRadius:6 },
        ]},
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#f3f4f6'}},x:{grid:{display:false}}} }
      })
    }

    /* Chart 3 — line diario */
    if (canvasDiario.current) {
      destroy('diario')
      const dias = []
      for (let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); dias.push(d.toISOString().split('T')[0]) }
      const salas  = SALAS
      const colors = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#06b6d4','#f43f5e']
      const datasets = salas.map((s,i) => {
        const nombres = usuarios.filter(u=>u.sala===s).map(u=>u.nombre)
        return { label:s, data:dias.map(d=>ventasCache.filter(v=>v._fecha===d&&nombres.includes(v.asesor_nombre||'')).length), borderColor:colors[i], backgroundColor:colors[i]+'22', fill:true, tension:.4, borderWidth:2, pointRadius:4 }
      })
      chartInst.current.diario = new Chart(canvasDiario.current, {
        type: 'line',
        data: { labels:dias.map(d=>{const p=d.split('-');return `${p[2]}/${p[1]}`}), datasets },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#f3f4f6'}},x:{grid:{display:false}}} }
      })
    }

    return () => { destroy('estados'); destroy('salas'); destroy('diario') }
  }, [seccion, ventasCache, usuarios, mesReporte])

  /* ── navegación ── */
  function irSeccion(id) {
    setSeccion(id)
    setMenuMovilAbierto(false)
    try { sessionStorage.setItem(JEF_APARTADO_KEY, id) } catch {}
  }

  /* ── KPIs dashboard ── */
  const kpis = useMemo(() => {
    const e   = s => (s||'').toLowerCase()
    const hoy = fechaHoy(), mes = mesActual()
    const inst  = ventasCache.filter(v=>esVentaInstalada(v.estado)).length
    const caida = ventasCache.filter(v=>['caida','rechazo_campo'].includes(e(v.estado))).length
    const instM = ventasCache.filter(v=>v._fecha&&v._fecha.startsWith(mes)&&esVentaInstalada(v.estado)).length
    const caidM = ventasCache.filter(v=>v._fecha&&v._fecha.startsWith(mes)&&['caida','rechazo_campo'].includes(e(v.estado))).length
    const efect = (instM+caidM)>0?Math.round(instM/(instM+caidM)*100):0
    return {
      ventasHoy:     ventasCache.filter(v=>v._fecha===hoy).length,
      validadas:     ventasCache.filter(v=>!['venta',''].includes(e(v.estado))).length,
      noValidadas:   ventasCache.filter(v=>['venta','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length,
      grabadas:      ventasCache.filter(flujoGrabada).length,
      noGrabadas:    ventasCache.filter(flujoNoGrabada).length,
      enEjecucion:   ventasCache.filter(v=>['aprobado','programado','en_ejecucion','tecnico_casa'].includes(e(v.estado))).length,
      noProgramadas: ventasCache.filter(v=>['bloqueado','sin_agenda','caracter_especial','fraude','zona_restringida'].includes(e(v.estado))).length,
      instaladas:    inst,
      caidas:        caida,
      conv:          efect+'%',
      totalUs:       usuarios.length,
      activos:       usuarios.filter(u=>u.activo).length,
      asesores:      usuarios.filter(u=>usuarioTieneCargo(u,'asesor')&&u.activo).length,
      supervisores:  usuarios.filter(u=>usuarioTieneCargo(u,'supervisor')&&u.activo).length,
    }
  }, [ventasCache, usuarios])

  const resumenMarketing = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, tipificaciones:[] }
      actual.total += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => b.total-a.total || a.campana.localeCompare(b.campana,'es'))
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)) }
  }, [marketingData])

  function exportarMarketingExcel() {
    descargarExcel(marketingData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-${fechaHoy()}.xlsx`)
  }

  /* ── usuarios para el selector de accesos ── */
  const usuariosModulo = useMemo(() => {
    const modulo = selectorModulo.modulo
    if (!modulo) return []
    const buscar = selectorModulo.buscar.trim().toLowerCase()
    return usuarios
      .filter(u => usuarioTieneCargo(u, modulo.cargo))
      .filter(u => !buscar || [u.nombre, u.usuario, u.sala].some(v => String(v || '').toLowerCase().includes(buscar)))
      .sort((a, b) => Number(Boolean(b.activo)) - Number(Boolean(a.activo)) || String(a.nombre || '').localeCompare(String(b.nombre || '')))
  }, [usuarios, selectorModulo])

  function abrirSelectorModulo(modulo) {
    setSelectorModulo({ open:true, modulo, buscar:'' })
  }

  function cerrarSelectorModulo() {
    setSelectorModulo({ open:false, modulo:null, buscar:'' })
  }

  function entrarModulo(modulo, usuario) {
    const objetivo = {
      id: usuario.id,
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      cargo: modulo.cargo,
      cargoPrincipal: usuario.cargo,
      cargos: [usuario.cargo, ...permisosDeUsuario(usuario)],
      permisos: permisosDeUsuario(usuario),
      sala: usuario.sala || '',
      path: modulo.path,
    }
    sessionStorage.setItem('nc_jefatura_usuario_objetivo', JSON.stringify(objetivo))
    if (modulo.cargo === 'asesor') {
      sessionStorage.setItem('nc_dashboard_asesor_objetivo', JSON.stringify(objetivo))
    } else {
      sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    }
    refrescarSesion()
    agregarLog('Acceso a módulo', `${modulo.nombre}: ${usuario.nombre}`)
    cerrarSelectorModulo()
    navigate(modulo.path)
  }

  /* ── seguimiento ── */
  const estadosSeg = useMemo(() => {
    const porClave = new Map()
    ventasSeg.forEach(v => {
      const clave = v._seg
      if (clave && !porClave.has(clave)) {
        porClave.set(clave, (SEG_BADGES[clave] || {}).label || flujoLabelEstado(v.estado))
      }
    })
    return [...porClave.entries()].sort((a, b) =>
      (SEG_ORD[a[0]] ?? 99) - (SEG_ORD[b[0]] ?? 99) || a[1].localeCompare(b[1]))
  }, [ventasSeg])

  const ventasSegFiltradas = useMemo(() => {
    let lista = filtroSeg ? ventasSeg.filter(v=>v._seg===filtroSeg) : [...ventasSeg]
    if (fsAsesor)   lista = lista.filter(v => String(v.asesor_nombre || v.vendedor || '').toLowerCase().includes(fsAsesor.trim().toLowerCase()))
    if (fsSala)     lista = lista.filter(v => String(v.sala || '').toLowerCase().includes(fsSala.trim().toLowerCase()))
    if (fsDistrito) lista = lista.filter(v => String(v.distrito || '').toLowerCase().includes(fsDistrito.trim().toLowerCase()))
    if (fsPlan)     lista = lista.filter(v => String(v.paquete || '').toLowerCase().includes(fsPlan.trim().toLowerCase()))
    if (fsDesde || fsHasta) {
      lista = lista.filter(v => {
        const f = soloFecha(v._fecha)
        if (!f) return false
        if (fsDesde && f < fsDesde) return false
        if (fsHasta && f > fsHasta) return false
        return true
      })
    }
    const b = fsBusqueda.trim().toLowerCase()
    if (b) {
      lista = lista.filter(v => [v.nombre, v.dni, v.asesor_nombre, v.vendedor, v.distrito, v.sala, v.paquete]
        .some(x => String(x || '').toLowerCase().includes(b)))
    }
    return lista.sort((a,b) => (SEG_ORD[a._seg]??5) - (SEG_ORD[b._seg]??5))
  }, [ventasSeg, filtroSeg, fsAsesor, fsSala, fsDistrito, fsPlan, fsDesde, fsHasta, fsBusqueda])

  function limpiarFiltrosSeg() {
    setFiltroSeg(''); try { sessionStorage.setItem(JEF_SEG_FILTRO_KEY, '') } catch {}
    setFsAsesor(''); setFsSala(''); setFsDistrito(''); setFsPlan('')
    setFsDesde(''); setFsHasta(''); setFsBusqueda('')
  }

  function exportarSeguimientoExcel() {
    const columnas = [
      ['ESTADO',           v => (SEG_BADGES[v._seg] || SEG_BADGES.ejecucion).label],
      ['OBS. SEGUIMIENTO', v => v.obs_seguimiento || '-'],
      ['OBS. PROGRAMACIÓN', v => `SOT: ${v.sot || '-'} | Fecha programada: ${formatF(v.fecha_programada)}`],
      ['FECHA',            v => formatF(v._fecha)],
      ['CLIENTE',          v => v.nombre || '-'],
      ['DNI',              v => v.dni || '-'],
      ['DISTRITO',         v => v.distrito || '-'],
      ['ASESOR',           v => v.asesor_nombre || '-'],
      ['SALA',             v => v.sala || '-'],
      ['PLAN',             v => v.paquete || '-'],
      ['TRAMO',            v => v.tramo_seguimiento || '-'],
      ['MOTIVO',           v => v.motivo_seguimiento || '-'],
    ]
    if (ventasSegFiltradas.some(v => v.comentario)) {
      columnas.push(['COMENTARIO', v => v.comentario || '-'])
    }
    descargarExcel(ventasSegFiltradas, columnas, `seguimiento_en_campo_${fechaHoy()}.xlsx`)
  }

  const kpisSeg = useMemo(() => ({
    ejecucion: ventasSeg.filter(v=>v._seg==='ejecucion').length,
    instalado: ventasSeg.filter(v=>v._seg==='instalado'||v._seg==='ejecutada').length,
    rechazo:   ventasSeg.filter(v=>v._seg==='rechazo').length,
    caida:     ventasSeg.filter(v=>v._seg==='caida').length,
    tecnico:   ventasSeg.filter(v=>v._seg==='tecnico').length,
  }), [ventasSeg])

  /* ── flujo general de ventas ── */
  const resumenFlujoVentas = useMemo(() => ({
    todas: ventasCache.length,
    validadas: ventasCache.filter(flujoValidada).length,
    noValidadas: ventasCache.filter(flujoNoValidada).length,
    grabadas: ventasCache.filter(flujoGrabada).length,
    noGrabadas: ventasCache.filter(flujoNoGrabada).length,
    seguimiento: ventasCache.filter(v => Boolean(estadoSeguimiento(v))).length,
  }), [ventasCache])

  const opcionesFlujo = useMemo(() => ({
    estados: opcionesUnicas(ventasCache.map(v => v.estado || v.estado_venta)),
    grabaciones: opcionesUnicas(ventasCache.map(estadoGrabacion)),
  }), [ventasCache])

  const ventasFlujoFiltradas = useMemo(() => {
    let lista = [...ventasCache]
    if (filtroFlujoVentas === 'validadas') lista = lista.filter(flujoValidada)
    if (filtroFlujoVentas === 'noValidadas') lista = lista.filter(flujoNoValidada)
    if (filtroFlujoVentas === 'grabadas') lista = lista.filter(flujoGrabada)
    if (filtroFlujoVentas === 'noGrabadas') lista = lista.filter(flujoNoGrabada)
    if (filtroFlujoVentas === 'seguimiento') {
      lista = lista.filter(v => Boolean(estadoSeguimiento(v)))
    }
    if (fvEstados.length) lista = lista.filter(v => fvEstados.includes(v.estado || v.estado_venta || ''))
    if (fvValidacion) lista = lista.filter(v => coincideFiltroValidacion(v, fvValidacion))
    if (fvGrabacion) lista = lista.filter(v => estadoGrabacion(v) === fvGrabacion)
    if (fvAsesor) lista = lista.filter(v => String(v.asesor_nombre || v.asesor || v.vendedor || '').toLowerCase().includes(fvAsesor.trim().toLowerCase()))
    if (fvSala) lista = lista.filter(v => String(v.sala || '').toLowerCase().includes(fvSala.trim().toLowerCase()))
    if (fvDistrito) lista = lista.filter(v => String(v.distrito || '').toLowerCase().includes(fvDistrito.trim().toLowerCase()))
    if (fvDesde || fvHasta) {
      lista = lista.filter(v => {
        const f = soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)
        if (!f) return false
        if (fvDesde && f < fvDesde) return false
        if (fvHasta && f > fvHasta) return false
        return true
      })
    }

    const b = busqFlujoVentas.trim().toLowerCase()
    if (b) {
      lista = lista.filter(v => [
        v.nombre, v.nombre_apellidos, v.cliente, v.dni, v.documento, v.telefono, v.n1, v.n2,
        v.asesor_nombre, v.asesor, v.vendedor, v.sala, v.estado, v.estado_venta, v.distrito
      ].some(x => String(x || '').toLowerCase().includes(b)))
    }

    return lista.sort((a, b) => {
      const fb = String(b._fecha || b.fecha_ingreso || b.fecha || b.created_at || '')
      const fa = String(a._fecha || a.fecha_ingreso || a.fecha || a.created_at || '')
      return fb.localeCompare(fa) || Number(b.id || 0) - Number(a.id || 0)
    })
  }, [ventasCache, filtroFlujoVentas, busqFlujoVentas, fvEstados, fvValidacion, fvGrabacion, fvAsesor, fvSala, fvDistrito, fvDesde, fvHasta])

  const totalPaginasFlujo = Math.max(1, Math.ceil(ventasFlujoFiltradas.length / porPaginaFlujo))
  const ventasFlujoPagina = useMemo(() => {
    const inicio = (paginaFlujo - 1) * porPaginaFlujo
    return ventasFlujoFiltradas.slice(inicio, inicio + porPaginaFlujo)
  }, [ventasFlujoFiltradas, paginaFlujo, porPaginaFlujo])

  useEffect(() => { setPaginaFlujo(1) }, [filtroFlujoVentas, busqFlujoVentas, fvEstados, fvValidacion, fvGrabacion, fvAsesor, fvSala, fvDistrito, fvDesde, fvHasta, porPaginaFlujo])
  useEffect(() => { if (paginaFlujo > totalPaginasFlujo) setPaginaFlujo(totalPaginasFlujo) }, [paginaFlujo, totalPaginasFlujo])

  function limpiarFiltrosFlujo() {
    setFiltroFlujoVentas('todas')
    setBusqFlujoVentas('')
    setFvEstados([]); setFvValidacion(''); setFvGrabacion('')
    setFvAsesor(''); setFvSala(''); setFvDistrito('')
    setFvDesde(''); setFvHasta('')
  }

  function exportarVentasExcel() {
    descargarExcel(ventasFlujoFiltradas, [
      ['FECHA SUBIDA',      v => formatF(soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at))],
      ['CLIENTE',           v => v.nombre || v.nombre_apellidos || v.cliente || '-'],
      ['DNI',               v => v.dni || v.documento || '-'],
      ['DISTRITO',          v => v.distrito || '-'],
      ['ASESOR',            v => v.asesor_nombre || v.asesor || v.vendedor || '-'],
      ['SALA',              v => v.sala || '-'],
      ['VALIDACIÓN',        v => estadoValidacion(v)],
      ['GRABACIÓN',         v => estadoGrabacion(v)],
      ['PROGRAMACIÓN',      v => estadoProg(v.estado_prog).label + (v.usuario_prog ? ` (Por: ${v.usuario_prog})` : '')],
      ['SEGUIMIENTO',       v => estadoSeguimiento(v) ? flujoLabelEstado(estadoSeguimiento(v)) : '-'],
    ], `ventas_generales_${fechaHoy()}.xlsx`)
  }

  /* ── reportes ── */
  const { reporteData, repKpis } = useMemo(() => {
    const ventasDelMes = mesReporte
      ? ventasCache.filter(v => {
          const fecha = soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)
          return fecha && String(fecha).slice(0, 7) === mesReporte
        })
      : ventasCache
    let asesFilt = usuarios.filter(u=>usuarioTieneCargo(u,'asesor'))
    if (salaReporte !== 'todas') asesFilt = asesFilt.filter(u=>u.sala===salaReporte)
    let ventasFilt = ventasDelMes
    if (salaReporte !== 'todas') {
      const nombres = asesFilt.map(a=>a.nombre)
      ventasFilt = ventasDelMes.filter(v=>nombres.includes(v.asesor_nombre||''))
    }
    const inst   = ventasFilt.filter(v=>esVentaInstalada(v.estado)).length
    const caidas = ventasFilt.filter(v=>(v.estado||'').toLowerCase()==='caida').length
    const efect  = ventasFilt.length ? Math.round(inst/ventasFilt.length*100) : 0
    const rendData = asesFilt.map(a => {
      const mis   = ventasDelMes.filter(v=>(v.asesor_nombre||'')===a.nombre)
      const inst2 = mis.filter(v=>esVentaInstalada(v.estado)).length
      const caid  = mis.filter(v=>(v.estado||'').toLowerCase()==='caida').length
      const ef    = mis.length ? Math.round(inst2/mis.length*100) : 0
      return { ...a, totalVentas:mis.length, instaladas:inst2, caidas:caid, efectividad:ef }
    }).sort((a,b)=>
      b.instaladas-a.instaladas ||
      b.efectividad-a.efectividad ||
      b.totalVentas-a.totalVentas ||
      String(a.nombre||'').localeCompare(String(b.nombre||''))
    )
    return { reporteData:rendData, repKpis:{ total:ventasFilt.length, inst, caidas, efect:efect+'%' } }
  }, [usuarios, ventasCache, salaReporte, mesReporte])

  /* ── usuarios filtrados ── */
  const salasUsuariosDisponibles = useMemo(() => {
    const set = new Set()
    usuarios.forEach(u => { if (u.sala) set.add(u.sala) })
    return Array.from(set).sort()
  }, [usuarios])

  const usuariosFiltrados = useMemo(() => {
    const b = busqUsuarios.toLowerCase()
    return usuarios.filter(u => {
      if (b && !(u.nombre||'').toLowerCase().includes(b) && !(u.usuario||'').toLowerCase().includes(b) && !(u.sala||'').toLowerCase().includes(b)) return false
      if (filtroCargoUsuarios && !usuarioTieneCargo(u, filtroCargoUsuarios)) return false
      if (filtroSalaUsuarios && u.sala !== filtroSalaUsuarios) return false
      return true
    })
  }, [usuarios, busqUsuarios, filtroCargoUsuarios, filtroSalaUsuarios])

  /* ── modal usuario ── */
  function abrirModalNuevo() {
    setEditandoId(null); setModForm(MOD_FORM_VACIO); setModErrores({}); setModalUsu(true)
  }
  function abrirModalEditar(u) {
    setEditandoId(u.id)
    const cargo2 = permisosDeUsuario(u).find(c => c !== u.cargo) || ''
    setModForm({ nombre:u.nombre||'', usuario:u.usuario||'', cargo:u.cargo||'', cargo2, sala:u.sala||'', pass:'', pass2:'' })
    setModErrores({}); setModalUsu(true)
  }
  function cerrarModalUsu() { setModalUsu(false); setEditandoId(null); setModForm(MOD_FORM_VACIO); setModErrores({}) }
  function setField(k, v) { setModForm(f=>({...f,[k]:v})); setModErrores(e=>({...e,[k]:false})) }

  async function guardarUsuario() {
    const { nombre, usuario, cargo, cargo2, sala, pass, pass2 } = modForm
    const errs = {}
    let primerError = ''
    if (!nombre.trim())              { errs.nombre = true; primerError ||= 'El nombre completo es obligatorio.' }
    if (!usuario.trim())             { errs.usuario = true; primerError ||= 'El usuario es obligatorio.' }
    if (!cargo)                      { errs.cargo  = true; primerError ||= 'Selecciona un cargo principal.' }
    if (cargo2 && cargo2 === cargo)  { errs.cargo2 = true; primerError ||= 'El cargo adicional debe ser diferente al principal.' }
    if (usuarioRequiereSala(cargo, cargo2) && !SALAS.includes(sala)) { errs.sala = true; primerError ||= 'Selecciona Sala 1 o Sala 2.' }
    if (!editandoId && !pass)        { errs.pass   = true; primerError ||= 'La contraseña es obligatoria.' }
    if (pass && pass.length < 6)     { errs.pass   = true; primerError ||= 'La contraseña debe tener al menos 6 caracteres.' }
    if (pass && pass !== pass2)      { errs.pass2  = true; primerError ||= 'Las contraseñas no coinciden.' }
    if (Object.keys(errs).length) { setModErrores(errs); mostrarToast(primerError); return }

    setGuardandoUsu(true)
    try {
      const loginNorm = usuario.trim().toLowerCase().replace(/\s+/g, '.')
      let res
      if (editandoId) {
        const body = { nombre, usuario: loginNorm, cargo, sala: usuarioRequiereSala(cargo, cargo2) ? sala : null, permisos: cargo2 ? [cargo2] : [] }
        if (pass) body.password = pass
        res = await fetch(`${API}/usuarios/${editandoId}`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify(body) })
      } else {
        res = await fetch(`${API}/usuarios`, {
          method: 'POST', headers: ncHeaders(),
          body: JSON.stringify({ nombre, usuario: loginNorm, password: pass, cargo, sala: usuarioRequiereSala(cargo, cargo2) ? sala : null, activo: true, permisos: cargo2 ? [cargo2] : [] })
        })
      }
      const ct   = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, mensaje: (await res.text()) || `Error HTTP ${res.status}` }
      if (!res.ok || !data.ok) { mostrarToast(data.mensaje || `Error ${res.status}`); return }
      agregarLog(editandoId ? 'Usuario editado' : 'Usuario creado', editandoId ? nombre : `${nombre} — ${cargo}`)
      await cargarUsuarios()
      cerrarModalUsu()
    } catch { mostrarToast('Error conectando con el servidor') }
    finally { setGuardandoUsu(false) }
  }

  async function toggleActivo(u) {
    const nuevo = !u.activo
    try {
      const res  = await fetch(`${API}/usuarios/${u.id}/estado`,{method:'PATCH',headers:ncHeaders(),body:JSON.stringify({activo:nuevo})})
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje); return }
      setUsuarios(list=>list.map(x=>x.id===u.id?{...x,activo:nuevo}:x))
      agregarLog(nuevo?'Activado':'Desactivado', u.nombre)
    } catch { mostrarToast('Error') }
  }

  async function desbloquearUsuario(u) {
    if (!u?.id) return
    try {
      const res = await fetch(`${API}/usuarios/${u.id}/desbloquear-login`, { method:'PATCH', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { mostrarToast(data.mensaje || 'No se pudo desbloquear'); return }
      mostrarToast(data.mensaje || `${u.nombre} fue desbloqueado`)
      agregarLog('Usuario desbloqueado', u.nombre)
    } catch { mostrarToast('Error conectando con el servidor') }
  }

  async function confirmarEliminarUsuario() {
    if (!modalEliminar || eliminandoUsu) return
    if (modalEliminar.cargo === 'jefatura') {
      const jefActivas = usuarios.filter(u => usuarioTieneCargo(u, 'jefatura') && u.activo)
      if (jefActivas.length <= 1) {
        mostrarToast('No puedes eliminar el último usuario de Jefatura')
        return
      }
    }
    setEliminandoUsu(true)
    try {
      const res = await fetch(`${API}/usuarios/${modalEliminar.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje||'No se pudo eliminar'); setEliminandoUsu(false); return }
      agregarLog('Usuario eliminado', modalEliminar.nombre)
      setModalEliminar(null)
      await cargarUsuarios()
    } catch {
      mostrarToast('Error conectando con el servidor')
    } finally {
      setEliminandoUsu(false)
    }
  }

  function limpiarLogs() {
    if (!window.confirm('¿Limpiar logs?')) return
    setLogs([])
    try { localStorage.removeItem('jef_logs') } catch {}
  }

  /* ── meses para select ── */
  const MESES_SALAS = useMemo(() => {
    const arr = [{ value:'', label:'Mes actual' }]
    for (let i=1;i<=11;i++) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      arr.push({ value:d.toISOString().slice(0,7), label:d.toLocaleString('es-PE',{month:'long',year:'numeric'}) })
    }
    return arr
  }, [])

  function salir() { logout(); navigate('/login') }

  /* ═══════════════════════════════════
     RENDER
  ═══════════════════════════════════ */
  return (
    <div className="jef-root">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuMovilAbierto}
            aria-controls="jefatura-sidebar"
            onClick={() => setMenuMovilAbierto(abierto => !abierto)}
          >
            <span></span><span></span><span></span>
          </button>
          <div className="brand">
          <div className="logo-circle"><img src="/assets/logo3.png" alt="NC" onError={e=>{e.target.parentNode.textContent='NC'}} /></div>
          <div className="brand-text">
            <span style={{fontSize:22,fontWeight:800,letterSpacing:"0.08em",lineHeight:1}}>PRIZMA</span>
            <span className="brand-sub">Panel de Jefatura</span>
          </div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-badge">JEFATURA</span>
          <span className="topbar-user">{usuarioNombre}</span>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="app-layout">
        {/* SIDEBAR */}
        <aside id="jefatura-sidebar" className={`sidebar${menuMovilAbierto ? ' open' : ''}`}>
          <div className="sidebar-sep">General</div>
          <button className={`nav-btn${seccion==='dashboard'?'   active':''}`} onClick={()=>irSeccion('dashboard')}><span className="nav-dot"></span> Dashboard</button>
          <button className={`nav-btn${seccion==='accesos'?'     active':''}`} onClick={()=>irSeccion('accesos')}><span className="nav-dot"></span> Accesos directos</button>
          <div className="sidebar-sep">Operaciones</div>
          <button className={`nav-btn${seccion==='marketing-leads'?' active':''}`} onClick={()=>irSeccion('marketing-leads')}><span className="nav-dot"></span> Marketing · Leads</button>
          <button className={`nav-btn${seccion==='ventas-flujo'?' active':''}`} onClick={()=>irSeccion('ventas-flujo')}><span className="nav-dot"></span> Ventas generales</button>
          <button className={`nav-btn${seccion==='seguimiento'?' active':''}`} onClick={()=>irSeccion('seguimiento')}><span className="nav-dot"></span> Seguimiento en campo</button>
          <button className={`nav-btn${seccion==='reclutados-generales'?' active':''}`} onClick={()=>irSeccion('reclutados-generales')}><span className="nav-dot"></span> Reclutados generales</button>
          <div className="sidebar-sep">Gestión</div>
          <button className={`nav-btn${seccion==='usuarios'?'   active':''}`} onClick={()=>irSeccion('usuarios')}><span className="nav-dot"></span> Usuarios</button>
          <button className={`nav-btn${seccion==='reportes'?'   active':''}`} onClick={()=>irSeccion('reportes')}><span className="nav-dot"></span> Reportes</button>
          <div className="sidebar-sep">Sistema</div>
          <button className={`nav-btn${seccion==='logs'?'       active':''}`} onClick={()=>irSeccion('logs')}><span className="nav-dot"></span> Logs de actividad</button>
          <button className={`nav-btn${seccion==='eliminaciones'?' active':''}`} onClick={()=>irSeccion('eliminaciones')}><span className="nav-dot"></span> Eliminaciones generales</button>
        </aside>

        {menuMovilAbierto && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Cerrar menú"
            onClick={() => setMenuMovilAbierto(false)}
          />
        )}

        <main className="main" ref={mainRef}>

          {/* ===== DASHBOARD ===== */}
          <section className={`section${seccion==='dashboard'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Dashboard General</h2><p>Resumen global del sistema</p></div>
            </div>

            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))'}}>
              <div className="kpi-card k-blue">  <div className="kpi-num">{kpis.ventasHoy}</div>     <div className="kpi-label">Ventas hoy</div>         <div className="kpi-sub">del día</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{kpis.validadas}</div>     <div className="kpi-label">Validadas</div>          <div className="kpi-sub">pasaron validación</div></div>
              <div className="kpi-card k-red">   <div className="kpi-num">{kpis.noValidadas}</div>   <div className="kpi-label">No validadas</div>       <div className="kpi-sub">rechazadas val.</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">{kpis.grabadas}</div>      <div className="kpi-label">Grabadas</div>           <div className="kpi-sub">con audio</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{kpis.noGrabadas}</div>    <div className="kpi-label">No grabadas</div>        <div className="kpi-sub">esperando audio</div></div>
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpis.enEjecucion}</div>   <div className="kpi-label">En ejecución</div>       <div className="kpi-sub">programadas</div></div>
              <div className="kpi-card" style={{borderTopColor:'#c2825f'}}><div className="kpi-num">{kpis.noProgramadas}</div><div className="kpi-label">No programadas</div><div className="kpi-sub">esperando prog.</div></div>
              <div className="kpi-card k-green"> <div className="kpi-num">{kpis.instaladas}</div>    <div className="kpi-label">Instaladas</div>         <div className="kpi-sub">completadas</div></div>
              <div className="kpi-card k-red">   <div className="kpi-num">{kpis.caidas}</div>        <div className="kpi-label">Caídas + Rechazos</div>  <div className="kpi-sub">fallidas</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{kpis.conv}</div>          <div className="kpi-label">Efectividad mes</div>    <div className="kpi-sub">inst / (inst+caídas)</div></div>
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpis.totalUs}</div>       <div className="kpi-label">Usuarios</div>           <div className="kpi-sub">registrados</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{kpis.activos}</div>       <div className="kpi-label">Activos</div>            <div className="kpi-sub">en el sistema</div></div>
              <div className="kpi-card k-blue">  <div className="kpi-num">{kpis.asesores}</div>      <div className="kpi-label">Asesores</div>           <div className="kpi-sub">activos</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">{kpis.supervisores}</div>  <div className="kpi-label">Supervisores</div>       <div className="kpi-sub">activos</div></div>
            </div>
            <div className="charts-grid">
              <div className="chart-card">
                <div className="chart-title">Ventas por estado</div>
                <div className="chart-wrap"><canvas ref={canvasEstados}></canvas></div>
              </div>
              <div className="chart-card">
                <div className="chart-title-row">
                  <span>Instaladas y Caídas por sala</span>
                  <select value={mesReporte} onChange={e=>setMesReporte(e.target.value)}
                    style={{padding:'4px 8px',border:'1px solid #e5e7eb',borderRadius:'7px',fontSize:'11px',fontFamily:'inherit',outline:'none',color:'#374151',cursor:'pointer'}}>
                    {MESES_SALAS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="chart-wrap"><canvas ref={canvasSalas}></canvas></div>
              </div>
              <div className="chart-card full">
                <div className="chart-title-row">
                  <span>Ventas diarias por sala — últimos 7 días</span>
                  <span style={{fontSize:'11px',color:'#9ca3af'}}>Se actualiza cada 60 seg.</span>
                </div>
                <div className="chart-wrap"><canvas ref={canvasDiario}></canvas></div>
              </div>
            </div>
          </section>

          {/* ===== ACCESOS ===== */}
          <section className={`section${seccion==='accesos'?' active':''}`}>
            <div className="sec-header"><div><h2>Accesos Directos</h2><p>Navega a cualquier módulo del sistema</p></div></div>
            <div className="accesos-grid">
              {ACCESOS_MODS.map(m => {
                const cantidad = usuarios.filter(u=>usuarioTieneCargo(u,m.cargo)).length
                return (
                  <button
                    key={m.path}
                    type="button"
                    className="acceso-card"
                    style={{'--mod-color':m.color,'--mod-soft':m.color+'12'}}
                    onClick={()=>abrirSelectorModulo(m)}
                  >
                    <div className="acceso-card-head">
                      <div className="acceso-icon"><ModuloIcon tipo={m.icon} size={24}/></div>
                      <span className="acceso-conteo">{cantidad} {cantidad===1?'usuario':'usuarios'}</span>
                    </div>
                    <div className="acceso-card-body">
                      <div className="acceso-nombre">{m.nombre}</div>
                      <div className="acceso-desc">{m.desc}</div>
                    </div>
                    <div className="acceso-card-foot">
                      <span>Seleccionar usuario</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ===== SEGUIMIENTO ===== */}
          <section className={`section${seccion==='seguimiento'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Seguimiento en campo</h2><p>Estado actual de todas las ventas — se actualiza automáticamente</p></div>
              <button className="btn-nuevo" style={{background:'#ea580c'}} onClick={cargarSeguimiento}>↻ Actualizar</button>
            </div>
            <div className="kpi-grid seguimiento-kpi-grid">
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpisSeg.ejecucion}</div><div className="kpi-label">En ejecución</div></div>
              <div className="kpi-card k-green">  <div className="kpi-num">{kpisSeg.instalado}</div><div className="kpi-label">Instalados</div></div>
              <div className="kpi-card k-orange"> <div className="kpi-num">{kpisSeg.rechazo}</div>  <div className="kpi-label">Rechazo en campo</div></div>
              <div className="kpi-card k-red">    <div className="kpi-num">{kpisSeg.caida}</div>    <div className="kpi-label">Caídas</div></div>
              <div className="kpi-card k-purple"> <div className="kpi-num">{kpisSeg.tecnico}</div>  <div className="kpi-label">Técnicos en casa</div></div>
              <button type="button" className="kpi-card k-green export-kpi-card" onClick={exportarSeguimientoExcel}>
                <span className="export-kpi-icon" aria-hidden="true">⇩</span>
                <span className="kpi-label">Exportar Excel</span>
              </button>
            </div>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
              {[['','Todos'], ...estadosSeg].map(([id, label]) => (
                <button key={id || 'todos'}
                  className={`seg-tab${filtroSeg===id?' active':''}`}
                  style={filtroSeg===id && SEG_BADGES[id] ? { background:SEG_BADGES[id].bg, color:SEG_BADGES[id].color, borderColor:SEG_BADGES[id].border } : undefined}
                  onClick={() => { setFiltroSeg(id); try{sessionStorage.setItem(JEF_SEG_FILTRO_KEY,id)}catch{} }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtros avanzados</div>
              <div className="filtros-grid">
                <label><span>Asesor</span><input value={fsAsesor} onChange={e=>setFsAsesor(e.target.value)} placeholder="Escribir asesor..."/></label>
                <label><span>Sala</span><input value={fsSala} onChange={e=>setFsSala(e.target.value)} placeholder="Escribir sala..."/></label>
                <label><span>Distrito</span><input value={fsDistrito} onChange={e=>setFsDistrito(e.target.value)} placeholder="Escribir distrito..."/></label>
                <label><span>Plan</span><input value={fsPlan} onChange={e=>setFsPlan(e.target.value)} placeholder="Escribir plan..."/></label>
                <label><span>Fecha desde</span><input type="date" value={fsDesde} onChange={e=>setFsDesde(e.target.value)}/></label>
                <label><span>Fecha hasta</span><input type="date" value={fsHasta} onChange={e=>setFsHasta(e.target.value)}/></label>
                <label className="filtro-busqueda"><span>Búsqueda general</span><input value={fsBusqueda} onChange={e=>setFsBusqueda(e.target.value)} placeholder="Cliente, DNI, asesor, distrito, sala, plan"/></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={limpiarFiltrosSeg}>Limpiar</button>
              </div>
            </div>
            <div className="tabla-wrap usuarios-pro-card">
              <div className="tabla-header">
                <span className="tabla-title">Ventas en seguimiento</span>
                <span className="tabla-count">{ventasSegFiltradas.length} registros</span>
              </div>
              <div className="flujo-tabla-scroll">
                <table className="tabla seguimiento-tabla">
                  <colgroup>
                    <col style={{width:'145px'}} />
                    <col style={{width:'240px'}} />
                    <col style={{width:'200px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'160px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'120px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'90px'}} />
                    <col style={{width:'180px'}} />
                    <col style={{width:'330px'}} />
                  </colgroup>
                  <thead><tr>
                    <th>Estado</th><th>Obs. Seguimiento</th><th>Obs. Programación</th><th>Fecha</th><th>Cliente</th><th>DNI</th>
                    <th>Distrito</th><th>Asesor</th><th>Sala</th><th>Plan</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {ventasSegFiltradas.length === 0
                      ? <tr><td colSpan="11" className="tabla-empty">Sin registros.</td></tr>
                      : ventasSegFiltradas.map((v, i) => {
                          const b = SEG_BADGES[v._seg] || SEG_BADGES.ejecucion
                          return (
                            <tr key={v.id != null ? `seg-${v.id}` : `seg-i-${i}`}>
                              <td><span style={{display:'inline-block',padding:'4px 12px',borderRadius:'99px',fontSize:'10px',fontWeight:700,letterSpacing:'.3px',background:b.bg,color:b.color,border:`1px solid ${b.border}`,whiteSpace:'nowrap'}}>{b.label}</span></td>
                              <td><ObsSeguimientoCell tramo={v.tramo_seguimiento} comentario={v.obs_seguimiento} motivo={v.motivo_seguimiento} /></td>
                              <td><ProgramacionInfoCell sot={v.sot} fecha={v.fecha_programada} /></td>
                              <td style={{fontSize:'11px',color:'#185FA5',fontWeight:700,whiteSpace:'nowrap'}}>{formatF(v._fecha)}</td>
                              <td style={{fontWeight:600,fontSize:'12px'}}>{v.nombre||'—'}</td>
                              <td style={{fontFamily:'monospace',fontSize:'11px'}}>{v.dni||'—'}</td>
                              <td style={{fontSize:'11px'}}>{v.distrito||'—'}</td>
                              <td style={{fontWeight:600,color:'#7C3AED',fontSize:'11px'}}>{v.asesor_nombre||'—'}</td>
                              <td style={{fontSize:'11px',color:'#9ca3af'}}>{v.sala||'—'}</td>
                              <td style={{fontSize:'10px',maxWidth:'120px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.paquete||'—'}</td>
                              <td style={{minWidth:'310px'}}>
                                <div className="venta-actions">
                                  <button type="button" className="venta-action-btn" onClick={()=>setMediaVenta(v)}>Archivos</button>
                                  <button type="button" className="venta-action-btn" onClick={()=>setVentaEditar(v)}>Editar</button>
                                  <button type="button" className="venta-action-btn reassign" onClick={()=>setVentaReasignar(v)}>Reasignar</button>
                                  <button type="button" className="venta-action-btn" onClick={()=>setVentaHistorial(v)}>Historial</button>
                                  <button type="button" className="venta-action-btn delete" onClick={()=>eliminarVenta(v)}>Eliminar</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DASHBOARD DE LEADS PARA MARKETING (SOLO JEFATURA) ===== */}
          <section className={`section${seccion==='marketing-leads'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Dashboard de Leads por Campaña</h2><p>Información de altas y resultados para el área de Marketing</p></div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn-nuevo" style={{background:'#ea580c'}} onClick={exportarMarketingExcel} disabled={!marketingData.length}>Exportar Excel</button>
                <button className="btn-nuevo" onClick={()=>cargarMarketing(marketingFiltros)}>Actualizar</button>
              </div>
            </div>

            <div className="filtros-avanzados marketing-filtros">
              <div className="filtros-titulo">Filtros del reporte</div>
              <div className="filtros-grid">
                <label><span>Fecha desde</span><input type="date" value={marketingFiltros.desde} onChange={e=>setMarketingFiltros(p=>({...p,desde:e.target.value}))}/></label>
                <label><span>Fecha hasta</span><input type="date" value={marketingFiltros.hasta} onChange={e=>setMarketingFiltros(p=>({...p,hasta:e.target.value}))}/></label>
                <label><span>Campaña</span><select value={marketingFiltros.campana} onChange={e=>setMarketingFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <label><span>Tipificación</span><select value={marketingFiltros.tipificacion} onChange={e=>setMarketingFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{marketingCatalogos.tipificaciones.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
              </div>
            </div>

            {marketingCarga.error && <div className="marketing-error">{marketingCarga.error}</div>}
            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketing.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketing.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketing.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketing.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row"><span>Volumen de leads por campaña</span>{marketingCarga.cargando&&<small>Actualizando…</small>}</div>
                <div className="marketing-barras">
                  {resumenMarketing.campanas.length===0 && !marketingCarga.cargando
                    ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
                    : resumenMarketing.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                        <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketing.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Detalle para Marketing</span><span className="tabla-count">{marketingData.length} grupos</span></div>
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Tipificación</th><th>Leads</th><th>Primera alta</th><th>Última alta</th></tr></thead>
                  <tbody>{marketingData.length===0
                    ? <tr><td colSpan="5" className="tabla-empty">{marketingCarga.cargando?'Cargando información…':'Sin resultados.'}</td></tr>
                    : marketingData.map((f,i)=><tr key={`${f.campana}-${f.tipificacion}-${i}`}><td><strong>{f.campana}</strong></td><td><span className="marketing-tipif">{f.tipificacion}</span></td><td><strong>{f.cantidad}</strong></td><td>{f.primera_alta?new Date(f.primera_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td><td>{f.ultima_alta?new Date(f.ultima_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td></tr>)}</tbody>
                </table></div>
              </div>
            </div>
          </section>

          {/* ===== VENTAS GENERALES ===== */}
          <section className={`section${seccion==='ventas-flujo'?' active':''}`}>
            <div className="sec-header">
              <div>
                <h2>Ventas generales</h2>
              </div>
              <button className="btn-nuevo" onClick={cargarVentasCache}>Actualizar</button>
            </div>

            <div className="flujo-kpi-grid">
              {[
                { id:'todas', label:'Ventas generales', value:resumenFlujoVentas.todas, cls:'k-magenta' },
                { id:'validadas', label:'Validadas', value:resumenFlujoVentas.validadas, cls:'k-yellow' },
                { id:'noValidadas', label:'No validadas', value:resumenFlujoVentas.noValidadas, cls:'k-red' },
                { id:'grabadas', label:'Grabadas', value:resumenFlujoVentas.grabadas, cls:'k-green' },
                { id:'noGrabadas', label:'No grabadas', value:resumenFlujoVentas.noGrabadas, cls:'k-blue' },
                { id:'seguimiento', label:'En seguimiento', value:resumenFlujoVentas.seguimiento, cls:'k-purple' },
              ].map(card => (
                <button
                  type="button"
                  key={card.id}
                  className={`kpi-card flujo-kpi ${card.cls} ${filtroFlujoVentas===card.id?'active':''}`}
                  onClick={()=>setFiltroFlujoVentas(card.id)}
                >
                  <div className="kpi-num">{card.value}</div>
                  <div className="kpi-label">{card.label}</div>
                </button>
              ))}
              <button type="button" className="kpi-card flujo-kpi k-green export-kpi-card" onClick={exportarVentasExcel}>
                <span className="export-kpi-icon" aria-hidden="true">⇩</span>
                <span className="kpi-label">Exportar Excel</span>
              </button>
            </div>

            <div className="flujo-panel">
              <div>
                <h3>Vista completa del flujo</h3>
              </div>
              <input
                className="tabla-search flujo-search"
                value={busqFlujoVentas}
                onChange={e=>setBusqFlujoVentas(e.target.value)}
                placeholder="Buscar cliente, DNI, asesor, sala..."
              />
            </div>
            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtros avanzados</div>
              <div className="filtros-grid filtros-grid-ventas">
                <label><span>Estado actual</span><FiltroEstadoMultiple opciones={opcionesFlujo.estados} seleccionados={fvEstados} onChange={setFvEstados} /></label>
                <label><span>Validación</span><select value={fvValidacion} onChange={e=>setFvValidacion(e.target.value)}><option value="">TODAS</option><option value="validado">VALIDADO</option><option value="no_validado">NO VALIDADO</option><option value="ventas">VENTAS</option></select></label>
                <label><span>Grabación</span><select value={fvGrabacion} onChange={e=>setFvGrabacion(e.target.value)}><option value="">TODAS</option>{opcionesFlujo.grabaciones.map(x=><option key={x} value={x}>{textoFiltroMayuscula(x)}</option>)}</select></label>
                <label><span>Asesor</span><input value={fvAsesor} onChange={e=>setFvAsesor(e.target.value)} placeholder="Escribir asesor..."/></label>
                <label><span>Sala</span><input value={fvSala} onChange={e=>setFvSala(e.target.value)} placeholder="Escribir sala..."/></label>
                <label><span>Distrito</span><input value={fvDistrito} onChange={e=>setFvDistrito(e.target.value)} placeholder="Escribir distrito..."/></label>
                <label><span>Fecha desde</span><input type="date" value={fvDesde} onChange={e=>setFvDesde(e.target.value)}/></label>
                <label><span>Fecha hasta</span><input type="date" value={fvHasta} onChange={e=>setFvHasta(e.target.value)}/></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={limpiarFiltrosFlujo}>Limpiar</button>
              </div>
            </div>

            <div className="tabla-wrap usuarios-pro-card flujo-tabla">
              <div className="tabla-header">
                <div className="tabla-header-left">
                  <span className="tabla-title">Ventas desde carga del asesor</span>
                  <span className="tabla-count">{ventasFlujoFiltradas.length} registros</span>
                </div>
                <button
                  type="button"
                  className="flujo-clear"
                  onClick={limpiarFiltrosFlujo}
                >
                  Limpiar filtros
                </button>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha subida</th>
                      <th>Cliente</th>
                      <th>DNI</th>
                      <th>Asesor</th>
                      <th>Sala</th>
                      <th>Validación</th>
                      <th>Grabación</th>
                      <th>Seguimiento</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasFlujoFiltradas.length === 0 ? (
                      <tr><td colSpan="10" className="tabla-empty">No hay ventas registradas.</td></tr>
                    ) : ventasFlujoPagina.map((v, i) => {
                      const estado = normEstado(v.estado || v.estado_venta)
                      const estadoSeg = estadoSeguimiento(v)
                      return (
                        <tr key={v.id || `${v.dni || v.documento || 'venta'}-${i}`}>
                          <td>{(paginaFlujo - 1) * porPaginaFlujo + i + 1}</td>
                          <td>{formatF(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)}</td>
                          <td className="flujo-cliente">{v.nombre || v.nombre_apellidos || v.cliente || '—'}</td>
                          <td>{v.dni || v.documento || '—'}</td>
                          <td>{String(v.asesor_nombre || v.asesor || v.vendedor || '—').toLocaleUpperCase('es-PE')}</td>
                          <td>{v.sala || '—'}</td>
                          <td><span className={flujoValidada(v) ? 'flujo-ok' : 'flujo-warn'}>{estadoValidacion(v)}</span></td>
                          <td><span className={flujoGrabada(v) ? 'flujo-ok' : 'flujo-warn'}>{estadoGrabacion(v)}</span></td>
                          <td>{estadoSeg ? <span className="flujo-info">{flujoLabelEstado(estadoSeg)}</span> : '—'}</td>
                          <td>
                            <div className="venta-actions">
                              <button type="button" className="venta-action-btn" onClick={()=>setMediaVenta(v)}>Archivos</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaEditar(v)}>Editar</button>
                              <button type="button" className="venta-action-btn reassign" onClick={()=>setVentaReasignar(v)}>Reasignar</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaHistorial(v)}>Historial</button>
                              <button type="button" className="venta-action-btn delete" onClick={()=>eliminarVenta(v)}>Eliminar</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flujo-paginacion">
                <span>Mostrando {ventasFlujoFiltradas.length ? (paginaFlujo - 1) * porPaginaFlujo + 1 : 0}–{Math.min(paginaFlujo * porPaginaFlujo, ventasFlujoFiltradas.length)} de {ventasFlujoFiltradas.length}</span>
                <div>
                  <select value={porPaginaFlujo} onChange={e=>setPorPaginaFlujo(Number(e.target.value))} aria-label="Registros por página">
                    {[18,25,50,100].map(n=><option key={n} value={n}>{n} / pág.</option>)}
                  </select>
                  <button type="button" onClick={()=>setPaginaFlujo(p=>Math.max(1,p-1))} disabled={paginaFlujo<=1}>‹</button>
                  <strong>Página {paginaFlujo} de {totalPaginasFlujo}</strong>
                  <button type="button" onClick={()=>setPaginaFlujo(p=>Math.min(totalPaginasFlujo,p+1))} disabled={paginaFlujo>=totalPaginasFlujo}>›</button>
                </div>
              </div>
            </div>
          </section>

          {/* ===== USUARIOS ===== */}
          <section className={`section${seccion==='usuarios'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Gestión de Usuarios</h2><p>Crea, edita y gestiona todos los usuarios</p></div>
              <button className="btn-nuevo" onClick={abrirModalNuevo}>+ Nuevo usuario</button>
            </div>
            <div className="tabla-wrap">
              <div className="tabla-header">
                <div className="tabla-header-left">
                  <span className="tabla-title">Usuarios del sistema</span>
                  <span className="tabla-count">
                    {usuariosCarga.cargando ? 'Cargando...' : usuariosCarga.error ? 'Sin conexión' : `${usuariosFiltrados.length} usuarios`}
                  </span>
                </div>
                <div className="tabla-header-right usuarios-filtros-right">
                  <input type="text" className="tabla-search" value={busqUsuarios}
                    onChange={e=>setBusqUsuarios(e.target.value)} placeholder="Buscar usuario..." />
                  <select className="tabla-search tabla-select-filtro" value={filtroCargoUsuarios} onChange={e=>setFiltroCargoUsuarios(e.target.value)}>
                    <option value="">Todos los cargos</option>
                    {CARGOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <select className="tabla-search tabla-select-filtro" value={filtroSalaUsuarios} onChange={e=>setFiltroSalaUsuarios(e.target.value)}>
                    <option value="">Todas las salas</option>
                    {salasUsuariosDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <table className="tabla tabla-usuarios-pro">
                <colgroup>
                  <col style={{width:'230px'}} />
                  <col style={{width:'220px'}} />
                  <col style={{width:'85px'}} />
                  <col style={{width:'105px'}} />
                  <col style={{width:'105px'}} />
                  <col style={{width:'90px'}} />
                  <col style={{width:'330px'}} />
                </colgroup>
                <thead><tr><th>Usuario</th><th>Cargo</th><th>Sala</th><th>Login</th><th>Creado</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {usuariosCarga.cargando
                    ? <tr><td colSpan="7" className="tabla-empty">Cargando usuarios del sistema...</td></tr>
                    : usuariosCarga.error
                    ? <tr><td colSpan="7" className="tabla-empty">
                        <div style={{display:'grid',justifyItems:'center',gap:9}}>
                          <strong style={{color:'#ea580c'}}>No se pudo consultar la lista</strong>
                          <span>{usuariosCarga.error}</span>
                          <button type="button" className="btn-nuevo" onClick={cargarUsuarios}>Reintentar</button>
                        </div>
                      </td></tr>
                    : usuariosFiltrados.length === 0
                    ? <tr><td colSpan="7" className="tabla-empty">No hay usuarios que coincidan con la búsqueda.</td></tr>
                    : usuariosFiltrados.map(u => {
                        const c    = cargoObj(u.cargo)
                        const cargo2 = permisosDeUsuario(u).find(rol => rol !== u.cargo)
                        const col  = colorAvatar(u.nombre)
                        const fecha= u.created_at ? u.created_at.split(' ')[0] : ''
                        const protegido = String(u.id) === String(sesion?.id)
                        return (
                          <tr key={u.id}>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                                <div style={{width:'32px',height:'32px',borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#fff',flexShrink:0}}>{iniciales(u.nombre)}</div>
                                <div><div style={{fontWeight:700,fontSize:'13px'}}>{u.nombre}</div><div style={{fontSize:'11px',color:'#9ca3af'}}>{u.usuario}</div></div>
                              </div>
                            </td>
                            <td>
                              <div className="usuario-cargos">
                                <span className={`badge-cargo ${c.cls}`}>{c.label}</span>
                                {cargo2 && <span className={`badge-cargo ${cargoObj(cargo2).cls}`}>{cargoObj(cargo2).label}</span>}
                              </div>
                            </td>
                            <td style={{fontSize:'12px'}}>{u.sala||'—'}</td>
                            <td style={{fontFamily:'monospace',fontSize:'12px',color:'#6b7280'}}>{u.usuario}</td>
                            <td style={{fontSize:'11px',color:'#9ca3af'}}>{formatF(fecha)}</td>
                            <td><span className={`badge-estado-user ${u.activo?'bu-activo':'bu-inactivo'}`}>{u.activo?'Activo':'Inactivo'}</span></td>
                            <td>
                              <div className="acc-cell">
                                <button className="btn-edit" onClick={()=>abrirModalEditar(u)}>Editar</button>
                                <button className={`btn-toggle-activo ${u.activo?'btn-desactivar':'btn-activar'}`} onClick={()=>toggleActivo(u)}>
                                  {u.activo?'Desactivar':'Activar'}
                                </button>
                                <button className="btn-edit" onClick={()=>desbloquearUsuario(u)} title="Reiniciar intentos fallidos de inicio de sesión">
                                  Desbloquear
                                </button>
                                <button className="btn-eliminar-usuario" onClick={()=>setModalEliminar(u)} disabled={protegido}
                                  title={protegido?'Esta cuenta está protegida':'Eliminar usuario'}>
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== REPORTES ===== */}
          <section className={`section${seccion==='reportes'?' active':''}`}>
            <div className="sec-header reportes-header">
              <div><h2>Reportes Globales</h2><p>Rendimiento por sala y asesor — solo asesores</p></div>
              <div className="reporte-periodo">
                <label htmlFor="mes-reporte">Periodo</label>
                <div className="reporte-periodo-controls">
                  <input
                    id="mes-reporte"
                    type="month"
                    value={mesReporte}
                    onChange={e=>setMesReporte(e.target.value)}
                    aria-label="Filtrar reportes por mes"
                  />
                  {mesReporte && <button type="button" onClick={()=>setMesReporte('')}>Ver todos</button>}
                </div>
              </div>
            </div>
            <div className="sala-tabs sala-tabs-pro">
              {[
                { id:'todas', label:'Todas las salas' },
                { id:'SALA 1', label:'Sala 1' },
                { id:'SALA 2', label:'Sala 2' },
              ].map(tab => (
                <button key={tab.id}
                  className={`sala-tab${salaReporte===tab.id?' active':''}`}
                  onClick={() => { setSalaReporte(tab.id); try{sessionStorage.setItem(JEF_SALA_REPORTE_KEY,tab.id)}catch{} }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="kpi-grid reportes-kpis" style={{gridTemplateColumns:'repeat(4,1fr)',margin:'16px 0'}}>
              <div className="kpi-card k-blue"> <div className="kpi-num">{repKpis.total}</div>  <div className="kpi-label">Total ventas</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{repKpis.inst}</div>   <div className="kpi-label">Instaladas</div></div>
              <div className="kpi-card k-red">  <div className="kpi-num">{repKpis.caidas}</div> <div className="kpi-label">Caídas</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{repKpis.efect}</div> <div className="kpi-label">Efectividad</div></div>
            </div>
            <div className="tabla-wrap ranking-pro-card">
              <div className="tabla-header ranking-pro-header">
                <div>
                  <span className="tabla-title">Ranking de Asesores</span>
                  <span className="ranking-periodo-label">{mesReporte ? `Periodo ${mesReporte.split('-').reverse().join('/')}` : 'Histórico completo'}</span>
                </div>
                <span className="tabla-count">{reporteData.length} asesores</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="tabla tabla-ranking-pro">
                  <thead><tr><th style={{width:'60px'}}>RANK</th><th>ASESOR</th><th>SALA</th><th>VENTAS INSTALADAS</th><th>TOTAL VENTAS</th><th>CAÍDAS</th><th>EFECTIVIDAD</th></tr></thead>
                  <tbody>
                    {reporteData.length === 0
                      ? <tr><td colSpan="7" className="tabla-empty">Sin datos.</td></tr>
                      : reporteData.map((r, i) => (
                          <tr className={i < 3 ? `ranking-top ranking-top-${i+1}` : ''} key={r.id != null ? `rep-${r.id}` : `rep-i-${i}`}>
                            <td className="ranking-pos-cell">
                              <span className={`ranking-pos ranking-pos-${Math.min(i+1,4)}`}>{i < 3 ? ['1°','2°','3°'][i] : i+1}</span>
                            </td>
                            <td>
                              <div className="ranking-asesor">
                                <div className="ranking-avatar" style={{background:colorAvatar(r.nombre)}}>{iniciales(r.nombre)}</div>
                                <div><div className="ranking-nombre">{r.nombre}</div><div className="ranking-usuario">@{r.usuario||'sin-usuario'}</div></div>
                              </div>
                            </td>
                            <td><span className="ranking-sala">{r.sala||'—'}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-installed">{r.instaladas}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-total">{r.totalVentas}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-falls">{r.caidas}</span></td>
                            <td className="ranking-effect-cell">
                              <div className="ranking-effect">
                                <div className="ranking-effect-meta">
                                  <span>Efectividad</span>
                                  <strong style={{color:efColor(r.efectividad)}}>{r.efectividad}%</strong>
                                </div>
                                <div className="ranking-effect-track">
                                  <div style={{background:efColor(r.efectividad),width:r.efectividad+'%'}}></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== RECLUTADOS GENERALES ===== */}
          <section className={`section${seccion==='reclutados-generales'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Reclutados generales</h2><p>Postulantes registrados por todos los asesores de reclutamiento</p></div>
              <button className="btn-nuevo" onClick={cargarReclutados}>Actualizar</button>
            </div>
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Postulantes generales</span>
                <span className="tabla-count">{reclutados.length} registros</span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla reclutados-generales-tabla">
                  <thead><tr><th>#</th><th>Fecha</th><th>Nombre y apellidos</th><th>Documento</th><th>Teléfono</th><th>Distrito</th><th>Puesto</th><th>Campaña</th><th>Empresa</th><th>Reclutador</th><th>Estado</th><th>Acción</th></tr></thead>
                  <tbody>
                    {cargandoReclutados ? (
                      <tr className="tabla-empty"><td colSpan="12">Cargando reclutados...</td></tr>
                    ) : reclutados.length === 0 ? (
                      <tr className="tabla-empty"><td colSpan="12">Sin postulantes registrados.</td></tr>
                    ) : reclutados.map((v, i) => (
                      <tr key={v.id}>
                        <td>{i + 1}</td>
                        <td>{formatF(soloFecha(v.created_at))}</td>
                        <td style={{fontWeight:700}}>{v.nombre || '—'}</td>
                        <td>{v.dni || '—'}</td>
                        <td>{v.telefono1 || '—'}</td>
                        <td>{v.distrito || '—'}</td>
                        <td>{v.puesto || '—'}</td>
                        <td>{v.fuente || v.campana || '—'}</td>
                        <td>{v.empresa || '—'}</td>
                        <td>{v.usuario_nombre || '—'}</td>
                        <td><span className="flujo-ok">{v.estado_reclutamiento || 'NUEVO'}</span></td>
                        <td><button type="button" className="venta-action-btn delete" onClick={()=>eliminarReclutado(v)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== ELIMINACIONES GENERALES ===== */}
          <section className={`section${seccion==='eliminaciones'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Eliminaciones generales</h2><p>Auditoría de ventas, postulantes y números eliminados desde todos los módulos</p></div>
              <button className="btn-nuevo" onClick={cargarEliminaciones} disabled={cargandoEliminaciones}>Actualizar</button>
            </div>
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Registro general de eliminaciones</span>
                <span className="tabla-count">{eliminaciones.length} registros</span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla eliminaciones-tabla">
                  <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Cargo</th><th>Tipo</th><th>ID</th><th>Detalle eliminado</th><th>Acción</th></tr></thead>
                  <tbody>
                    {cargandoEliminaciones ? (
                      <tr className="tabla-empty"><td colSpan="9">Cargando eliminaciones...</td></tr>
                    ) : eliminaciones.length === 0 ? (
                      <tr className="tabla-empty"><td colSpan="9">Todavía no hay eliminaciones registradas.</td></tr>
                    ) : eliminaciones.map((item, i) => {
                      const fechaHora = String(item.created_at || '').replace('T', ' ').split('.')[0]
                      const partes = fechaHora.split(' ')
                      return (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td>{formatF(partes[0])}</td>
                          <td>{partes[1] || '—'}</td>
                          <td style={{fontWeight:700}}>{item.actor_nombre || '—'}</td>
                          <td>{cargoObj(item.actor_cargo).label || item.actor_cargo || '—'}</td>
                          <td><span className="flujo-warn">{etiquetaTipoEliminacion(item.tipo)}</span></td>
                          <td>{item.registro_id || '—'}</td>
                          <td>{item.detalle || '—'}</td>
                          <td><div className="venta-actions">
                            <button
                              type="button"
                              className="venta-action-btn history"
                              disabled={!snapshotEliminado(item)}
                              onClick={()=>setDetalleEliminacion(item)}
                            >
                              Ver detalle
                            </button>
                            <button
                              type="button"
                              className="btn-eliminar-usuario"
                              disabled={eliminacionBorrandoId !== null}
                              onClick={()=>eliminarRegistroEliminacion(item)}
                            >
                              {eliminacionBorrandoId === item.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== LOGS ===== */}
          <section className={`section${seccion==='logs'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Logs de Actividad</h2><p>Registro de acciones en el sistema</p></div>
              <button className="btn-nuevo" style={{background:'#f97316'}} onClick={limpiarLogs}>Limpiar</button>
            </div>
            <div className="tabla-wrap" style={{padding:'16px 20px'}}>
              {logs.length === 0
                ? <div style={{textAlign:'center',color:'#9ca3af',padding:'32px',fontSize:'13px'}}>Sin actividad.</div>
                : logs.slice(0,50).map((l, i) => (
                    <div key={`log-${String(l.id)}-${i}`} className="log-item">
                      <div className="log-dot" style={{background:l.color||'#7C3AED'}}></div>
                      <div className="log-content">
                        <div className="log-accion">
                          {l.accion}
                          {l.detalle && <span style={{color:'#6b7280',fontWeight:400}}> — {l.detalle}</span>}
                        </div>
                        <div className="log-meta"><span className="log-user">{l.usuario}</span> · {formatF(l.fecha)} {l.hora}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
          </section>

        </main>
      </div>

      {/* MODAL USUARIO */}
      {detalleEliminacion && (() => {
        const snapshot = snapshotEliminado(detalleEliminacion) || {}
        return (
          <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget)setDetalleEliminacion(null)}}>
            <div className="modal-box eliminacion-detalle-modal">
              <div className="modal-head">
                <span className="modal-head-title">Detalle completo: {etiquetaTipoEliminacion(detalleEliminacion.tipo)}</span>
                <button className="modal-close" onClick={()=>setDetalleEliminacion(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="eliminacion-resumen">
                  Eliminado por <strong>{detalleEliminacion.actor_nombre}</strong> · ID {detalleEliminacion.registro_id}
                </div>
                <div className="eliminacion-campos">
                  {Object.entries(snapshot).map(([campo, valor]) => (
                    <div className="eliminacion-campo" key={campo}>
                      <span>{campo.replaceAll('_', ' ')}</span>
                      <strong>{valor === null || valor === '' ? '—' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancelar-m" onClick={()=>setDetalleEliminacion(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {modalUsu && (
        <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget)cerrarModalUsu()}}>
          <div className="modal-box">
            <div className="modal-title">{editandoId?'Editar usuario':'Nuevo usuario'}</div>
            <div className="modal-sub">{editandoId?`Editando: ${modForm.nombre}`:'Completa todos los campos.'}</div>
            <div className="modal-grid">
              <div className="modal-sep">Datos personales</div>
              <div className={`modal-campo span2${modErrores.nombre?' error':''}`}>
                <label>Nombre completo *</label>
                <input value={modForm.nombre} onChange={e=>setField('nombre',e.target.value)} placeholder="Nombre y apellidos" className={modErrores.nombre?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.usuario?' error':''}`}>
                <label>Usuario (login) *</label>
                <input value={modForm.usuario} onChange={e=>setField('usuario',e.target.value)} placeholder="nombre.apellido" style={{fontFamily:'monospace'}} className={modErrores.usuario?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.cargo?' error':''}`}>
                <label>Cargo principal *</label>
                <select value={modForm.cargo} onChange={e=>setField('cargo',e.target.value)} className={modErrores.cargo?'error':''}>
                  <option value="">— Seleccionar cargo —</option>
                  {CARGOS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className={`modal-campo${modErrores.cargo2?' error':''}`}>
                <label>Cargo adicional (opcional)</label>
                <select value={modForm.cargo2} onChange={e=>setField('cargo2',e.target.value)} className={modErrores.cargo2?'error':''}>
                  <option value="">— Sin cargo adicional —</option>
                  {CARGOS.filter(c=>c.id!==modForm.cargo && c.id!=='jefatura').map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              {usuarioRequiereSala(modForm.cargo, modForm.cargo2) && (
                <div className={`modal-campo${modErrores.sala?' error':''}`}>
                  <label>Sala / Equipo *</label>
                  <select value={modForm.sala} onChange={e=>setField('sala',e.target.value)} className={modErrores.sala?'error':''}>
                    <option value="">— Seleccionar sala —</option>
                    {SALAS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-sep">Contraseña</div>
              <div className={`modal-campo${modErrores.pass?' error':''}`}>
                <label>Contraseña *</label>
                <input type="password" value={modForm.pass} onChange={e=>setField('pass',e.target.value)} placeholder="Mínimo 6 caracteres" className={modErrores.pass?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.pass2?' error':''}`}>
                <label>Confirmar contraseña *</label>
                <input type="password" value={modForm.pass2} onChange={e=>setField('pass2',e.target.value)} placeholder="Repite la contraseña" className={modErrores.pass2?'error':''} />
              </div>
            </div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#14532d',marginBottom:'16px'}}>
              Al crear un usuario con cargo <strong>Asesor</strong>, estará disponible en Back Data para asignar leads.
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={cerrarModalUsu}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarUsuario} disabled={guardandoUsu}>
                {guardandoUsu ? 'Guardando...' : 'Guardar usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaViewer
        open={!!mediaVenta}
        onClose={()=>setMediaVenta(null)}
        ventaId={mediaVenta?.id}
        title={`Archivos de ${mediaVenta?.nombre || 'la venta'}`}
        subtitle={`DNI: ${mediaVenta?.dni || '—'} · Tel: ${mediaVenta?.telefono1 || '—'}`}
        audioPath={mediaVenta?.audio_path}
        audioName={mediaVenta?.audio_path ? mediaVenta.audio_path.split('/').pop() : ''}
      />

      {ventaReasignar && (
        <ReasignarVentaModal
          venta={ventaReasignar}
          asesores={usuarios.filter(usuario => usuarioTieneCargo(usuario, 'asesor') && usuario.activo)}
          alcance="global"
          onClose={()=>setVentaReasignar(null)}
          onSuccess={completarReasignacion}
        />
      )}

      {ventaHistorial && (
        <HistorialVentaModal
          venta={ventaHistorial}
          onClose={()=>setVentaHistorial(null)}
        />
      )}

      {ventaEditar && (
        <VentaEditarModal
          venta={ventaEditar}
          onClose={()=>setVentaEditar(null)}
          onSuccess={()=>{ setVentaEditar(null); Promise.all([cargarSeguimiento(), cargarVentasCache()]); mostrarToast('Datos actualizados') }}
        />
      )}

      {/* MODAL ELIMINAR USUARIO */}
      {modalEliminar && (
        <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget&&!eliminandoUsu)setModalEliminar(null)}}>
          <div className="modal-box modal-eliminar-box" role="dialog" aria-modal="true" aria-labelledby="titulo-eliminar-usuario">
            <div id="titulo-eliminar-usuario" className="modal-title">Eliminar usuario</div>
            <p className="modal-eliminar-texto">
              ¿Estás seguro de eliminar a <strong>{modalEliminar.nombre}</strong>?
              <span>Esta acción no se puede deshacer.</span>
            </p>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>setModalEliminar(null)} disabled={eliminandoUsu}>Cancelar</button>
              <button className="btn-confirmar-eliminar" onClick={confirmarEliminarUsuario} disabled={eliminandoUsu}>
                {eliminandoUsu?'Eliminando...':'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE USUARIO POR MÓDULO */}
      {selectorModulo.open && selectorModulo.modulo && (
        <div className="selector-modulo-overlay" onClick={e=>{ if(e.target===e.currentTarget) cerrarSelectorModulo() }}>
          <div className="selector-modulo-box">
            <div className="selector-modulo-head">
              <div className="selector-modulo-titulo">
                <span className="selector-modulo-icon" style={{background:selectorModulo.modulo.color+'12',color:selectorModulo.modulo.color}}><ModuloIcon tipo={selectorModulo.modulo.icon} size={24}/></span>
                <div>
                  <strong>Entrar a {selectorModulo.modulo.nombre}</strong>
                  <span>Selecciona un usuario para abrir el módulo con acceso de Jefatura</span>
                </div>
              </div>
              <button type="button" className="selector-modulo-cerrar" onClick={cerrarSelectorModulo} aria-label="Cerrar">×</button>
            </div>
            <div className="selector-modulo-busqueda">
              <div className="selector-busqueda-campo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                <input
                  autoFocus
                  type="search"
                  value={selectorModulo.buscar}
                  onChange={e=>setSelectorModulo(prev=>({...prev,buscar:e.target.value}))}
                  placeholder="Buscar por nombre, usuario o sala..."
                />
              </div>
              <span className="selector-resultados">{usuariosModulo.length} resultado{usuariosModulo.length===1?'':'s'}</span>
            </div>
            <div className="selector-modulo-lista">
              {usuariosModulo.length === 0 ? (
                <div className="selector-modulo-vacio">
                  No hay usuarios registrados con el cargo {cargoObj(selectorModulo.modulo.cargo).label}.
                </div>
              ) : usuariosModulo.map(u => (
                <div className={`selector-usuario${u.activo?'':' inactivo'}`} key={u.id}>
                  <div className="selector-usuario-avatar" style={{background:colorAvatar(u.nombre||u.usuario||'U')}}>{iniciales(u.nombre||u.usuario||'U')}</div>
                  <div className="selector-usuario-info">
                    <strong>{u.nombre || u.usuario}</strong>
                    <span>@{u.usuario || 'sin usuario'} · {u.sala || 'Sin sala'}</span>
                  </div>
                  <span className={`selector-usuario-estado ${u.activo?'activo':'inactivo'}`}>{u.activo?'Activo':'Inactivo'}</span>
                  <button type="button" onClick={()=>entrarModulo(selectorModulo.modulo,u)} disabled={!u.activo}>
                    <span>Entrar</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="selector-modulo-nota">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>La sesión conservará todos los permisos de Jefatura.</span>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast show">{toastMsg}</div>}

    </div>
  )
}
