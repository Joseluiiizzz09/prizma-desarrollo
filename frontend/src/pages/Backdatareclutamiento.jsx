import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import { usuarioTieneCargo } from '../utils/roles'
import { CAMPANAS } from '../utils/campanas'
import '../styles/Backdatareclutamiento.css'

// ── Selector de campaña (lista + opción "Otro" para escribir a mano) ───────
function CampanaSelect({ value, onChange, plain }) {
  const [manual, setManual] = useState(() => Boolean(value) && !CAMPANAS.includes(value))
  if (manual) {
    return (
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <input className={plain?undefined:'form-control'} value={value} autoFocus placeholder="Escribe la campaña"
          onChange={e=>onChange(e.target.value)} style={{flex:1,minWidth:0}} />
        <button type="button" title="Volver a la lista" onClick={()=>{ setManual(false); onChange('') }}
          style={{border:'none',background:'transparent',cursor:'pointer',color:'#6b7280',fontSize:12,whiteSpace:'nowrap'}}>↩ lista</button>
      </div>
    )
  }
  return (
    <select className={plain?undefined:'form-control'} value={CAMPANAS.includes(value)?value:''}
      onChange={e=>{ const v=e.target.value; if(v==='__OTRO__'){ setManual(true); onChange('') } else onChange(v) }}>
      <option value="">— Selecciona —</option>
      {CAMPANAS.map(c=>(<option key={c} value={c}>{c}</option>))}
      <option value="__OTRO__">Otro (escribir a mano)…</option>
    </select>
  )
}

// Selector de asesor con búsqueda integrada (escribe para filtrar la lista)
function AsesorBuscador({ value, asesores, disabled, onChange, title, className, placeholderText, emptyLabel }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  function abrir() {
    if (disabled) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) })
    setQ(''); setOpen(true)
  }
  function elegir(nombre) {
    if ((nombre || '') !== (value || '')) onChange(nombre)
    setOpen(false)
  }
  const lista = asesores.filter(a => (a.nombre || '').toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={abrir} title={title}
        className={className !== undefined ? className : 'sel-asesor-tabla'}
        style={{ textAlign:'left', width:'100%', cursor: disabled?'default':'pointer', background:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {value || placeholderText || '— Asignar asesor —'}
      </button>
      {open && createPortal(
        <div ref={boxRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:9999, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.16)', padding:8 }}>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar asesor…"
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(lista[0]) elegir(lista[0].nombre) } else if(e.key==='Escape') setOpen(false) }}
            style={{ width:'100%', padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:7, outline:'none', fontSize:12, marginBottom:6, boxSizing:'border-box' }} />
          <div style={{ maxHeight:210, overflowY:'auto' }}>
            <div onMouseDown={e=>e.preventDefault()} onClick={()=>elegir('')} style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, color:'#6b7280', borderRadius:6 }}>{emptyLabel || '— Sin asignar —'}</div>
            {lista.map(a=>(
              <div key={a.id} onMouseDown={e=>e.preventDefault()} onClick={()=>elegir(a.nombre)}
                style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, borderRadius:6, fontWeight: a.nombre===value?700:400, background: a.nombre===value?'#fff7ed':'transparent' }}>
                {a.nombre}
              </div>
            ))}
            {lista.length===0 && <div style={{ padding:'6px 8px', fontSize:11, color:'#9ca3af' }}>Sin resultados</div>}
          </div>
        </div>, document.body)}
    </>
  )
}

// Encabezado de tabla con menú desplegable de filtro (▼), en vez de solo
// ordenar — mismo patrón de portal que AsesorBuscador, usado para Campaña /
// Asesor asignado / Tipif. Vendedor (igual que KRONO).
function HeaderFiltroDropdown({ label, valor, onChange, opciones, buscable }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  function toggle() {
    if (open) { setOpen(false); return }
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setQ(''); setOpen(true)
  }
  function elegir(v) { onChange(v); setOpen(false) }
  const lista = (buscable && q.trim())
    ? opciones.filter(o => (o.label ?? o).toLowerCase().includes(q.trim().toLowerCase()))
    : opciones
  return (
    <th style={{ whiteSpace:'nowrap' }}>
      <span ref={btnRef} onClick={toggle} title="Filtrar" style={{ display:'inline-flex', alignItems:'center', gap:3, cursor:'pointer', userSelect:'none' }}>
        {label}
        <span style={{ fontSize:9, lineHeight:1, color: valor ? '#6d28d9' : '#cbd5e1' }}>▼</span>
      </span>
      {open && createPortal(
        <div ref={boxRef} style={{ position:'fixed', top:pos.top, left:pos.left, minWidth:190, zIndex:9999, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.16)', padding:8 }}>
          {buscable && (
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:7, outline:'none', fontSize:12, marginBottom:6, boxSizing:'border-box', fontFamily:'inherit' }} />
          )}
          <div style={{ maxHeight:220, overflowY:'auto' }}>
            <div onMouseDown={e=>e.preventDefault()} onClick={()=>elegir('')}
              style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, borderRadius:6, fontWeight: !valor?700:400, background: !valor?'#fff7ed':'transparent', color: !valor?'#c2410c':'#6b7280' }}>Todas</div>
            {lista.map(o => {
              const v = o.value ?? o, l = o.label ?? o
              return (
                <div key={v} onMouseDown={e=>e.preventDefault()} onClick={()=>elegir(v)}
                  style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, borderRadius:6, fontWeight: v===valor?700:400, background: v===valor?'#fff7ed':'transparent', color: v===valor?'#c2410c':'#111827' }}>
                  {l}
                </div>
              )
            })}
            {lista.length===0 && <div style={{ padding:'8px 9px', fontSize:12, color:'#9ca3af' }}>Sin resultados</div>}
          </div>
        </div>, document.body)}
    </th>
  )
}

// ── Utilities ────────────────────────────────────────────────────────────
const COLORES_AV = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#f97316','#06b6d4','#ec4899']
const DOT_COLORS  = ['#185FA5','#0F6E56','#854F0B','#7C3AED','#ea580c']
const BO_SECCIONES = ['base', 'reclutados', 'carga-masiva', 'rendimiento', 'avance', 'entrevistas', 'capacitacion']

const PERU_TIME_ZONE = 'America/Lima'
const PERU_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PERU_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const PERU_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: PERU_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partesFechaHora(formatter) {
  return Object.fromEntries(
    formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  )
}

function fechaHoy() {
  const { year, month, day } = partesFechaHora(PERU_DATE_FORMATTER)
  return `${year}-${month}-${day}`
}
function horaAhora() {
  const { hour, minute } = partesFechaHora(PERU_TIME_FORMATTER)
  return `${hour}:${minute}`
}
function normalizarFecha(f) {
  if (!f) return ''
  const texto = String(f)
  const match = texto.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : texto
}
function formatFecha(f) {
  const fecha = normalizarFecha(f)
  if (!fecha) return ''
  const [y,m,d] = fecha.split('-')
  if (!y || !m || !d) return fecha
  return `${d}/${m}/${y}`
}
function colorAv(n)   { let s=0; for (const c of n) s+=c.charCodeAt(0); return COLORES_AV[s % COLORES_AV.length] }
function iniciales(n) { return n.trim().split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
function tipifBadgeClass(t) {
  if (!t) return 'b-default'
  const u = t.toUpperCase()
  if (u.includes('VENTA'))       return 'b-venta'
  if (u.includes('BUZON'))       return 'b-buzon'
  if (u.includes('NO CONTESTA')) return 'b-nocontesta'
  if (u.includes('DER'))         return 'b-derivado'
  return 'b-default'
}

const TIPIF_BACK_OPTIONS = ['BUZON','NO CONTESTA','DER CHAMO','VENTA CERRADA','NO DESEA','CORTA LLAMADA','PREVENTA','EN EJECUCION','AGENDADO','NO CALIFICA','EDIFICIO NO LIBERADO']
// Value interno se conserva igual al de Backoffice comercial para heredar automáticamente
// el mismo comportamiento (bloqueo de rotación en NO TOCAR/FRAUDE); solo cambia el label visible.
// Lista igual a la de KRONO (mismo orden y labels). El value interno de
// "Acepta propuesta"/"Provincia" se conserva como VENTA CERRADA/FRAUDE porque
// ya hay lógica atada a esos textos (bloqueo de rotación, conteos de
// Rendimiento, el modal de "Agendar entrevista") — cambiar el value rompería
// todo eso. Los "ACEPTA PROPUESTA" sueltos que vienen de una importación
// Legacy se normalizan a VENTA CERRADA solo para que el select los muestre
// seleccionados (ver normalizarTipifVendSelect).
const TIPIF_VEND_OPCIONES = [
  { value:'VENTA CERRADA',       label:'Acepta propuesta' },
  { value:'BUZON',               label:'Buzón de voz' },
  { value:'NO CUMPLE EL PERFIL', label:'No cumple el perfil' },
  { value:'CORTA LLAMADA',       label:'Corta llamada' },
  { value:'GESTION WSP',         label:'Gestión WSP' },
  { value:'NO CONTESTA',         label:'No contesta' },
  { value:'NO INTERESADO',       label:'No interesado' },
  { value:'SH NO ROTAR',         label:'No rotar' },
  { value:'VOLVER A LLAMAR',     label:'Volver a llamar' },
  { value:'FRAUDE',              label:'Provincia' },
]
function labelTipifVend(valor) {
  const texto = String(valor || '').trim().toUpperCase()
  return TIPIF_VEND_OPCIONES.find(t => t.value === texto)?.label || valor || ''
}
// Solo para que el <select> muestre la opción correcta ya marcada — no cambia
// lo que hay guardado en la base.
function normalizarTipifVendSelect(valor) {
  const texto = String(valor || '').trim().toUpperCase()
  return texto === 'ACEPTA PROPUESTA' ? 'VENTA CERRADA' : texto
}
const TIPIF_PROHIBIDAS_ROTACION = new Set(['NO TOCAR','FRAUDE','SH NO ROTAR'])
const LIMA_DISTRITOS = [
  'Ancón','Ate','Barranco','Breña','Carabayllo','Cercado de Lima','Chaclacayo','Chorrillos',
  'Cieneguilla','Comas','El Agustino','Independencia','Jesús María','La Molina','La Victoria',
  'Lima','Lince','Los Olivos','Lurigancho','Lurín','Magdalena del Mar','Miraflores','Pachacámac',
  'Pucusana','Pueblo Libre','Puente Piedra','Punta Hermosa','Rímac','San Bartolo','San Borja',
  'San Isidro','San Juan de Lurigancho','San Juan de Miraflores','San Luis','San Martín de Porres',
  'San Miguel','Santa Anita','Santa María del Mar','Santa Rosa','Santiago de Surco','Surquillo',
  'Villa El Salvador','Villa María del Triunfo',
]
function esLeadProhibido(reg) {
  const tipif = String(reg?._tipifVend || reg?.tipif_vend || '').trim().toUpperCase()
  return TIPIF_PROHIBIDAS_ROTACION.has(tipif)
}
const TIPIF_VEND_STYLES = {
  'VENTA CERRADA':['#d1fae5','#065f46'],'PREVENTA':['#dbeafe','#1e40af'],'AGENDADO':['#fef3c7','#78350f'],
  'NO CONTESTA':['#fefce8','#854d0e'],'BUZON DE VOZ':['#e0f2fe','#0c4a6e'],'CORTA LLAMADA':['#f8fafc','#334155'],
  'EN EJECUCION':['#dcfce7','#14532d'],'SIN COBERTURA':['#ffedd5','#881337'],'NO CALIFICA':['#fefce8','#713f12'],
  'NO DESEA':['#ffedd5','#7c2d12'],'CONTACTO CON TERCEROS':['#ccfbf1','#134e4a'],'EDIFICIO NO LIBERADO':['#f5f3ff','#4c1d95'],
  'DESEA MOVIL':['#f8fafc','#1e293b'],'SERVICIO ACTIVO':['#f1f5f9','#1e293b'],'CONTESTA':['#d1fae5','#065f46'],
  'NC':['#fefce8','#854d0e'],'DERIVADO':['#ede9fe','#5b21b6'],'NO TOCAR':['#fff7ed','#ea580c'],'FRAUDE':['#ffedd5','#9a3412'],
}
const BL_TIPIF_COLORS = {
  'VENTA CERRADA':'#16a34a','PREVENTA':'#2563eb','AGENDADO':'#7c3aed','NO CONTESTA':'#9ca3af',
  'CORTA LLAMADA':'#f97316','NO DESEA':'#f97316','BUZON DE VOZ':'#6b7280','SERVICIO ACTIVO':'#0891b2',
  'SIN COBERTURA':'#ea580c','NO CALIFICA':'#d97706','NO TOCAR':'#ea580c','FRAUDE':'#9a3412',
}

function TipifVendBadge({ tipif, hora }) {
  if (!tipif) return <span className="tipif-empty">— Pendiente —</span>
  const [bg, color] = TIPIF_VEND_STYLES[tipif] || ['#f3f4f6','#374151']
  return (
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      <span style={{display:'inline-flex',padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:bg,color,whiteSpace:'nowrap'}}>{tipif}</span>
      {hora && <span style={{fontSize:9,color:'#9ca3af'}}>vendedor · {hora}</span>}
    </div>
  )
}

// Colores fuertes para el selector de Tipif. Vendedor (texto legible encima),
// mismo patrón usado en Backoffice para estiloTipifVend().
const TIPIF_VEND_FUERTE = {
  'VENTA CERRADA':   ['#dcfce7','#166534','#86efac'],
  'ACEPTA PROPUESTA':['#dcfce7','#166534','#86efac'],
  'BUZON DE VOZ':    ['#f3e8d4','#78350f','#d6a96c'],
  'BUZON':           ['#f3e8d4','#78350f','#d6a96c'],
  'NO TOCAR':        ['#fee2e2','#980000','#fca5a5'],
  'NO CUMPLE EL PERFIL': ['#fee2e2','#980000','#fca5a5'],
  'CORTA LLAMADA':   ['#ffedd5','#c2410c','#fdba74'],
  'GESTION WSP':     ['#fef9c3','#854d0e','#fde047'],
  'NO CONTESTA':     ['#fef9c3','#854d0e','#fde047'],
  'NO INTERESADO':   ['#ffedd5','#9a3412','#fdba74'],
  'NO ROTAR':        ['#fee2e2','#980000','#fca5a5'],
  'SH NO ROTAR':     ['#fee2e2','#980000','#fca5a5'],
  'VOLVER A LLAMAR': ['#dbeafe','#1d4ed8','#93c5fd'],
  'FRAUDE':          ['#fee2e2','#991b1b','#fca5a5'],
}
function estiloTipifVend(v) {
  const paleta = TIPIF_VEND_FUERTE[v]
  return {
    fontSize:10, padding:'3px 6px', borderRadius:6, fontFamily:'inherit', maxWidth:155, cursor:'pointer',
    border:`1px solid ${paleta?paleta[2]:'#e5e7eb'}`,
    color:paleta?paleta[1]:'inherit',
    fontWeight:paleta?800:'inherit',
    background:paleta?paleta[0]:'#fff',
  }
}

// Tipificación del resultado de la entrevista (colores enviados por el usuario)
const TIPIF_ENTREVISTA_OPCIONES = ['NO CONTESTA','DESISTE','REPROGRAMA','CORTA LLAMADA','ASISTE','EN CAMINO','FALTA']
const TIPIF_ENTREVISTA_COLORES = {
  'NO CONTESTA':   ['#fef9c3','#854d0e','#fde047'],
  'DESISTE':       ['#f1f5f9','#334155','#cbd5e1'],
  'REPROGRAMA':    ['#dbeafe','#1d4ed8','#93c5fd'],
  'CORTA LLAMADA': ['#ffedd5','#c2410c','#fdba74'],
  'ASISTE':        ['#dcfce7','#166534','#86efac'],
  'EN CAMINO':     ['#fef3c7','#92400e','#fcd34d'],
  'FALTA':         ['#fee2e2','#991b1b','#fca5a5'],
}
function estiloTipifEntrevista(v) {
  const paleta = TIPIF_ENTREVISTA_COLORES[v]
  return {
    fontSize:10, padding:'3px 6px', borderRadius:6, fontFamily:'inherit', maxWidth:145, cursor:'pointer',
    border:`1px solid ${paleta?paleta[2]:'#e5e7eb'}`,
    color:paleta?paleta[1]:'#9ca3af',
    fontWeight:paleta?800:'inherit',
    background:paleta?paleta[0]:'#fff',
  }
}

function BlBadge({ tipif }) {
  const raw = (tipif || '').trim()
  const color = BL_TIPIF_COLORS[raw.toUpperCase()] || '#9ca3af'
  if (!raw) return <span style={{color:'#d1d5db',fontStyle:'italic',fontSize:11}}>Sin tipif.</span>
  return <span style={{background:`${color}22`,color,border:`1px solid ${color}44`,padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>{raw}</span>
}

function BoNavIcon({ tipo }) {
  if (tipo === 'base') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></svg>
  )
  if (tipo === 'carga') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 16V8m0 0-3 3m3-3 3 3"/></svg>
  )
  if (tipo === 'rendimiento') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>
  )
  return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m0-5a5 5 0 0 1 6 5"/></svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Backdatareclutamiento() {
  const navigate    = useNavigate()
  const { sesion, logout } = useAuth()
  const idCntRef    = useRef(1)
  const toastTimer  = useRef(null)
  const archivoInputRef = useRef(null)
  const legacyInputRef  = useRef(null)
  const fechaSistemaRef = useRef(fechaHoy())

  // ── Section ──
  const [seccion, setSeccion] = useState(() => {
    const guardada = sessionStorage.getItem('nc_backoffice_apartado')
    return BO_SECCIONES.includes(guardada) ? guardada : 'base'
  })
  const [sidebarAbierto, setSidebarAbierto] = useState(() => sessionStorage.getItem('nc_backoffice_sidebar') !== 'cerrado')

  // ── Data ──
  const [asesores,      setAsesores]      = useState([])
  const [baseData,      setBaseData]      = useState({})
  const [reclutados,    setReclutados]    = useState([])
  const [cargandoReclutados, setCargandoReclutados] = useState(false)
  const [fechaPestanas, setFechaPestanas] = useState([fechaHoy()])
  const [fechaActiva,   setFechaActiva]   = useState(fechaHoy())

  // ── Form (agregar registro) ──
  const [form,     setForm]     = useState({ campana:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', tipoContacto:'LLAMADA', direccion:'', coordenadas:'', obsBack:'', tipifBack:'', asesor:'' })
  const [n1Error,  setN1Error]  = useState(false)
  const [calPicker,   setCalPicker]   = useState('')
  const [cmCalPicker, setCmCalPicker] = useState('')

  // ── Filtros base ──
  const [filtros, setFiltros] = useState({ tip:'', tipVend:'', asesor:'', campana:'', numero:'', verTipVend:true, global:false, duplicados:false, desde:'', hasta:'' })
  const [baseSort, setBaseSort] = useState({ col:null, dir:'asc' })
  const [modalEditarContacto, setModalEditarContacto] = useState({ open:false, regId:null, campana:'', n1:'', n2:'', usuarioWhatsapp:'', guardando:false })

  // ── Historial ──
  const [histOpen, setHistOpen] = useState({})

  // ── Rotación panel ──
  const [rotPanelOpen,  setRotPanelOpen]  = useState(false)
  const [rotAsesor,     setRotAsesor]     = useState('')
  const [rotSort,       setRotSort]       = useState({ col:null, dir:'asc' })
  const [rotCant,       setRotCant]       = useState(4)
  const [rotSel,        setRotSel]        = useState({})
  const [rotFiltroFecha,setRotFiltroFecha]= useState('')
  const [rotProgress,   setRotProgress]   = useState(0)
  const [rotResultado,  setRotResultado]  = useState([])
  const [rotRotados,    setRotRotados]    = useState(0)

  // ── Modal rotación manual ──
  const [modalRotar,    setModalRotar]    = useState({ open:false, regId:null, desc:'', asesorActual:'' })
  const [entrevistas, setEntrevistas] = useState([])
  const [cargandoEntrevistas, setCargandoEntrevistas] = useState(false)
  const [filtrosEntrevistas, setFiltrosEntrevistas] = useState({ turno:'', desde:'', hasta:'', busqueda:'' })
  const [modalEntrevista, setModalEntrevista] = useState({ open:false, regId:null, nombrePostulante:'', numero:'', numeroRef:'', turno:'', fechaAgendamiento:'', observacion:'', guardando:false, error:'' })
  const [capacitaciones, setCapacitaciones] = useState([])
  const [cargandoCapacitaciones, setCargandoCapacitaciones] = useState(false)
  const [filtrosCapacitacion, setFiltrosCapacitacion] = useState({ busqueda:'', desde:'', hasta:'' })
  const [modalCapacitacion, setModalCapacitacion] = useState({ open:false, entrevistaId:null, nombrePostulante:'', numero:'', fechaInicio:'', guardando:false, error:'' })
  const [rotModalAsesor,setRotModalAsesor]= useState('')
  const [rotBusqueda,   setRotBusqueda]   = useState('')
  const [rotModalMotivo,setRotModalMotivo]= useState('')

  // ── Carga masiva ──
  const [cargaTab,     setCargaTab]     = useState(() => sessionStorage.getItem('nc_backoffice_carga_tab') || 'pegar')
  const [masivaNums,   setMasivaNums]   = useState('')
  const [masivaCamp,   setMasivaCamp]   = useState('')
  const [masivaAsesor, setMasivaAsesor] = useState('')
  const [masivaLote,   setMasivaLote]   = useState('10')
  const [masivaFilas,  setMasivaFilas]  = useState([])
  const [inclDup,      setInclDup]      = useState(false)
  const [archivoRows,  setArchivoRows]  = useState([])
  const [archivoStatus,setArchivoStatus]= useState('')
  const [archivoInfo,  setArchivoInfo]  = useState('')
  const [legacyRows,   setLegacyRows]   = useState([])
  const [legacyStatus, setLegacyStatus] = useState('')
  const [legacyInfo,   setLegacyInfo]   = useState('')
  const [legacyFecha,  setLegacyFecha]  = useState(fechaHoy())
  const [legacyUsarFecha, setLegacyUsarFecha] = useState('no')
  const [dragOver,     setDragOver]     = useState(false)
  const [legacyDragOver, setLegacyDragOver] = useState(false)

  // ── Rendimiento ──
  const [rendFiltroTipo,  setRendFiltroTipo]  = useState('mes')
  const [rendFiltroFecha, setRendFiltroFecha] = useState(fechaHoy())
  const [rendDesde,       setRendDesde]       = useState('')
  const [rendHasta,       setRendHasta]       = useState('')
  const [rendOrden,       setRendOrden]       = useState('ventas_desc')

  // ── Avance ──
  const [avanceBuscar, setAvanceBuscar] = useState('')
  const [blModal,  setBlModal]  = useState({ open:false, nombre:'', asesorId:null })
  const [blLeads,  setBlLeads]  = useState([])
  const [blFecha,  setBlFecha]  = useState(fechaHoy())
  const [blCargando, setBlCargando] = useState(false)

  // ── Toast ──
  const [toast, setToast] = useState('')

  // Mantiene el panel alineado con el calendario de Lima aunque quede abierto
  // durante el cambio de día. Conserva una fecha histórica elegida a mano.
  useEffect(() => {
    function sincronizarFechaPeru() {
      const hoy = fechaHoy()
      const fechaAnterior = fechaSistemaRef.current

      setFechaPestanas(prev => prev.includes(hoy) ? prev : [...prev, hoy].sort().reverse())

      if (hoy === fechaAnterior) return

      setFechaActiva(prev => prev === fechaAnterior ? hoy : prev)
      setLegacyFecha(prev => prev === fechaAnterior ? hoy : prev)
      setRendFiltroFecha(prev => prev === fechaAnterior ? hoy : prev)
      setBlFecha(prev => prev === fechaAnterior ? hoy : prev)
      fechaSistemaRef.current = hoy
    }

    sincronizarFechaPeru()
    const timer = setInterval(sincronizarFechaPeru, 30000)
    return () => clearInterval(timer)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────
  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  async function copiarNumero(numero) {
    const texto = String(numero || '').trim()
    if (!texto) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
    } catch(e) {
      mostrarToast('No se pudo copiar el número')
    }
  }

  async function guardarDatosBack(id, cambios) {
    const found = findReg(id)
    if (!found) return
    const anteriores = Object.fromEntries(Object.keys(cambios).map(clave => [clave, found.reg[clave]]))
    updateReg(id, cambios)
    if (!found.reg._backendId) return
    try {
      const res = await fetch(`${API}/leads-reclutamiento/${found.reg._backendId}/datos-back`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify(cambios)
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'Error al guardar')
    } catch(e) {
      updateReg(id, anteriores)
      mostrarToast(e.message || 'No se pudieron guardar los datos')
    }
  }

  function findReg(id) {
    for (const f in baseData) {
      const reg = baseData[f].find(r => r.id === id)
      if (reg) return { reg, fecha: f }
    }
    return null
  }

  // Cambios locales recientes por lead (clave = _backendId estable). El polling
  // los respeta hasta que el backend los confirme o pasen 8s, evitando parpadeo.
  const pendingRef = useRef({})
  const mutGenRef = useRef(0)   // se incrementa en cada acción local; descarta respuestas de polls viejos
  function marcarPendiente(id, campos) {
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return
    let key = null
    for (const f in baseData) { const r = (baseData[f]||[]).find(x => x.id === id); if (r) { key = r._backendId; break } }
    if (!key) return
    const prev = pendingRef.current[key]?.campos || {}
    pendingRef.current[key] = { campos: { ...prev, ...campos }, ts: Date.now() }
  }

  function updateReg(id, updater) {
    mutGenRef.current++
    if (updater && typeof updater === 'object' && !Array.isArray(updater)) marcarPendiente(id, updater)
    setBaseData(prev => {
      const next = {}
      for (const f in prev) {
        const idx = prev[f].findIndex(r => r.id === id)
        if (idx >= 0) {
          const arr = [...prev[f]]
          arr[idx] = typeof updater === 'function' ? updater(arr[idx]) : { ...arr[idx], ...updater }
          next[f] = arr
        } else {
          next[f] = prev[f]
        }
      }
      return next
    })
  }

  // ── Cargar datos ─────────────────────────────────────────────────────────
  const cargarAsesores = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/usuarios`, { headers: ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el registro')
      if (data.ok) setAsesores(data.data.filter(u => usuarioTieneCargo(u, 'asesorreclutamiento') && u.activo).map(u => ({ id:u.id, nombre:u.nombre, usuario:u.usuario, sala:u.sala })))
    } catch(e) { console.error('Error cargando asesores:', e) }
  }, [])

  const cargandoLeadsRef = useRef(false)
  const firmaLeadsRef = useRef('')
  const cargarLeads = useCallback(async () => {
    if (cargandoLeadsRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoLeadsRef.current = true
    const gen = mutGenRef.current
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      // Si hubo una acción local durante el fetch, esta respuesta ya es vieja: descartar.
      if (mutGenRef.current !== gen) return
      if (!responseChanged(firmaLeadsRef, data.data) && Object.keys(pendingRef.current).length === 0) return
      const nuevoBase = {}
      const nuevasFechas = []
      data.data.forEach(l => {
        const fecha = normalizarFecha(l.fecha) || fechaHoy()
        if (!nuevoBase[fecha]) nuevoBase[fecha] = []
        if (!nuevasFechas.includes(fecha)) nuevasFechas.push(fecha)
        const reg = {
          id:         idCntRef.current++,
          _backendId: l.id,
          fecha,
          campana:    l.campana || '—',
          distrito:   l.distrito || '—',
          n1:         l.n1,
          n2:         l.n2 || '',
          usuarioWhatsapp: l.usuario_whatsapp || '',
          obsAsesor:  l.obs_asesor || '',
          tipo_contacto: l.tipo_contacto || 'LLAMADA',
          direccion:   l.direccion || '',
          coordenadas: l.coordenadas || '',
          obs_back:    l.obs_back || '',
          tipifBack:  l.tipif_back || '',
          asesor:     l.asesor_nombre || '',
          horaAsig:   l.hora_asig || '',
          sinAsignar: !!l.sin_asignar,
          rotaciones: l.rotaciones || 0,
          _tipifVend: l.tipif_vend || '',
          _tipifHora: l.tipif_hora || '',
          entrevistaTipif: l.entrevista_tipificacion || '',
          historial:  Array.isArray(l.historial) ? l.historial : [],
        }
        // Reconciliar con cambios locales recientes (evita parpadeo al valor viejo)
        const pend = pendingRef.current[l.id]
        if (pend) {
          const edad = Date.now() - pend.ts
          // Si la reasignación/rotación ya se confirmó en el servidor (mismo asesor),
          // libera TODO el pending para no bloquear la tipificación nueva del asesor.
          const asesorConfirmado = pend.campos.asesor !== undefined && reg.asesor === pend.campos.asesor
          if (asesorConfirmado || edad >= 8000) {
            delete pendingRef.current[l.id]
          } else {
            let quedan = 0
            for (const k in pend.campos) {
              const exp = pend.campos[k]
              if (k === 'historial' && Array.isArray(exp)) {
                const serverHist = Array.isArray(reg.historial) ? reg.historial : []
                if (serverHist.length < exp.length) { reg.historial = exp; quedan++ }
                continue
              }
              if (exp && typeof exp === 'object') continue
              if (reg[k] !== exp) { reg[k] = exp; quedan++ }
            }
            if (quedan === 0) delete pendingRef.current[l.id]
          }
        }
        nuevoBase[fecha].push(reg)
      })
      const hoy = fechaHoy()
      if (!nuevasFechas.includes(hoy)) nuevasFechas.push(hoy)
      nuevasFechas.sort().reverse()
      setBaseData(nuevoBase)
      setFechaPestanas(nuevasFechas)
      setFechaActiva(prev => nuevasFechas.includes(prev) ? prev : nuevasFechas[0])
    } catch(e) { console.error('Error cargando leads:', e) }
    finally { cargandoLeadsRef.current = false }
  }, [])

  const cargarReclutados = useCallback(async () => {
    setCargandoReclutados(true)
    try {
      const res = await fetch(`${API}/ventas-reclutamiento`, { headers: ncHeaders() })
      const data = await res.json()
      // Consolidado general: todos los postulantes captados por cualquier
      // asesor, en cualquier etapa (NUEVO, CONTACTADO, RECLUTADO, ...) — no
      // se filtra por un estado final, la columna ESTADO ya muestra la etapa.
      setReclutados(data.ok ? data.data : [])
    } catch(e) {
      console.error('Error cargando reclutados:', e)
      setReclutados([])
    } finally {
      setCargandoReclutados(false)
    }
  }, [])

  const cargarEntrevistas = useCallback(async () => {
    setCargandoEntrevistas(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas`, { headers: ncHeaders() })
      const data = await res.json()
      setEntrevistas(data.ok ? data.data : [])
    } catch (e) {
      console.error('Error cargando entrevistas:', e)
      setEntrevistas([])
    } finally {
      setCargandoEntrevistas(false)
    }
  }, [])

  const cargarCapacitaciones = useCallback(async () => {
    setCargandoCapacitaciones(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/capacitaciones`, { headers: ncHeaders() })
      const data = await res.json()
      setCapacitaciones(data.ok ? data.data : [])
    } catch(e) {
      console.error('Error cargando capacitaciones:', e)
      setCapacitaciones([])
    } finally {
      setCargandoCapacitaciones(false)
    }
  }, [])

  function actualizarEntrevistaLocal(id, cambios) {
    setEntrevistas(prev => prev.map(en => en.id === id ? { ...en, ...cambios } : en))
  }

  async function guardarTipifEntrevista(id, valor) {
    const anterior = entrevistas.find(en => en.id === id)?.tipificacion || ''
    actualizarEntrevistaLocal(id, { tipificacion: valor })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipificacion: valor }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la tipificación')
      if (valor === 'ASISTE') abrirModalCapacitacion(id)
    } catch(e) {
      actualizarEntrevistaLocal(id, { tipificacion: anterior })
      mostrarToast(e.message || 'No se pudo guardar la tipificación')
    }
  }

  // ── Modal registrar capacitación (al tipificar ASISTE) ────────────────────
  function abrirModalCapacitacion(entrevistaId) {
    const en = entrevistas.find(e => e.id === entrevistaId)
    if (!en) return
    setModalCapacitacion({ open:true, entrevistaId, nombrePostulante:en.nombre_postulante||'', numero:en.numero||'', fechaInicio:'', guardando:false, error:'' })
  }

  async function guardarCapacitacion() {
    const nombrePostulante = modalCapacitacion.nombrePostulante.trim()
    const numero = modalCapacitacion.numero.trim()
    const fechaInicio = modalCapacitacion.fechaInicio
    if (!nombrePostulante) { setModalCapacitacion(p=>({...p, error:'Ingresa el nombre del postulante'})); return }
    if (!numero) { setModalCapacitacion(p=>({...p, error:'Ingresa un número de contacto'})); return }
    if (!fechaInicio) { setModalCapacitacion(p=>({...p, error:'Selecciona la fecha de inicio de capacitación'})); return }
    setModalCapacitacion(p=>({...p, guardando:true, error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${modalCapacitacion.entrevistaId}/capacitacion`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
        nombre_postulante:nombrePostulante, numero, fecha_inicio_capacitacion:fechaInicio,
      }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo registrar la capacitación')
      setModalCapacitacion({ open:false, entrevistaId:null, nombrePostulante:'', numero:'', fechaInicio:'', guardando:false, error:'' })
      mostrarToast('Capacitación registrada')
      if (seccion === 'capacitacion') cargarCapacitaciones()
    } catch (e) {
      setModalCapacitacion(p=>({...p, guardando:false, error:e.message || 'No se pudo registrar la capacitación'}))
    }
  }

  function actualizarCapacitacionLocal(id, cambios) {
    setCapacitaciones(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
  }

  async function guardarCampoCapacitacion(id, campo, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    if (!valorNuevo) { mostrarToast('Este campo no puede quedar vacío'); return }
    actualizarCapacitacionLocal(id, { [campo]: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/capacitaciones/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ [campo]: valorNuevo }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar')
    } catch(e) {
      actualizarCapacitacionLocal(id, { [campo]: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar')
    }
  }

  async function guardarObservacionEntrevista(id, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    actualizarEntrevistaLocal(id, { observacion: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ observacion: valorNuevo }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la observación')
    } catch(e) {
      actualizarEntrevistaLocal(id, { observacion: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar la observación')
    }
  }

  async function guardarFechaEntrevista(id, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    actualizarEntrevistaLocal(id, { fecha_entrevista: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ fecha_entrevista: valorNuevo||null }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la fecha de entrevista')
    } catch(e) {
      actualizarEntrevistaLocal(id, { fecha_entrevista: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar la fecha de entrevista')
    }
  }

  useEffect(() => {
    cargarAsesores()
    cargarLeads()
    cargarReclutados()
    const t = setVisibleInterval(cargarLeads, 1000)
    return () => clearVisibleInterval(t)
  }, [cargarAsesores, cargarLeads, cargarReclutados])

  // BL modal reload on fecha change
  useEffect(() => {
    if (!blModal.open || blModal.asesorId == null) return
    setBlCargando(true)
    setBlLeads([])
    let url = `${API}/leads-reclutamiento?asesor_id=${blModal.asesorId}`
    if (blFecha) url += `&fecha=${blFecha}`
    fetch(url, { headers: ncHeaders() })
      .then(r => r.json())
      .then(data => { setBlLeads(data.ok ? data.data : null); setBlCargando(false) })
      .catch(() => { setBlLeads(null); setBlCargando(false) })
  }, [blFecha, blModal.open, blModal.asesorId])

  // ── Section navigation ───────────────────────────────────────────────────
  function irSeccion(id) {
    sessionStorage.setItem('nc_backoffice_apartado', id)
    setSeccion(id)
    if (id === 'carga-masiva') setLegacyFecha(fechaActiva)
    if (id === 'reclutados') cargarReclutados()
    if (id === 'entrevistas') cargarEntrevistas()
    if (id === 'capacitacion') cargarCapacitaciones()
  }

  // ── Date navigation ──────────────────────────────────────────────────────
  function navegarFecha(dir) {
    setFechaActiva(prev => {
      const idx = fechaPestanas.indexOf(prev)
      const ni  = idx - dir
      if (ni < 0 || ni >= fechaPestanas.length) return prev
      return fechaPestanas[ni]
    })
  }

  function agregarFechaCalendario() {
    const f = calPicker
    if (!f) { mostrarToast('Selecciona una fecha primero'); return }
    if (fechaPestanas.includes(f)) { mostrarToast('Esa fecha ya existe'); return }
    setFechaPestanas(prev => [...prev, f].sort().reverse())
    setBaseData(prev => prev[f] ? prev : { ...prev, [f]: [] })
    setFechaActiva(f)
    setCalPicker('')
  }

  function agregarFechaCargaMasiva() {
    const f = cmCalPicker
    if (!f) { mostrarToast('Selecciona una fecha primero'); return }
    if (fechaPestanas.includes(f)) { mostrarToast('Esa fecha ya existe'); return }
    setFechaPestanas(prev => [...prev, f].sort().reverse())
    setBaseData(prev => prev[f] ? prev : { ...prev, [f]: [] })
    setFechaActiva(f)
    setCmCalPicker('')
  }

  // ── Form (agregar registro individual) ───────────────────────────────────
  async function agregarRegistro() {
    const n1 = form.n1.trim()
    const usuarioWhatsapp = form.usuarioWhatsapp.trim()
    if (!n1 && !usuarioWhatsapp) { setN1Error(true); mostrarToast('Ingresa un N1 o un usuario de WhatsApp'); return }
    setN1Error(false)
    const campana  = form.campana.trim() || '—'
    const distrito = form.distrito || '—'
    const n2       = form.n2.trim()
    const asesor   = form.asesor
    const hora     = asesor ? horaAhora() : ''
    const fecha    = fechaActiva
    const reg = {
      id:idCntRef.current++, _backendId:null, fecha, campana, distrito, n1, n2, usuarioWhatsapp, obsAsesor:'', asesor, horaAsig:hora,
      sinAsignar:!asesor, rotaciones:0, _tipifVend:'', _tipifHora:'',
      historial: asesor ? [{asesor, hora, fecha, motivo:'Asignacion inicial'}] : [],
    }
    setBaseData(prev => ({ ...prev, [fecha]: [reg, ...(prev[fecha] || [])] }))
    setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({ campana, departamento:'Lima', provincia:'Lima', distrito, n1, n2, usuario_whatsapp:usuarioWhatsapp, asesor_nombre:asesor, fecha, hora_asig:hora }) })
      const data = await res.json()
      const bid  = data.ids?.[0] || data.id
      if (bid) {
        setBaseData(prev => {
          const next = { ...prev }
          const arr  = [...(next[fecha] || [])]
          const idx  = arr.findIndex(r => r.id === reg.id)
          if (idx >= 0) { arr[idx] = { ...arr[idx], _backendId: bid }; next[fecha] = arr }
          return next
        })
      }
      setForm({ campana:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', asesor:'' })
    } catch(e) {
      setBaseData(prev => ({ ...prev, [fecha]:(prev[fecha] || []).filter(r => r.id !== reg.id) }))
      mostrarToast(e.message || 'No se pudo guardar el registro')
    }
  }

  // ── Reasignar ────────────────────────────────────────────────────────────
  async function reasignarReg(id, nuevoAsesor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    if ((nuevoAsesor || '') === (reg.asesor || '')) return  // mismo asesor: evita reasignacion fantasma en el historial
    const hora = horaAhora()
    if (nuevoAsesor && esLeadProhibido(reg)) {
      mostrarToast(`N1 ${reg.n1} bloqueado: ${reg._tipifVend}`)
      return
    }
    if (!nuevoAsesor) {
      updateReg(id, { asesor:'', horaAsig:'', sinAsignar:true })
      if (reg._backendId) {
        try {
          const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:'', hora_asig:'' }) })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo quitar la asignación')
        } catch (e) {
          updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar })
          mostrarToast(e.message || 'No se pudo quitar la asignación')
        }
      }
      return
    }
    const newHist = [...reg.historial, { asesor:nuevoAsesor, asesorAnterior:reg.asesor||'', reasignadoPor:sesion?.nombre||'', hora, fecha:fechaHoy(), motivo:'Reasignacion directa' }]
    updateReg(id, { asesor:nuevoAsesor, horaAsig:hora, sinAsignar:false, historial:newHist })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:nuevoAsesor, hora_asig:hora, historial:newHist }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo reasignar el lead')
      } catch (e) {
        updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, historial:reg.historial })
        mostrarToast(e.message || 'No se pudo reasignar el lead')
      }
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────
  async function eliminarReg(id) {
    mutGenRef.current++
    const found = findReg(id)
    if (!found) return
    setBaseData(prev => { const n={}; for(const f in prev) n[f]=prev[f].filter(r=>r.id!==id); return n })
    setHistOpen(prev => { const n={...prev}; delete n[id]; return n })
    if (found.reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${found.reg._backendId}`, { method:'DELETE', headers:ncHeaders() })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el lead')
      } catch (e) {
        setBaseData(prev => ({ ...prev, [found.fecha]: [found.reg, ...(prev[found.fecha] || []).filter(r => r.id !== id)] }))
        mostrarToast(e.message || 'No se pudo eliminar el lead')
      }
    }
  }

  // ── Tipif vendedor ────────────────────────────────────────────────────────
  async function guardarTipif(id, valor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    const hora = horaAhora()
    updateReg(id, { _tipifVend:valor, _tipifHora:hora })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/tipif`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:valor }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la tipificación')
        if (Array.isArray(data.historial)) updateReg(id, { historial:data.historial })
        if (valor === 'VENTA CERRADA') abrirModalEntrevista(id)
      } catch (e) {
        updateReg(id, { _tipifVend:reg._tipifVend, _tipifHora:reg._tipifHora })
        mostrarToast(e.message || 'No se pudo guardar la tipificación')
      }
    }
  }

  // ── Comentario (obs. del asesor) ────────────────────────────────────────
  async function guardarComentario(id, valor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    updateReg(id, { obsAsesor:valor })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/obs`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:valor }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el comentario')
      } catch (e) {
        updateReg(id, { obsAsesor:reg.obsAsesor })
        mostrarToast(e.message || 'No se pudo guardar el comentario')
      }
    }
  }

  // ── Editar contacto (campaña / N1 / N2 / usuario WhatsApp) ─────────────
  function abrirModalEditarContacto(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalEditarContacto({ open:true, regId:id, campana:reg.campana==='—'?'':reg.campana, n1:reg.n1||'', n2:reg.n2||'', usuarioWhatsapp:reg.usuarioWhatsapp||'', guardando:false })
  }

  async function guardarEdicionContacto() {
    const { regId, campana, n1, n2, usuarioWhatsapp } = modalEditarContacto
    const found = findReg(regId)
    if (!found) return
    const { reg } = found
    if (!n1.trim() && !usuarioWhatsapp.trim()) { mostrarToast('Ingresa un N1 o un usuario de WhatsApp'); return }
    setModalEditarContacto(p => ({ ...p, guardando:true }))
    const anteriores = { campana:reg.campana, n1:reg.n1, n2:reg.n2, usuarioWhatsapp:reg.usuarioWhatsapp }
    updateReg(regId, { campana:campana.trim()||'—', n1:n1.trim(), n2:n2.trim(), usuarioWhatsapp:usuarioWhatsapp.trim() })
    try {
      if (reg._backendId) {
        const res  = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/datos-back`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ campana:campana.trim(), n1:n1.trim(), n2:n2.trim(), usuario_whatsapp:usuarioWhatsapp.trim() }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar el contacto')
      }
      setModalEditarContacto({ open:false, regId:null, campana:'', n1:'', n2:'', usuarioWhatsapp:'', guardando:false })
    } catch (e) {
      updateReg(regId, anteriores)
      setModalEditarContacto(p => ({ ...p, guardando:false }))
      mostrarToast(e.message || 'No se pudo actualizar el contacto')
    }
  }

  function abrirModalEntrevista(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalEntrevista({ open:true, regId:id, nombrePostulante:'', numero:reg.n1||'', numeroRef:reg.n2||'', turno:'', fechaAgendamiento:'', observacion:'', guardando:false, error:'' })
  }

  async function guardarEntrevista() {
    const found = findReg(modalEntrevista.regId)
    if (!found?.reg?._backendId) return
    const nombre = modalEntrevista.nombrePostulante.trim()
    if (!nombre || !modalEntrevista.numero.trim() || !modalEntrevista.turno || !modalEntrevista.fechaAgendamiento) { setModalEntrevista(p=>({...p,error:'Completa nombre, número, turno y fecha'})); return }
    setModalEntrevista(p=>({...p,guardando:true,error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/${found.reg._backendId}/entrevista`, {method:'POST',headers:ncHeaders(),body:JSON.stringify({nombre_postulante:nombre,numero:modalEntrevista.numero.trim(),numero_ref:modalEntrevista.numeroRef.trim(),turno:modalEntrevista.turno,fecha_agendamiento:modalEntrevista.fechaAgendamiento,observacion:modalEntrevista.observacion.trim()})})
      const data = await res.json().catch(()=>({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje||'No se pudo agendar')
      setModalEntrevista(p=>({...p,open:false,guardando:false}))
      mostrarToast('Entrevista agendada')
      cargarEntrevistas()
    } catch(e) { setModalEntrevista(p=>({...p,guardando:false,error:e.message})) }
  }

  // ── Modal rotación manual ─────────────────────────────────────────────────
  function abrirModalRotar(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalRotar({ open:true, regId:id, desc:`N1: ${reg.n1} — Asesor actual: ${reg.asesor||'Sin asignar'}`, asesorActual:reg.asesor })
    setRotModalAsesor('')
    setRotBusqueda('')
    setRotModalMotivo('')
  }

  async function confirmarRotacion() {
    if (!rotModalAsesor) return
    const found = findReg(modalRotar.regId)
    if (!found) return
    const { reg } = found
    const hora    = horaAhora()
    const motivo  = rotModalMotivo.trim() || 'Rotacion manual'
    const newHist = [...reg.historial, { tipo:'ROTACION', asesor:rotModalAsesor, hora, fecha:fechaHoy(), motivo, rotadoPor:sesion?.nombre||'Usuario', tipifVendAntes:reg._tipifVend||'' }]
    updateReg(modalRotar.regId, { asesor:rotModalAsesor, horaAsig:hora, sinAsignar:false, rotaciones:reg.rotaciones+1, historial:newHist })
    try {
      if (reg._backendId) {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:rotModalAsesor, hora_asig:hora, historial:newHist, sumarRotacion:true }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo rotar el lead')
      }
      setModalRotar({ open:false, regId:null, desc:'', asesorActual:'' })
    } catch (e) {
      updateReg(modalRotar.regId, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, rotaciones:reg.rotaciones, historial:reg.historial })
      mostrarToast(e.message || 'No se pudo rotar el lead')
    }
  }

  // ── Rotation panel ────────────────────────────────────────────────────────
  function buildRotLeads() {
    const ahora = new Date()
    const list  = []
    const fechas = rotFiltroFecha ? [rotFiltroFecha] : Object.keys(baseData).sort().reverse()
    fechas.forEach(fecha => {
      (baseData[fecha]||[]).forEach(reg => {
        let ultimaAsig = new Date(fecha+'T'+(reg.horaAsig||'00:00')+':00')
        if (isNaN(ultimaAsig)) ultimaAsig = new Date(ahora.getTime() - 24*3600000)
        list.push({ id:reg.id, tel:reg.n1, campana:reg.campana, n2:reg.n2||'', estado:reg.tipifBack||'Nuevo', tipifVend:reg._tipifVend||'', prohibido:esLeadProhibido(reg), asesor:reg.asesor||'', ultimaAsig, fecha, histAsesores:reg.historial.map(h=>h.asesor), _reg:reg })
      })
    })
    return list
  }

  function rotApto(lead, asesor) {
    const ahora = new Date()
    const prohibido = !!lead.prohibido
    if (prohibido) return { apto:false, prohibido:true, sinRepetir:false, tiempo:false, estadoOk:false }
    if (!asesor) return { apto:false, prohibido:false }
    const sinRepetir = !lead.histAsesores.includes(asesor)
    const mins = Math.floor((ahora - lead.ultimaAsig)/60000)
    const tiempo = mins >= 120
    const estadoOk = ['Buzon','No contesta','Nuevo','BUZON','NO CONTESTA',''].includes(lead.estado)
    if (!lead.asesor) return { apto:sinRepetir, prohibido:false, sinRepetir, tiempo:true, estadoOk:true }
    return { apto:sinRepetir&&tiempo&&estadoOk, prohibido:false, sinRepetir, tiempo, estadoOk }
  }

  function rotMins(f) { return Math.floor((new Date() - f)/60000) }
  function rotTxt(f) { const m=rotMins(f); if(m<60) return m+' min'; const h=Math.floor(m/60),r=m%60; return h+'h'+(r>0?' '+r+'min':'') }

  async function rotFinalizarWith(selToUse, asesorActual) {
    const hora     = horaAhora()
    const allLeads = buildRotLeads()
    // Se valida otra vez al ejecutar para impedir selecciones antiguas o cambios
    // de tipificación ocurridos mientras el panel estaba abierto.
    const rotados  = allLeads.filter(l => selToUse[l.id] && rotApto(l, asesorActual).apto)
    const res = []
    for (const l of rotados) {
      const reg = l._reg
      const newHist = [...reg.historial, { asesor:asesorActual, hora, fecha:fechaHoy(), motivo:'Rotacion masiva' }]
      updateReg(reg.id, { asesor:asesorActual, horaAsig:hora, sinAsignar:false, rotaciones:(reg.rotaciones||0)+1, historial:newHist })
      try {
        if (reg._backendId) {
          const respuesta = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:asesorActual, hora_asig:hora, historial:newHist, sumarRotacion:true }) })
          const data = await respuesta.json().catch(() => ({}))
          if (!respuesta.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo rotar')
        }
        res.push({ tel:reg.n1, asesor:asesorActual, hora })
      } catch (e) {
        updateReg(reg.id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, rotaciones:reg.rotaciones, historial:reg.historial })
        res.push({ tel:reg.n1, asesor:'ERROR: '+(e.message || 'no guardado'), hora:'—' })
      }
    }
    setRotRotados(prev => prev + res.filter(item => !String(item.asesor).startsWith('ERROR:')).length)
    setRotResultado(res)
    setRotSel({})
  }

  async function rotEjecutar() {
    if (!rotAsesor) return
    const asesorActual = rotAsesor
    let selToUse = { ...rotSel }
    if (Object.keys(selToUse).length === 0) {
      const aptos = buildRotLeads().filter(l => rotApto(l, asesorActual).apto).slice(0, rotCant)
      if (!aptos.length) { mostrarToast('No hay leads aptos para ' + asesorActual); return }
      const newSel = {}
      aptos.forEach(l => { newSel[l.id] = true })
      setRotSel(newSel)
      selToUse = newSel
    }
    setRotProgress(25)
    setTimeout(() => setRotProgress(50), 200)
    setTimeout(() => setRotProgress(75), 400)
    setTimeout(async () => {
      await rotFinalizarWith(selToUse, asesorActual)
      setRotProgress(100)
      setTimeout(() => setRotProgress(0), 1000)
    }, 600)
  }

  function rotToggleSel(id, checked) {
    const selCount = Object.values(rotSel).filter(Boolean).length
    if (checked) {
      if (selCount >= rotCant) { mostrarToast('Maximo '+rotCant+' leads'); return }
      setRotSel(prev => ({ ...prev, [id]:true }))
    } else {
      setRotSel(prev => { const n={...prev}; delete n[id]; return n })
    }
  }

  // ── Carga masiva ──────────────────────────────────────────────────────────
  function obtenerN1Existentes() {
    const set = new Set()
    for (const f in baseData) (baseData[f]||[]).forEach(r => { if(r.n1) set.add(String(r.n1).replace(/\s+/g,'')) })
    return set
  }

  function previsualizarMasiva() {
    const raw = masivaNums.trim()
    if (!raw) { mostrarToast('Pega numeros primero'); return }
    const numsRaw = raw.split(/[\n,;]+/).map(n=>n.trim().replace(/\s+/g,'')).filter(n=>n.length>=7)
    if (!numsRaw.length) { mostrarToast('No se encontraron numeros validos'); return }
    const lote = masivaLote === '0' ? numsRaw.length : (parseInt(masivaLote) || 10)
    const numsLote   = numsRaw.slice(0, lote)
    const existentes = obtenerN1Existentes()
    const vistos = new Set()
    const filas  = []
    numsLote.forEach(n => {
      let dup=false, motivo=''
      if (vistos.has(n)) { dup=true; motivo='Repetido en la lista' }
      else if (existentes.has(n)) { dup=true; motivo='Ya esta en el sistema' }
      vistos.add(n)
      filas.push({ n1:n, dup, motivo })
    })
    setMasivaFilas(filas)
    setInclDup(false)
  }

  async function ejecutarCargaMasiva() {
    const lista = (inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)).map(f=>f.n1)
    if (!lista.length) { mostrarToast('No hay numeros para cargar'); return }
    const campana = masivaCamp.trim() || '—'
    const asesor  = masivaAsesor
    const hora    = asesor ? horaAhora() : ''
    const fecha   = fechaActiva
    const pendientes = lista.filter(n1 => !(baseData[fecha]||[]).find(r=>r.n1===n1))
    const CHUNK = 400
    let importados = 0
    let errorMsg = ''
    for (let i = 0; i < pendientes.length; i += CHUNK) {
      const lote = pendientes.slice(i, i + CHUNK)
      const leadsParaBackend = lote.map(n1 => ({ campana, distrito:'—', n1, n2:'', tipif_back:'', asesor_nombre:asesor, fecha, hora_asig:hora }))
      try {
        const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(leadsParaBackend) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) { errorMsg = data.mensaje || `Error del servidor (${res.status})`; break }
        const nuevosRegs = lote.map(n1 => ({ id:idCntRef.current++, _backendId:null, campana, distrito:'—', n1, n2:'', tipifBack:'', asesor, horaAsig:hora, sinAsignar:!asesor, rotaciones:0, _tipifVend:'', _tipifHora:'', historial:asesor?[{asesor,hora,fecha,motivo:'Carga masiva'}]:[] }))
        setBaseData(prev => {
          const arr = [...(prev[fecha]||[]), ...nuevosRegs]
          const off = arr.length - nuevosRegs.length
          if (Array.isArray(data.ids)) data.ids.forEach((bid,i) => { if(arr[off+i]) arr[off+i]={...arr[off+i],_backendId:bid} })
          return { ...prev, [fecha]:arr }
        })
        setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
        importados += lote.length
      } catch (e) {
        errorMsg = 'Error de conexión con el servidor'
        break
      }
    }
    if (errorMsg) mostrarToast(`Se importaron ${importados} de ${pendientes.length}. ${errorMsg}`)
    else if (importados) mostrarToast(`${importados} registro(s) importado(s) correctamente`)
    setMasivaNums(''); setMasivaFilas([]); setInclDup(false)
  }

  function procesarArchivo(file) {
    setArchivoStatus(`Leyendo ${file.name}...`)
    const reader = new FileReader()
    reader.onload = e => {
      const text   = e.target.result
      const lineas = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0)
      if (!lineas.length) { setArchivoStatus('Archivo vacio'); return }
      const sep  = lineas[0].includes('\t')?'\t':lineas[0].includes(';')?';':','
      const p0   = lineas[0].split(sep)[0].trim()
      const cab  = (isNaN(p0.replace(/\s/g,''))&&p0.length>0&&!/^\d{7,}$/.test(p0)) ? lineas[0].split(sep).map(c=>c.trim().toLowerCase()) : null
      const datos= cab ? lineas.slice(1) : lineas
      const iN1  = cab ? (cab.findIndex(c=>c.includes('n1')||c.includes('numero')||c.includes('telefono'))) : 0
      const iN2  = cab ? cab.findIndex(c=>c.includes('n2')) : -1
      const iCamp= cab ? cab.findIndex(c=>c.includes('camp')||c.includes('zona')) : -1
      const iDist= cab ? cab.findIndex(c=>c.includes('dist')) : -1
      const iTip = cab ? cab.findIndex(c=>c.includes('tipif')||c.includes('estado')) : -1
      const rows = datos.map(linea => {
        const cols = linea.split(sep).map(c=>c.trim().replace(/^["']|["']$/g,''))
        const n1   = cols[iN1>=0?iN1:0]||''
        if (!n1||n1.length<6) return null
        return { n1, n2:iN2>=0?(cols[iN2]||''):'', camp:iCamp>=0?(cols[iCamp]||'—'):'—', dist:iDist>=0?(cols[iDist]||'—'):'—', tipif:iTip>=0?(cols[iTip]||''):'' }
      }).filter(Boolean)
      if (!rows.length) { setArchivoStatus('No se encontraron registros validos'); return }
      setArchivoRows(rows); setArchivoInfo(`${rows.length} registros en "${file.name}"`); setArchivoStatus('')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function ejecutarCargaArchivo() {
    if (!archivoRows.length) { mostrarToast('No hay datos'); return }
    const fecha = fechaActiva
    const pendientes = archivoRows.filter(r => !(baseData[fecha]||[]).find(x=>x.n1===r.n1))
    const omitidos = archivoRows.length - pendientes.length
    const CHUNK = 400
    let importados = 0
    let errorMsg = ''
    for (let i = 0; i < pendientes.length; i += CHUNK) {
      const lote = pendientes.slice(i, i + CHUNK)
      const leadsBackend = lote.map(r => ({ campana:r.camp, distrito:r.dist, n1:r.n1, n2:r.n2, tipif_back:r.tipif, asesor_nombre:'', fecha, hora_asig:'' }))
      try {
        const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(leadsBackend) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) { errorMsg = data.mensaje || `Error del servidor (${res.status})`; break }
        const nuevos = lote.map(r => ({ id:idCntRef.current++, _backendId:null, campana:r.camp, distrito:r.dist, n1:r.n1, n2:r.n2, tipifBack:r.tipif, asesor:'', horaAsig:'', sinAsignar:true, rotaciones:0, _tipifVend:'', _tipifHora:'', historial:[] }))
        setBaseData(prev => ({ ...prev, [fecha]:[...(prev[fecha]||[]), ...nuevos] }))
        importados += lote.length
      } catch (e) {
        errorMsg = 'Error de conexión con el servidor'
        break
      }
    }
    if (errorMsg) mostrarToast(`Se importaron ${importados} de ${pendientes.length}${omitidos?` (${omitidos} ya existían)`:''}. ${errorMsg}`)
    else mostrarToast(`${importados} registro(s) importado(s)${omitidos?`, ${omitidos} ya existían`:''}`)
    setArchivoRows([]); setArchivoInfo(''); setArchivoStatus('')
    if (archivoInputRef.current) archivoInputRef.current.value = ''
  }

  // La fecha final de cada fila se resuelve en resolverFechaFila(), leyendo
  // legacyFecha/legacyUsarFecha EN VIVO — no aqui. Antes se "horneaba" la
  // fecha una sola vez al leer el archivo, asi que si el usuario cambiaba
  // el selector "Fecha destino" DESPUES de soltar el archivo (el flujo
  // normal: primero se ve la vista previa, despues se ajusta la fecha), el
  // cambio no se reflejaba y todo se subia con la fecha vieja (o con hoy,
  // el valor por defecto de legacyFecha).
  function procesarLegacy(file) {
    setLegacyStatus(`Leyendo ${file.name}...`)
    const reader = new FileReader()
    reader.onload = e => {
      const text   = e.target.result
      const lineas = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0)
      if (!lineas.length) { setLegacyStatus('Archivo vacio'); return }
      const sep   = lineas[0].includes('\t')?'\t':lineas[0].includes(';')?';':','
      const prim  = lineas[0].split(sep)
      const cab   = isNaN((prim[3]||'').replace(/\s/g,''))||(prim[3]||'').length<6
      const datos = cab ? lineas.slice(1) : lineas
      // Formato original: CAMPAÑA·DISTRITO·N2·N1·TIPIF.BACK·COMENTARIO·TIPIFICACIÓN·HORA·ASESOR1..6
      // Formato "corregido": CAMPAÑA·FECHA·CONTACTO·OBSERVACIONES·TIPIFICACIÓN·HORA·ASESOR1..6
      // (sin DISTRITO/N2/TIPIF.BACK, con una columna FECHA real por fila).
      // Se detecta por los nombres del encabezado para no romper el formato ya usado.
      const encabezados = cab ? prim.map(c=>c.trim().toUpperCase()) : []
      const esFormatoCorregido = encabezados.includes('CONTACTO') && encabezados.includes('FECHA') && !encabezados.includes('DISTRITO')
      const rows   = []
      datos.forEach(linea => {
        const c = linea.split(sep).map(x=>x.trim().replace(/^["']|["']$/g,''))
        const campana = c[0]||'—'
        let n1, distrito, n2, tipifBack, comentario, tipifVend, hora, asesorInicio, fechaFilaRaw
        if (esFormatoCorregido) {
          fechaFilaRaw = c[1]||''
          n1 = c[2]||''
          distrito = '—'; n2 = ''; tipifBack = ''
          comentario = c[3]||''
          tipifVend  = c[4]||''
          hora       = c[5]||''
          asesorInicio = 6
        } else {
          fechaFilaRaw = ''
          n1 = c[3]||c[0]||''
          distrito = c[1]||'—'; n2 = c[2]||''; tipifBack = c[4]||''
          comentario = c[5]||''
          tipifVend  = c[6]||''
          hora       = c[7]||''
          asesorInicio = 8
        }
        if (!n1||n1.length<6) return
        const asesoresHist = []
        for (let i=asesorInicio;i<=asesorInicio+5;i++) { const a=(c[i]||'').trim(); if(a&&a.length>1) asesoresHist.push(a) }
        // Fecha propia de la fila (formato "corregido"): siempre es la real,
        // sin importar el selector.
        let fechaPropia = ''
        if (esFormatoCorregido && fechaFilaRaw) {
          const m = fechaFilaRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
          if (m) fechaPropia = `${m[3]}-${m[2]}-${m[1]}`
          else if (/^\d{4}-\d{2}-\d{2}$/.test(fechaFilaRaw)) fechaPropia = fechaFilaRaw
        }
        // Fecha detectada en cualquier celda de la fila (formato original con
        // "Usar fecha de la fila"): se detecta siempre, se aplica solo si el
        // selector correspondiente esta en "si" al momento de resolver.
        let fechaDetectada = ''
        if (!esFormatoCorregido) {
          for (let i=0;i<c.length;i++) { const m=c[i].match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(m){fechaDetectada=`${m[3]}-${m[2]}-${m[1]}`;break;} if(/^\d{4}-\d{2}-\d{2}$/.test(c[i])){fechaDetectada=c[i];break;} }
        }
        rows.push({ campana, distrito, n2, n1, tipifBack, comentario, tipifVend, hora, asesores:asesoresHist, _fechaPropia:fechaPropia, _fechaDetectada:fechaDetectada })
      })
      if (!rows.length) { setLegacyStatus('No se encontraron filas validas'); return }
      setLegacyRows(rows); setLegacyInfo(`${rows.length} registros desde "${file.name}"`); setLegacyStatus('')
    }
    reader.readAsText(file, 'UTF-8')
  }
  // Resuelve la fecha final de una fila leyendo el estado actual de los
  // selectores — se llama tanto para la vista previa como para el envio,
  // asi que cambiar "Fecha destino" despues de soltar el archivo si tiene
  // efecto.
  function resolverFechaFila(r) {
    if (r._fechaPropia) return r._fechaPropia
    if (legacyUsarFecha === 'si' && r._fechaDetectada) return r._fechaDetectada
    return legacyFecha || fechaActiva
  }
  const legacyRowsResueltos = useMemo(
    () => legacyRows.map(r => ({ ...r, fecha: resolverFechaFila(r) })),
    [legacyRows, legacyFecha, legacyUsarFecha, fechaActiva]
  )

  async function ejecutarCargaLegacy() {
    if (!legacyRowsResueltos.length) { mostrarToast('No hay datos'); return }
    // El backend rechaza lotes de más de 500 registros (y el rechazo es de
    // todo-o-nada), así que se parte en tandas para no perder la importación
    // completa por exceder el límite. Antes esto fallaba en silencio: la
    // pantalla mostraba las filas como importadas aunque el servidor las
    // hubiera rechazado, y desaparecían al recargar.
    const CHUNK = 400
    let importados = 0
    let errorMsg = ''
    const nuevasFechasLocal = []
    // El nombre corto del CSV (ej. "LUCERO") no siempre tiene cuenta real en
    // PRIZMA. El backend ahora lo guarda tal cual como referencia aunque no
    // resuelva a un usuario real (queda sin asesor_id, sin permisos de
    // gestión). Se manda el último de la lista como asesor actual y el resto
    // queda en el historial de rotaciones.
    for (let i = 0; i < legacyRowsResueltos.length; i += CHUNK) {
      const lote = legacyRowsResueltos.slice(i, i + CHUNK)
      const leadsBackend = lote.map(r => {
        const asesorFinal = r.asesores[r.asesores.length - 1] || ''
        const historial = r.asesores.map((a, idx) => ({ asesor:a, hora:r.hora||'—', fecha:r.fecha, motivo: idx===0 ? 'Asignacion inicial' : `Rotacion ${idx}` }))
        return {
          campana:r.campana, distrito:r.distrito, n1:r.n1, n2:r.n2,
          tipif_back:r.tipifBack, tipif_vend:r.tipifVend, obs_asesor:r.comentario,
          asesor_nombre:asesorFinal, fecha:r.fecha, hora_asig:r.hora,
          historial,
        }
      })
      try {
        const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(leadsBackend) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) { errorMsg = data.mensaje || `Error del servidor (${res.status})`; break }
        const updates = {}
        lote.forEach(r => {
          const fecha = r.fecha
          if (!fechaPestanas.includes(fecha) && !nuevasFechasLocal.includes(fecha)) nuevasFechasLocal.push(fecha)
          if (!updates[fecha]) updates[fecha] = []
          const asesorFinal = r.asesores[r.asesores.length - 1] || ''
          // Permitir duplicados: no se descartan números repetidos en la carga del sistema antiguo.
          const hist = r.asesores.map((a,idx)=>({ asesor:a, hora:r.hora||'—', fecha, motivo:idx===0?'Asignacion inicial':`Rotacion ${idx}` }))
          updates[fecha].push({ id:idCntRef.current++, _backendId:null, campana:r.campana, distrito:r.distrito, n1:r.n1, n2:r.n2, tipifBack:r.tipifBack, obsAsesor:r.comentario||'', asesor:asesorFinal, horaAsig:r.hora, sinAsignar:!asesorFinal, rotaciones:Math.max(0,r.asesores.length-1), _tipifVend:r.tipifVend||'', _tipifHora:r.tipifVend?(r.hora||''):'', historial:hist })
        })
        setBaseData(prev => { const n={...prev}; for(const f in updates) n[f]=[...(prev[f]||[]),...updates[f]]; return n })
        importados += lote.length
      } catch (e) {
        errorMsg = 'Error de conexión con el servidor'
        break
      }
    }
    setFechaPestanas(prev => [...prev, ...nuevasFechasLocal.filter(f=>!prev.includes(f))].sort().reverse())
    if (errorMsg) mostrarToast(`Se importaron ${importados} de ${legacyRowsResueltos.length}. ${errorMsg}`)
    else mostrarToast(`${importados} registro(s) importado(s) correctamente`)
    setLegacyRows([]); setLegacyInfo(''); setLegacyStatus('')
    if (legacyInputRef.current) legacyInputRef.current.value = ''
  }

  // ── BL Modal ──────────────────────────────────────────────────────────────
  function abrirBlModal(nombre, asesorId) {
    setBlModal({ open:true, nombre, asesorId })
    setBlFecha(fechaHoy())
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const todosLosRegistros = useMemo(() => Object.values(baseData).flat(), [baseData])
  const registrosActivos = filtros.global
    ? todosLosRegistros
    : (filtros.desde || filtros.hasta)
      ? todosLosRegistros.filter(r => (!filtros.desde || r.fecha >= filtros.desde) && (!filtros.hasta || r.fecha <= filtros.hasta))
      : (baseData[fechaActiva] || [])

  const n1Duplicados = useMemo(() => {
    const cont = {}
    todosLosRegistros.forEach(r => { const k = (r.n1||'').trim(); if (k) cont[k] = (cont[k]||0) + 1 })
    return new Set(Object.keys(cont).filter(k => cont[k] > 1))
  }, [todosLosRegistros])

  const campanasDisponibles = useMemo(() => {
    const set = new Set()
    todosLosRegistros.forEach(r => { if (r.campana && r.campana !== '—') set.add(r.campana) })
    return Array.from(set).sort()
  }, [todosLosRegistros])

  const registrosFiltrados0 = registrosActivos.filter(r => {
    if (filtros.tip    && !(r.tipifBack||'').toUpperCase().includes(filtros.tip.toUpperCase())) return false
    if (filtros.tipVend&& normalizarTipifVendSelect(r._tipifVend) !== filtros.tipVend.toUpperCase())  return false
    if (filtros.asesor && !(r.asesor||'').toUpperCase().includes(filtros.asesor.toUpperCase())) return false
    if (filtros.campana&& r.campana !== filtros.campana) return false
    if (filtros.numero && !r.n1.includes(filtros.numero) && !(r.n2||'').includes(filtros.numero) && !(r.usuarioWhatsapp||'').toUpperCase().includes(filtros.numero.toUpperCase())) return false
    if (filtros.duplicados && !n1Duplicados.has((r.n1||'').trim())) return false
    return true
  })

  function baseSortVal(r, col) {
    switch (col) {
      case 'campana': return r.campana || ''
      case 'asesor':  return r.asesor || ''
      case 'tipVend': return r._tipifVend || ''
      case 'hora':    return `${r.fecha||''} ${r.horaAsig||''}`
      case 'rotac':   return r.rotaciones || 0
      default: return 0
    }
  }
  const registrosFiltrados = baseSort.col
    ? [...registrosFiltrados0].sort((a,b) => {
        const va = baseSortVal(a, baseSort.col), vb = baseSortVal(b, baseSort.col)
        const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric:true })
        return baseSort.dir === 'desc' ? -cmp : cmp
      })
    : registrosFiltrados0
  function toggleBaseSort(col) {
    setBaseSort(prev => prev.col === col ? { col, dir: prev.dir==='asc'?'desc':'asc' } : { col, dir:'asc' })
  }
  function ordenarBaseDelDia() {
    setBaseSort(prev => prev.col === 'hora' ? { col:'hora', dir: prev.dir==='asc'?'desc':'asc' } : { col:'hora', dir:'desc' })
  }
  function baseTh(col, label, thStyle) {
    const activo = baseSort.col === col
    return (
      <th onClick={()=>toggleBaseSort(col)} style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', ...thStyle }} title="Ordenar">
        <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
          {label}
          <span style={{ fontSize:9, lineHeight:1, color: activo ? '#6d28d9' : '#cbd5e1' }}>{activo ? (baseSort.dir==='asc'?'▲':'▼') : '⇅'}</span>
        </span>
      </th>
    )
  }

  const statsBase = {
    total:      registrosActivos.length,
    ventas:     registrosActivos.filter(r=>(r.tipifBack||'').toUpperCase().includes('VENTA')).length,
    asignados:  registrosActivos.filter(r=>r.asesor&&r.asesor!=='').length,
    sinAsignar: registrosActivos.filter(r=>r.sinAsignar).length,
    rotaciones: registrosActivos.reduce((s,r)=>s+r.rotaciones,0),
  }

  const rendData = useMemo(() => {
    const mesActual = fechaHoy().slice(0,7)
    let todosReg = []
    for (const f in baseData) {
      if (rendFiltroTipo==='mes'   && !f.startsWith(mesActual))           continue
      if (rendFiltroTipo==='dia'   && f!==rendFiltroFecha)                continue
      if (rendFiltroTipo==='rango' && rendDesde && f < rendDesde)         continue
      if (rendFiltroTipo==='rango' && rendHasta && f > rendHasta)         continue
      todosReg = todosReg.concat(baseData[f])
    }
    const data = asesores.map(a => {
      const regs    = todosReg.filter(r=>(r.asesor||'').trim().toLowerCase()===(a.nombre||'').trim().toLowerCase())
      const leads   = regs.length
      const contesta= regs.filter(r=>['CONTESTA','VENTA CERRADA','PREVENTA','AGENDADO'].includes((r._tipifVend||'').toUpperCase())).length
      const nc      = regs.filter(r=>['NC','NO CONTESTA','BUZON DE VOZ'].includes((r._tipifVend||'').toUpperCase())).length
      const ventas  = regs.filter(r=>(r._tipifVend||'').toUpperCase()==='VENTA CERRADA').length
      const conv    = leads ? Math.round(ventas/leads*100) : 0
      return { nombre:a.nombre, usuario:a.usuario||'', leads, contesta, nc, ventas, conv }
    })
    const sortMap = { 'ventas_desc':(a,b)=>b.ventas-a.ventas,'ventas_asc':(a,b)=>a.ventas-b.ventas,'conv_desc':(a,b)=>b.conv-a.conv,'leads_desc':(a,b)=>b.leads-a.leads,'contesta_desc':(a,b)=>b.contesta-a.contesta,'nc_desc':(a,b)=>b.nc-a.nc }
    data.sort(sortMap[rendOrden] || sortMap['ventas_desc'])
    return data
  }, [baseData, asesores, rendFiltroTipo, rendFiltroFecha, rendDesde, rendHasta, rendOrden])

  const rendTotLeads  = rendData.reduce((s,r)=>s+r.leads,0)
  const rendTotVentas = rendData.reduce((s,r)=>s+r.ventas,0)
  const rendTotConv   = rendTotLeads ? Math.round(rendTotVentas/rendTotLeads*100) : 0
  const rendMaxVentas = Math.max(...rendData.map(r=>r.ventas), 1)

  const allRotLeads    = rotPanelOpen ? buildRotLeads() : []
  function rotSortVal(l, col) {
    switch (col) {
      case 'n1':     return l.tel || ''
      case 'fecha':  return l.fecha || ''
      case 'tipif':  return l.estado || 'NUEVO'
      case 'asesor': return l.asesor || ''
      case 'rotac':  return Math.max(l._reg?.rotaciones || 0, Math.max(0, (l.histAsesores?.length || 0) - 1))
      case 'hora':
      case 'tiempo': return l.ultimaAsig instanceof Date ? l.ultimaAsig.getTime() : 0
      case 'sinrepetir': return rotApto(l, rotAsesor).sinRepetir ? 1 : 0
      case 'aptitud':    return rotApto(l, rotAsesor).apto ? 1 : 0
      default: return 0
    }
  }
  const allRotLeadsSorted = rotSort.col
    ? [...allRotLeads].sort((a, b) => {
        const va = rotSortVal(a, rotSort.col), vb = rotSortVal(b, rotSort.col)
        const cmp = (typeof va === 'number' && typeof vb === 'number')
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { numeric:true })
        return rotSort.dir === 'desc' ? -cmp : cmp
      })
    : allRotLeads
  function toggleRotSort(col) {
    setRotSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir:'asc' })
  }
  function rotTh(col, label, thStyle) {
    const activo = rotSort.col === col
    return (
      <th onClick={()=>toggleRotSort(col)} style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', ...thStyle }} title="Ordenar">
        <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
          {label}
          <span style={{ fontSize:9, lineHeight:1, color: activo ? '#6d28d9' : '#cbd5e1' }}>{activo ? (rotSort.dir==='asc'?'▲':'▼') : '⇅'}</span>
        </span>
      </th>
    )
  }
  const rotStatAptos   = allRotLeads.filter(l=>rotApto(l,rotAsesor).apto).length
  const rotStatNoAptos = allRotLeads.length - rotStatAptos
  const rotAptos       = allRotLeads.filter(l=>rotApto(l,rotAsesor).apto)
  const allAptosSelected = rotAptos.length > 0 && rotAptos.every(l=>rotSel[l.id])
  const rotFechasDisp  = Object.keys(baseData).filter(f=>(baseData[f]||[]).length>0).sort().reverse()
  const rotAsesoresDisp= asesores.map(a=>({ nombre:a.nombre, cnt:Object.values(baseData).flat().filter(r=>r.asesor===a.nombre).length }))
  const masivaFilasParaCargar = inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)
  const masivaNDup    = masivaFilas.filter(f=>f.dup).length
  const masivaFilasCnt= masivaFilas.length
  const avanceFiltrado= asesores.filter(a => !avanceBuscar || a.nombre.toLowerCase().includes(avanceBuscar.toLowerCase()) || (a.usuario||'').toLowerCase().includes(avanceBuscar.toLowerCase()))

  const idx      = fechaPestanas.indexOf(fechaActiva)
  const prevDis  = idx >= fechaPestanas.length - 1
  const nextDis  = idx <= 0

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="bo-root">
      {/* TOPBAR */}
      <div className="topbar module-topbar-standard">
        <div className="bo-topbar-left">
          <div className="brand">
            <div className="logo-circle"><img src="/assets/logo3.png" alt="PRIZMA" /></div>
            <div className="brand-text">
              <span style={{fontSize:22,fontWeight:800,letterSpacing:"0.08em",lineHeight:1}}>PRIZMA</span>
              <span className="brand-sub">Back Data Reclutaminto</span>
            </div>
          </div>
          <button
            type="button"
            className={`bo-sidebar-toggle${sidebarAbierto ? ' abierto' : ''}`}
            aria-label={sidebarAbierto ? 'Ocultar menú' : 'Mostrar menú'}
            title={sidebarAbierto ? 'Ocultar menú' : 'Mostrar menú'}
            onClick={() => setSidebarAbierto(valor => {
              const nuevo = !valor
              sessionStorage.setItem('nc_backoffice_sidebar', nuevo ? 'abierto' : 'cerrado')
              return nuevo
            })}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="2.5" width="13" height="13" rx="2.5"/><path d="M7 3v12"/></svg>
          </button>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls><span className="bo-usuario">{sesion?.nombre || 'Back Data'}</span></JefaturaViewControls>
          <CambiarAreaMenu />
          <a href="#" className="bo-salir" onClick={e=>{ e.preventDefault(); logout(); navigate('/') }}>Salir</a>
        </div>
      </div>

      <div className={`bo-layout${sidebarAbierto ? '' : ' sidebar-cerrado'}`}>
        {/* SIDEBAR */}
        <aside className={`bo-sidebar${sidebarAbierto ? '' : ' cerrado'}`} aria-hidden={!sidebarAbierto}>
          <div className="sidebar-sep">Principal</div>
          <button className={`bo-nav${seccion==='base'?' active':''}`} onClick={()=>irSeccion('base')}><BoNavIcon tipo="base" /> <span>Base</span></button>
          <button className={`bo-nav${seccion==='reclutados'?' active':''}`} onClick={()=>irSeccion('reclutados')}><BoNavIcon tipo="avance" /> <span>Reclutados</span></button>
          <button className={`bo-nav${seccion==='carga-masiva'?' active':''}`} onClick={()=>irSeccion('carga-masiva')}><BoNavIcon tipo="carga" /> <span>Carga Masiva</span></button>
          <button className={`bo-nav${seccion==='entrevistas'?' active':''}`} onClick={()=>irSeccion('entrevistas')}><BoNavIcon tipo="avance" /> <span>Entrevistas</span></button>
          <button className={`bo-nav${seccion==='capacitacion'?' active':''}`} onClick={()=>irSeccion('capacitacion')}><BoNavIcon tipo="avance" /> <span>Capacitación</span></button>

          {seccion==='base' && (
            <div className="bo-sidebar-add">
              <div className="sidebar-sep">Agregar registro</div>
              <div className="bo-sidebar-add-fecha">{formatFecha(fechaActiva)}</div>
              <div className="bo-input-group"><label>Campaña</label><CampanaSelect value={form.campana} onChange={v=>setForm(p=>({...p,campana:v}))} /></div>
              <div className="bo-input-group"><label>N1</label><input className={`form-control${n1Error?' obligatorio-error':''}`} value={form.n1} onChange={e=>{ setN1Error(false); setForm(p=>({...p,n1:e.target.value})) }} placeholder="Número principal" style={{fontFamily:'monospace'}} /></div>
              <div className="bo-input-group"><label>N2 (opcional)</label><input className="form-control" value={form.n2} onChange={e=>setForm(p=>({...p,n2:e.target.value}))} placeholder="Número secundario" style={{fontFamily:'monospace'}} /></div>
              <div className="bo-input-group"><label>Usuario WhatsApp</label><input className={`form-control${n1Error?' obligatorio-error':''}`} value={form.usuarioWhatsapp} onChange={e=>{ setN1Error(false); setForm(p=>({...p,usuarioWhatsapp:e.target.value})) }} placeholder="Si no tiene N1, ej. usuario_clie" /></div>
              <div className="bo-sidebar-add-btns">
                <button className="bo-btn-limpiar btn btn-sm" onClick={()=>setForm({campana:'',distrito:'',n1:'',n2:'',usuarioWhatsapp:'',asesor:''})}>Limpiar</button>
                <button className="bo-btn-agregar" onClick={agregarRegistro}>+ Agregar</button>
              </div>
            </div>
          )}
        </aside>

        <main className="bo-main">

          {/* ══ SECCIÓN: BASE ══════════════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='base'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Base de Llamadas</h2>
                <p className="bo-sub">Gestiona y asigna contactos. La tipificación del vendedor se actualiza automáticamente.</p>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'#9ca3af',fontWeight:600}}>{statsBase.total} registros</span>
              </div>
            </div>

            {/* PANEL ROTACIÓN */}
            {rotPanelOpen && (
              <div style={{marginBottom:14}}>
                <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                  <div style={{background:'#111827',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{color:'#fff',fontSize:13,fontWeight:600}}>Rotación Inteligente de Leads</span>
                    <button onClick={()=>setRotPanelOpen(false)} style={{background:'rgba(255,255,255,.15)',border:'none',color:'#fff',padding:'3px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Cerrar ✕</button>
                  </div>
                  <div style={{padding:'14px 16px'}}>
                    <div className="rot-header-stats" style={{marginBottom:14}}>
                      <div className="rot-stat"><div className="rot-stat-num">{allRotLeads.length}</div><div className="rot-stat-label">Leads totales</div></div>
                      <div className="rot-stat"><div className="rot-stat-num green">{rotStatAptos}</div><div className="rot-stat-label">Aptos para rotar</div></div>
                      <div className="rot-stat"><div className="rot-stat-num red">{rotStatNoAptos}</div><div className="rot-stat-label">No aptos</div></div>
                      <div className="rot-stat"><div className="rot-stat-num purple">{rotRotados}</div><div className="rot-stat-label">Rotados hoy</div></div>
                    </div>
                    <div className="rot-grid" style={{marginBottom:14}}>
                      <div className="bo-panel" style={{padding:'14px 16px'}}>
                        <div className="bo-panel-title">Reglas de rotación</div>
                        <div className="rot-regla"><div className="rot-regla-icon r-red">✕</div><div><strong>Sin repetir:</strong> el lead no puede ir a un asesor que ya lo tuvo</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-blue">T</div><div><strong>Mínimo 2h</strong> sin ser contactado para rotar</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-green">✓</div><div><strong>Estado válido:</strong> Buzón, No contesta o Nuevo</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-red">!</div><div><strong>Números prohibidos:</strong> NO TOCAR y FRAUDE nunca se asignan ni rotan</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-purple">#</div><div><strong>Máximo 4 leads</strong> por rotación a un mismo asesor</div></div>
                      </div>
                      <div className="bo-panel" style={{padding:'14px 16px'}}>
                        <div className="bo-panel-title">Disponibilidad de asesores</div>
                        {rotAsesoresDisp.map(a=>(
                          <div key={a.nombre} className="rot-asesor-row"><span>{a.nombre}</span><span className="rot-asesor-badge">{a.cnt} registros</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="rot-form" style={{marginBottom:12}}>
                      <div className="rot-form-title">Rotar leads a un asesor</div>
                      <div className="rot-form-row">
                        <div style={{ width:260 }}>
                          <AsesorBuscador value={rotAsesor} asesores={asesores}
                            onChange={v=>{ setRotAsesor(v); setRotSel({}) }}
                            className="form-select" placeholderText="— Seleccionar asesor destino —" emptyLabel="— Ninguno —" />
                        </div>
                        <input type="number" value={rotCant} min={1} max={4} onChange={e=>setRotCant(parseInt(e.target.value)||4)} style={{width:60}} />
                        <span style={{fontSize:12,color:'#888'}}>leads máx.</span>
                        <button className="btn-rotar-masivo" onClick={rotEjecutar} disabled={!rotAsesor || rotProgress>0}>
                          {rotProgress>0 ? 'Rotando...' : 'Rotar ahora'}
                        </button>
                      </div>
                      <div className="rot-progress"><div className="rot-progress-fill" style={{width:`${rotProgress}%`}} /></div>
                    </div>
                    {rotResultado.length > 0 && (
                      <div className="rot-resultado show" style={{marginBottom:12}}>
                        <div className="rot-resultado-title">Rotación ejecutada</div>
                        {rotResultado.map((r,i)=>(
                          <div key={i} className="rot-res-item"><div className="rot-res-dot" /><strong>{r.tel}</strong> → <strong>{r.asesor}</strong> · {r.hora}</div>
                        ))}
                      </div>
                    )}
                    <div className="rot-table-wrap">
                      <div className="rot-table-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          Leads disponibles <span className="tag-aptos">{rotStatAptos} aptos</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <label style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Fecha:</label>
                          <select value={rotFiltroFecha} onChange={e=>{ setRotFiltroFecha(e.target.value); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff',cursor:'pointer'}}>
                            <option value="">Todas las fechas</option>
                            {rotFechasDisp.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                          </select>
                          <button onClick={()=>{ setRotFiltroFecha(''); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff',color:'#6b7280',fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>Limpiar</button>
                        </div>
                      </div>
                      <div style={{overflowX:'auto'}} className="rot-table">
                        <table>
                          <thead><tr>
                            <th>
                              <input type="checkbox" checked={allAptosSelected} onChange={e=>{ if(e.target.checked){const ns={};rotAptos.slice(0,rotCant).forEach(l=>{ns[l.id]=true});setRotSel(ns);}else setRotSel({}) }} />
                            </th>
                            {rotTh('n1','N1 / Campaña')}{rotTh('fecha','Fecha')}{rotTh('tipif','Tipificación')}
                            {rotTh('asesor','Asesor actual')}{rotTh('rotac','Rotac.')}{rotTh('hora','Hora asig.')}{rotTh('tiempo','Tiempo')}
                            {rotTh('sinrepetir','Sin repetir')}{rotTh('aptitud','Aptitud')}
                          </tr></thead>
                          <tbody>
                            {allRotLeadsSorted.length === 0
                              ? <tr><td colSpan={10} className="bo-empty">Sin leads.</td></tr>
                              : allRotLeadsSorted.map(l => {
                                  const { apto, prohibido, sinRepetir, tiempo } = rotApto(l, rotAsesor)
                                  const mins = rotMins(l.ultimaAsig)
                                  const esFechaHoy = l.fecha === fechaHoy()
                                  const nRot = Math.max(l._reg?.rotaciones || 0, Math.max(0, (l.histAsesores?.length || 0) - 1))
                                  return (
                                    <tr key={l.id} className={(prohibido||(!apto&&rotAsesor))?'row-noapto':''}>
                                      <td><input type="checkbox" checked={!!rotSel[l.id]} disabled={prohibido||(!apto&&!!rotAsesor)} onChange={e=>rotToggleSel(l.id,e.target.checked)} /></td>
                                      <td><div style={{fontFamily:'monospace',fontWeight:700,color:'#111827',fontSize:12}}>{l.tel}</div><div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{l.campana} · {l.n2||'—'}</div></td>
                                      <td>{esFechaHoy ? <span style={{background:'#dcfce7',color:'#166534',fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:99}}>HOY</span> : <span style={{background:'#f3f4f6',color:'#6b7280',fontSize:9,padding:'1px 6px',borderRadius:99}}>{formatFecha(l.fecha)}</span>}</td>
                                      <td><span className={`tipif-badge ${tipifBadgeClass(prohibido?l.tipifVend:l.estado)}`} style={prohibido?{background:'#ffedd5',color:'#9a3412',fontWeight:800}:{}}>{prohibido?l.tipifVend:(l.estado||'Sin tipif.')}</span></td>
                                      <td style={{fontSize:12}}>{l.asesor}</td>
                                      <td style={{textAlign:'center'}}><span style={{display:'inline-block',minWidth:22,padding:'1px 7px',borderRadius:99,fontSize:11,fontWeight:700,background:nRot>0?'#fef3c7':'#f3f4f6',color:nRot>0?'#92400e':'#9ca3af'}} title={`${nRot} rotación(es)`}>{nRot}</span></td>
                                      <td className="hora-color">{l.ultimaAsig.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</td>
                                      <td className={tiempo?'timer-ok':'timer-fail'}>{rotTxt(l.ultimaAsig)} {tiempo?'OK':'falta '+(120-mins)+'min'}</td>
                                      <td>{!rotAsesor?'—':sinRepetir?<span className="check-ok">OK</span>:<span className="check-fail">Ya tuvo</span>}</td>
                                      <td>{prohibido?<span className="badge-noapto">Prohibido</span>:!rotAsesor?'—':apto?<span className="badge-apto">Apto</span>:<span className="badge-noapto">No apto</span>}</td>
                                    </tr>
                                  )
                                })
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NAVEGADOR DE FECHA */}
            <div className="fecha-nav-row">
              <span style={{fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4,whiteSpace:'nowrap'}}>Fecha activa:</span>
              <div className="fecha-nav-ctrl">
                <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                  {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                </select>
                <button className="fnav-btn" onClick={()=>navegarFecha(1)} disabled={nextDis}>→</button>
              </div>
              <span className="fnav-count">{idx+1} / {fechaPestanas.length}</span>
              <div className="fecha-add-wrap">
                <input type="date" value={calPicker} onChange={e=>setCalPicker(e.target.value)} className="fecha-add-input" />
                <button className="fecha-add-btn" onClick={agregarFechaCalendario}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Agregar fecha
                </button>
              </div>
            </div>

            {/* FILTROS EN UNA SOLA FILA, DEBAJO DE LAS FECHAS */}
            <div className="base-filtros">
              <div className="bo-input-group base-filtro-numero"><label>Número</label>
                <input className="form-control" value={filtros.numero} onChange={e=>setFiltros(p=>({...p,numero:e.target.value}))} placeholder="Buscar N1, N2 o usuario WhatsApp..." />
              </div>
              <div className="bo-input-group"><label>Desde</label>
                <input type="date" className="form-control" value={filtros.desde} onChange={e=>setFiltros(p=>({...p,desde:e.target.value}))} />
              </div>
              <div className="bo-input-group"><label>Hasta</label>
                <input type="date" className="form-control" value={filtros.hasta} onChange={e=>setFiltros(p=>({...p,hasta:e.target.value}))} />
              </div>
              <label className="toggle-col base-filtro-toggle">
                <input type="checkbox" checked={filtros.global} onChange={e=>setFiltros(p=>({...p,global:e.target.checked}))} />
                <span>Buscar global</span>
              </label>
              <label className="toggle-col base-filtro-toggle">
                <input type="checkbox" checked={filtros.duplicados} onChange={e=>setFiltros(p=>({...p,duplicados:e.target.checked}))} />
                <span>Números duplicados</span>
              </label>
              <label className="toggle-col base-filtro-toggle">
                <input type="checkbox" checked={filtros.verTipVend} onChange={e=>setFiltros(p=>({...p,verTipVend:e.target.checked}))} />
                <span>Ver tipif. vendedor</span>
              </label>
              <button className="bo-btn-limpiar btn btn-sm base-filtro-limpiar" onClick={()=>{ setFiltros({tip:'',tipVend:'',asesor:'',campana:'',numero:'',verTipVend:true,global:false,duplicados:false,desde:'',hasta:''}); setBaseSort({col:null,dir:'asc'}) }}>Limpiar filtros</button>
              <button className="btn-rotar-masivo" onClick={ordenarBaseDelDia} type="button">Ordenar base del día</button>
            </div>


            {/* TABLA BASE */}
            <datalist id="asesores-datalist">
              {asesores.map(a=><option key={a.id} value={a.nombre} />)}
            </datalist>
            <div className="tabla-desliza-aviso">← Desliza horizontalmente para ver todas las columnas →</div>
            <div className="base-tabla-wrap">
              <table className="base-tabla table table-sm table-hover">
                <thead>
                  <tr>
                    <th>#</th>
                    <HeaderFiltroDropdown label="Campaña" valor={filtros.campana} onChange={v=>setFiltros(p=>({...p,campana:v}))} opciones={campanasDisponibles} buscable />
                    <th>N1</th><th>N2</th>
                    <HeaderFiltroDropdown label="Asesor asignado" valor={filtros.asesor} onChange={v=>setFiltros(p=>({...p,asesor:v}))} opciones={asesores.map(a=>a.nombre)} buscable />
                    {baseTh('hora','Hora / Fecha asign.')}
                    {filtros.verTipVend && (
                      <HeaderFiltroDropdown label="Tipif. Vendedor" valor={filtros.tipVend} onChange={v=>setFiltros(p=>({...p,tipVend:v}))} opciones={TIPIF_VEND_OPCIONES} />
                    )}
                    <th>Comentario</th>{baseTh('rotac','Rotaciones')}<th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.length === 0
                    ? <tr><td colSpan={filtros.verTipVend?10:9} className="bo-empty">Sin registros en {formatFecha(fechaActiva)}.</td></tr>
                    : registrosFiltrados.map((r,i) => {
                        const esExclusiva = esLeadProhibido(r)
                        return [
                          <tr key={r.id} id={`fila-${r.id}`}>
                            <td style={{color:'#9ca3af',fontSize:10}}>{i+1}</td>
                            <td><strong>{r.campana}</strong></td>
                            <td>
                              <div className="numero-copiar">
                                <span>{r.n1 ? r.n1 : (r.usuarioWhatsapp ? `@${r.usuarioWhatsapp}` : '—')}</span>
                                {(r.n1 || r.usuarioWhatsapp) && <button type="button" onClick={()=>copiarNumero(r.n1 || r.usuarioWhatsapp)} title="Copiar" aria-label="Copiar"><CopyIcon /></button>}
                                <button type="button" onClick={()=>abrirModalEditarContacto(r.id)} title="Editar contacto" aria-label="Editar contacto" style={{border:'none',background:'transparent',cursor:'pointer',color:'#9ca3af',padding:0,marginLeft:2,display:'inline-flex'}}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                              </div>
                            </td>
                            <td>{r.n2 ? <div className="numero-copiar secundario"><span>{r.n2}</span><button type="button" onClick={()=>copiarNumero(r.n2)} title="Copiar N2" aria-label={`Copiar ${r.n2}`}><CopyIcon /></button></div> : <span style={{color:'#ccc'}}>—</span>}</td>
                            <td>
                              <AsesorBuscador value={r.asesor} asesores={asesores} disabled={esExclusiva}
                                title={esExclusiva?`Número prohibido: ${r._tipifVend}`:''}
                                onChange={v=>reasignarReg(r.id,v)} />
                            </td>
                            <td>{r.horaAsig ? <><span className="hora-cell">{r.horaAsig}</span> <span className="hora-date">{formatFecha(r.fecha||fechaActiva)}</span></> : <span className="hora-empty">—</span>}</td>
                            {filtros.verTipVend && (
                              <td>
                                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                  <select className="sel-tipif-vend" value={normalizarTipifVendSelect(r._tipifVend)} onChange={e=>guardarTipif(r.id,e.target.value)} style={esExclusiva?{fontSize:10,padding:'3px 6px',border:'1px solid #ea580c',borderRadius:6,fontFamily:'inherit',maxWidth:155,cursor:'pointer',color:'#ea580c',fontWeight:700,background:'#fff7ed'}:estiloTipifVend(normalizarTipifVendSelect(r._tipifVend))}>
                                    <option value="">— Pendiente —</option>
                                    {TIPIF_VEND_OPCIONES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                  {r._tipifHora && <span style={{fontSize:9,color:'#9ca3af'}}>vendedor · {r._tipifHora}</span>}
                                </div>
                              </td>
                            )}
                            <td>
                              <input type="text" defaultValue={r.obsAsesor} placeholder="Comentario..."
                                onBlur={e=>{ if(e.target.value !== r.obsAsesor) guardarComentario(r.id, e.target.value) }}
                                onKeyDown={e=>{ if(e.key==='Enter') e.target.blur() }}
                                style={{fontSize:11,padding:'4px 7px',border:'1px solid #e5e7eb',borderRadius:6,fontFamily:'inherit',width:140}} />
                            </td>
                            <td style={{textAlign:'center'}}>
                              {r.rotaciones > 0
                                ? <span style={{background:'#EDE9FE',color:'#4C1D95',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:99,display:'inline-block'}}>{r.rotaciones}x</span>
                                : <span style={{color:'#d1d5db',fontSize:11}}>0</span>}
                            </td>
                            <td>
                              <div className="acciones-cell">
                                <button className="btn-rotar" disabled={esExclusiva} title={esExclusiva?`Número prohibido: ${r._tipifVend}`:'Rotar'} onClick={()=>abrirModalRotar(r.id)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                  {esExclusiva?'Prohibido':'Rotar'}
                                </button>
                                <button className="btn-hist" onClick={()=>setHistOpen(p=>({...p,[r.id]:!p[r.id]}))}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  Historial
                                </button>
                                <button className="btn-del" onClick={()=>eliminarReg(r.id)} title="Eliminar">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>,
                          <tr key={`hist-${r.id}`} className={`historial-row${histOpen[r.id]?' open':''}`}>
                            <td colSpan={filtros.verTipVend?10:9}>
                              <div className="historial-inner">
                                <div className="hist-label">Historial de asignaciones — N1: {r.n1}</div>
                                {(() => {
                                  const cola = (r.historial||[]).filter(h => h.asesor && h.tipo!=='TIPIF_BACK' && h.tipo!=='DERIVADO' && h.tipo!=='TIPIF_VEND')
                                  if (!cola.length) return <div style={{fontSize:11,color:'#ccc'}}>Sin historial.</div>
                                  return cola.map((h,ci)=>{
                                    const sig = cola[ci+1]
                                    const tipif = ci===cola.length-1
                                      ? (r._tipifVend || '')
                                      : (sig && sig.tipifVendAntes!=null ? sig.tipifVendAntes : '')
                                    const asignadoPor = h.tipo==='ROTACION'
                                      ? (h.rotadoPor || '—')
                                      : (h.reasignadoPor || h.motivo || '—')
                                    const nombreAsesor = String(h.asesor||'').trim().toUpperCase()
                                    const tipsAsesor = (r.historial||[])
                                      .filter(t => t?.tipo==='TIPIF_VEND' && String(t.asesor||'').trim().toUpperCase()===nombreAsesor)
                                      .sort((a,b)=>(a.ts||0)-(b.ts||0))
                                    return (
                                      <div key={ci} className="hist-item" style={{alignItems:'flex-start'}}>
                                        <div className="hist-dot" style={{background:DOT_COLORS[ci%DOT_COLORS.length],marginTop:4}} />
                                        <div style={{lineHeight:1.5}}>
                                          <div><strong>{h.asesor||'—'}</strong> <span className="hora-cell">{h.hora||'—'}</span> <span style={{color:'#9ca3af'}}>{h.fecha||''}</span></div>
                                          <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',margin:'2px 0'}}>
                                            {tipsAsesor.length ? tipsAsesor.map((t,ti)=>(
                                              <span key={ti} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,whiteSpace:'nowrap'}}>
                                                <span style={{color:'#9ca3af',fontFamily:'monospace'}}>{t.hora||'—'}{t.fecha?` · ${t.fecha}`:''}</span>
                                                <strong style={{color:'#065f46'}}>{labelTipifVend(t.tipif)||'—'}</strong>
                                              </span>
                                            )) : <span style={{fontSize:11}}>Tipificación: <strong style={{color:'#065f46'}}>{labelTipifVend(tipif)||'—'}</strong></span>}
                                          </div>
                                          <div style={{fontSize:11,color:'#6b7280'}}>Asignado por: {asignadoPor}</div>
                                        </div>
                                      </div>
                                    )
                                  })
                                })()}
                                <div style={{marginTop:10, textAlign:'right'}}>
                                  <button type="button"
                                    onClick={()=>{ if(window.confirm(`¿Eliminar el número ${r.n1}? Se borrará por completo y no se puede deshacer.`)) eliminarReg(r.id) }}
                                    style={{fontSize:11, padding:'4px 12px', border:'1px solid #f97316', color:'#f97316', background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:600}}>
                                    Eliminar número
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ]
                      })
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ══ SECCIÓN: RECLUTADOS ═════════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='reclutados'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Reclutados generales</h2>
                <p className="bo-sub">Consolidado de postulantes reclutados por todos los asesores.</p>
              </div>
              <div className="reclutados-head-actions">
                <span className="reclutados-count">{reclutados.length} registros</span>
                <button type="button" className="reclutados-refresh" onClick={cargarReclutados}>↻ Actualizar</button>
              </div>
            </div>
            <div className="base-tabla-wrap reclutados-tabla-wrap">
              <table className="base-tabla reclutados-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Nombre y Apellidos</th><th>Tipo Doc.</th>
                    <th>Documento</th><th>Teléfono</th><th>Distrito</th><th>Puesto</th>
                    <th>Campaña</th><th>Empresa</th><th>Reclutador</th><th>Estado</th><th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoReclutados ? (
                    <tr><td colSpan="12" className="reclutados-empty">Cargando reclutados...</td></tr>
                  ) : reclutados.length === 0 ? (
                    <tr><td colSpan="12" className="reclutados-empty">Sin postulantes reclutados aún.</td></tr>
                  ) : reclutados.map((v, i) => (
                    <tr key={v.id || i}>
                      <td>{normalizarFecha(v.created_at) || '—'}</td>
                      <td className="reclutados-nombre">{v.nombre || '—'}</td>
                      <td>{v.tipo_doc || 'DNI'}</td>
                      <td className="reclutados-documento">{v.dni || '—'}</td>
                      <td>{v.telefono1 || '—'}</td>
                      <td>{v.distrito || '—'}</td>
                      <td>{v.puesto || '—'}</td>
                      <td>{v.fuente || v.campana || '—'}</td>
                      <td>{v.empresa || '—'}</td>
                      <td className="reclutados-reclutador">{v.usuario_nombre || '—'}</td>
                      <td><span className="reclutados-estado">{v.estado_reclutamiento || '—'}</span></td>
                      <td>{v.observacion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ══ SECCIÓN: CARGA MASIVA ══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='carga-masiva'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Carga Masiva de Base</h2>
                <p className="bo-sub">Pega números directamente · importa CSV/TXT · o usa tu sistema antiguo</p>
              </div>
            </div>

            {/* Date nav carga masiva */}
            <div className="fecha-nav-row" style={{marginBottom:16}}>
              <span style={{fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4,whiteSpace:'nowrap'}}>Fecha activa:</span>
              <div className="fecha-nav-ctrl">
                <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                  {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                </select>
                <button className="fnav-btn" onClick={()=>navegarFecha(1)} disabled={nextDis}>→</button>
              </div>
              <span className="fnav-count">{idx+1} / {fechaPestanas.length}</span>
              <div className="fecha-add-wrap">
                <input type="date" value={cmCalPicker} onChange={e=>setCmCalPicker(e.target.value)} className="fecha-add-input" />
                <button className="fecha-add-btn" onClick={agregarFechaCargaMasiva}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Agregar fecha
                </button>
              </div>
            </div>

            <div className="bo-panel" style={{marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
                <div className="bo-panel-title" style={{marginBottom:0}}>Selecciona el método de importación</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <button className={`btn-tab-carga${cargaTab==='pegar'?' active':''}`} onClick={()=>{ setCargaTab('pegar'); sessionStorage.setItem('nc_backoffice_carga_tab','pegar') }}>Pegar números</button>
                  <button className={`btn-tab-carga${cargaTab==='archivo'?' active':''}`} onClick={()=>{ setCargaTab('archivo'); sessionStorage.setItem('nc_backoffice_carga_tab','archivo') }}>Subir CSV / TXT</button>
                  <button className={`btn-tab-carga${cargaTab==='legacy'?' active':''}`} style={{background:'#fff7ed',color:'#c2410c',borderColor:'#fed7aa'}} onClick={()=>{ setCargaTab('legacy'); sessionStorage.setItem('nc_backoffice_carga_tab','legacy') }}>Sistema antiguo</button>
                </div>
              </div>

              {/* TAB: Pegar */}
              {cargaTab === 'pegar' && (
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:10}}>
                    <div className="bo-input-group" style={{margin:0}}>
                      <label>Pegar lista de N1 (uno por línea, o separados por coma)</label>
                      <textarea value={masivaNums} onChange={e=>setMasivaNums(e.target.value)} rows={8} placeholder={'987654321\n976543210\n965432109'} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:160}}>
                      <div className="bo-input-group" style={{margin:0}}><label>Campaña</label><CampanaSelect value={masivaCamp} onChange={setMasivaCamp} plain /></div>
                      <div className="bo-input-group" style={{margin:0}}><label>Asesor (opcional)</label>
                        <AsesorBuscador value={masivaAsesor} asesores={asesores}
                          onChange={v=>setMasivaAsesor(v)}
                          className="form-select" placeholderText="— Sin asignar —" emptyLabel="— Sin asignar —" />
                      </div>
                      <div className="bo-input-group" style={{margin:0}}><label>Lote máx.</label>
                        <select value={masivaLote} onChange={e=>{ setMasivaLote(e.target.value); if(masivaFilas.length) previsualizarMasiva() }}>
                          <option value="10">10 por lote</option><option value="25">25 por lote</option>
                          <option value="50">50 por lote</option><option value="0">Todos</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <button className="btn-masiva-preview" onClick={previsualizarMasiva}>Vista previa</button>
                    <button className="btn-masiva-go" onClick={ejecutarCargaMasiva} disabled={masivaFilasParaCargar.length===0}>Cargar {masivaFilasParaCargar.length} registros</button>
                  </div>
                  {masivaFilas.length > 0 && (
                    <>
                      {masivaNDup > 0 && (
                        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#92400e',marginTop:10}}>
                          Se detectaron <strong>{masivaNDup} duplicados</strong>. <strong>{masivaFilasCnt-masivaNDup} números nuevos</strong>.<br/>
                          <label style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:6,cursor:'pointer',fontSize:11,color:'#374151'}}>
                            <input type="checkbox" checked={inclDup} onChange={e=>setInclDup(e.target.checked)} /> Cargar tambien los duplicados
                          </label>
                        </div>
                      )}
                      {masivaNDup === 0 && <div style={{color:'#15803d',fontWeight:600,fontSize:12,marginTop:10}}>{masivaFilasCnt} números nuevos, sin duplicados.</div>}
                      <div style={{marginTop:10,maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead><tr style={{background:'#f9fafb'}}>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>#</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>N1</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Campaña</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Fecha</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Estado</th>
                          </tr></thead>
                          <tbody>
                            {masivaFilas.map((f,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:f.dup?'#fff7ed':''}}>
                                <td style={{padding:'5px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'5px 10px',fontFamily:'monospace',fontWeight:600}}>{f.n1}</td>
                                <td style={{padding:'5px 10px',color:'#374151'}}>{masivaCamp||'—'}</td>
                                <td style={{padding:'5px 10px',color:'#374151'}}>{formatFecha(fechaActiva)}</td>
                                <td style={{padding:'5px 10px'}}>
                                  {f.dup
                                    ? <><span style={{background:'#ffedd5',color:'#9a3412',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99}}>DUPLICADO</span> <span style={{fontSize:9,color:'#c2410c'}}>{f.motivo}</span></>
                                    : <span style={{background:'#dcfce7',color:'#15803d',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99}}>NUEVO</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB: Archivo */}
              {cargaTab === 'archivo' && (
                <div>
                  <div
                    onClick={()=>archivoInputRef.current?.click()}
                    onDragOver={e=>{ e.preventDefault(); setDragOver(true) }}
                    onDragLeave={()=>setDragOver(false)}
                    onDrop={e=>{ e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length) procesarArchivo(e.dataTransfer.files[0]) }}
                    style={{border:`2px dashed ${dragOver?'#111827':'#d1d5db'}`,borderRadius:10,padding:36,textAlign:'center',cursor:'pointer',background:dragOver?'#f9fafb':'#fff',transition:'all .18s'}}
                  >
                    <div style={{fontSize:14,fontWeight:600,color:'#374151',marginBottom:4}}>Arrastra tu archivo aquí o haz clic</div>
                    <div style={{fontSize:12,color:'#9ca3af'}}>Acepta CSV · TXT — columnas: N1, N2, Campaña, Distrito, Tipif</div>
                    <input ref={archivoInputRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarArchivo(e.target.files[0]) }} />
                  </div>
                  {archivoStatus && <div style={{marginTop:10,fontSize:12,color:'#6b7280'}}>{archivoStatus}</div>}
                  {archivoRows.length > 0 && (
                    <div style={{marginTop:10}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{archivoInfo}</span>
                        <button className="btn-masiva-go" onClick={ejecutarCargaArchivo}>Cargar {archivoRows.length} registros</button>
                      </div>
                      <div style={{maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead><tr style={{background:'#f9fafb',position:'sticky',top:0}}>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>#</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>N1</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Campaña</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Distrito</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Tipif.</th>
                          </tr></thead>
                          <tbody>
                            {archivoRows.slice(0,50).map((r,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={{padding:'5px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'5px 10px',fontFamily:'monospace',fontWeight:600}}>{r.n1}</td>
                                <td style={{padding:'5px 10px'}}>{r.camp}</td>
                                <td style={{padding:'5px 10px'}}>{r.dist}</td>
                                <td style={{padding:'5px 10px'}}>{r.tipif||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Legacy */}
              {cargaTab === 'legacy' && (
                <div>
                  <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#c2410c',marginBottom:4}}>Importación de sistema antiguo</div>
                    <div style={{fontSize:11,color:'#92400e',lineHeight:1.6}}>
                      Formato: <strong>CAMPAÑA · DISTRITO · N2 · N1 · TIPIF.BACK · COMENTARIO · TIPIFICACIÓN · HORA · ASESOR 1 · ... · ASESOR 6</strong>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 180px',gap:12,marginBottom:12}}>
                    <div
                      onClick={()=>legacyInputRef.current?.click()}
                      onDragOver={e=>{ e.preventDefault(); setLegacyDragOver(true) }}
                      onDragLeave={()=>setLegacyDragOver(false)}
                      onDrop={e=>{ e.preventDefault(); setLegacyDragOver(false); if(e.dataTransfer.files.length) procesarLegacy(e.dataTransfer.files[0]) }}
                      style={{border:`2px dashed ${legacyDragOver?'#c2410c':'#fed7aa'}`,borderRadius:10,padding:28,textAlign:'center',cursor:'pointer',background:legacyDragOver?'#fff7ed':'#fff'}}
                    >
                      <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:3}}>Arrastra tu base o haz clic</div>
                      <div style={{fontSize:11,color:'#9ca3af'}}>CSV exportado desde tu sistema anterior</div>
                      <input ref={legacyInputRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarLegacy(e.target.files[0]) }} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      <div className="bo-input-group" style={{margin:0}}><label>Fecha destino</label>
                        <select value={legacyFecha} onChange={e=>setLegacyFecha(e.target.value)} style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff'}}>
                          {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)}</option>)}
                        </select>
                      </div>
                      <div className="bo-input-group" style={{margin:0}}><label>Fecha de la fila</label>
                        <select value={legacyUsarFecha} onChange={e=>setLegacyUsarFecha(e.target.value)} style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff'}}>
                          <option value="no">Usar fecha seleccionada</option>
                          <option value="si">Leer fecha de la fila</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {legacyStatus && <div style={{fontSize:12,color:'#6b7280',marginBottom:8}}>{legacyStatus}</div>}
                  {legacyRows.length > 0 && (
                    <div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:8}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{legacyInfo}</span>
                        <div style={{display:'flex',gap:6}}>
                          <button className="btn-masiva-preview" onClick={()=>setLegacyRows([])}>Cancelar</button>
                          <button className="btn-masiva-go" onClick={ejecutarCargaLegacy} style={{background:'#c2410c'}}>Importar {legacyRowsResueltos.length} registros</button>
                        </div>
                      </div>
                      <div style={{maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,whiteSpace:'nowrap'}}>
                          <thead><tr style={{background:'#f9fafb',position:'sticky',top:0}}>
                            {['#','Camp.','Dist.','N1','N2','Tipif. Back','Tipif.','Hora','Asesores','Fecha'].map(h=>(
                              <th key={h} style={{padding:'5px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {legacyRowsResueltos.slice(0,60).map((r,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={{padding:'4px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'4px 10px',fontWeight:600}}>{r.campana}</td>
                                <td style={{padding:'4px 10px'}}>{r.distrito}</td>
                                <td style={{padding:'4px 10px',fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{r.n1}</td>
                                <td style={{padding:'4px 10px',fontFamily:'monospace',color:'#6b7280'}}>{r.n2||'—'}</td>
                                <td style={{padding:'4px 10px'}}>{r.tipifBack||'—'}</td>
                                <td style={{padding:'4px 10px'}}>{r.tipifVend||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#185FA5',fontWeight:600}}>{r.hora||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#6b7280'}}>{r.asesores.join(' → ')||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#374151'}}>{formatFecha(r.fecha)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>


          <section className={`bo-seccion${seccion==='entrevistas'?'':' hidden'}`}>
            <div className="bo-seccion-header"><div><h2>Entrevistas</h2><p className="bo-sub">Seguimiento de postulantes agendados.</p></div><button type="button" className="reclutados-refresh" onClick={cargarEntrevistas}>↻ Actualizar</button></div>
            <div className="filtros-grid" style={{marginBottom:14}}><div className="bo-input-group"><label>Buscar</label><input className="form-control" value={filtrosEntrevistas.busqueda} onChange={e=>setFiltrosEntrevistas(p=>({...p,busqueda:e.target.value}))} placeholder="Postulante, número o campaña…" /></div><div className="bo-input-group"><label>Turno</label><select className="form-select" value={filtrosEntrevistas.turno} onChange={e=>setFiltrosEntrevistas(p=>({...p,turno:e.target.value}))}><option value="">Todos</option><option value="TURNO 1">TURNO 1</option><option value="TURNO 2">TURNO 2</option></select></div></div>
            <div className="base-tabla-wrap reclutados-tabla-wrap"><table className="base-tabla reclutados-tabla"><thead><tr><th>Registro</th><th>Campaña</th><th>Postulante</th><th>Número</th><th>Turno</th><th>Tipificación</th><th>Observación</th><th>Entrevista</th></tr></thead><tbody>
              {cargandoEntrevistas ? <tr><td colSpan="8" className="reclutados-empty">Cargando…</td></tr> : entrevistas.filter(en=>{const q=filtrosEntrevistas.busqueda.toLowerCase();return (!filtrosEntrevistas.turno||en.turno===filtrosEntrevistas.turno)&&(!q||`${en.nombre_postulante} ${en.numero} ${en.campana}`.toLowerCase().includes(q))}).map(en=><tr key={en.id}><td>{formatFecha(normalizarFecha(en.created_at))}</td><td>{en.campana||'—'}</td><td>{en.nombre_postulante}</td><td>{en.numero}</td><td>{en.turno}</td><td><select value={en.tipificacion||''} onChange={e=>guardarTipifEntrevista(en.id,e.target.value)} style={estiloTipifEntrevista(en.tipificacion)}><option value="">— Pendiente —</option>{TIPIF_ENTREVISTA_OPCIONES.map(t=><option key={t} value={t}>{t}</option>)}</select></td><td><input className="form-control" defaultValue={en.observacion||''} onBlur={e=>guardarObservacionEntrevista(en.id,en.observacion||'',e.target.value.trim())}/></td><td><input type="date" className="form-control" defaultValue={String(en.fecha_entrevista||'').slice(0,10)} onBlur={e=>guardarFechaEntrevista(en.id,String(en.fecha_entrevista||'').slice(0,10),e.target.value)}/></td></tr>)}
            </tbody></table></div>
          </section>

          <section className={`bo-seccion${seccion==='capacitacion'?'':' hidden'}`}>
            <div className="bo-seccion-header"><div><h2>Capacitación</h2><p className="bo-sub">Postulantes que asistieron y empiezan capacitación.</p></div><button type="button" className="reclutados-refresh" onClick={cargarCapacitaciones}>↻ Actualizar</button></div>
            <div className="base-tabla-wrap reclutados-tabla-wrap"><table className="base-tabla reclutados-tabla"><thead><tr><th>Postulante</th><th>Número</th><th>Campaña</th><th>Inicio</th><th>Estado</th><th>Observación</th></tr></thead><tbody>{cargandoCapacitaciones?<tr><td colSpan="6" className="reclutados-empty">Cargando…</td></tr>:capacitaciones.map(c=><tr key={c.id}><td>{c.nombre_postulante}</td><td>{c.numero}</td><td>{c.campana||'—'}</td><td><input type="date" className="form-control" defaultValue={String(c.fecha_inicio_capacitacion||'').slice(0,10)} onBlur={e=>guardarCampoCapacitacion(c.id,'fecha_inicio_capacitacion',String(c.fecha_inicio_capacitacion||'').slice(0,10),e.target.value)}/></td><td><input className="form-control" defaultValue={c.estado||''} onBlur={e=>guardarCampoCapacitacion(c.id,'estado',c.estado||'',e.target.value.trim())}/></td><td><input className="form-control" defaultValue={c.observacion||''} onBlur={e=>guardarCampoCapacitacion(c.id,'observacion',c.observacion||'',e.target.value.trim())}/></td></tr>)}</tbody></table></div>
          </section>
        </main>
      </div>

      {modalEntrevista.open && <div className="modal-overlay open"><div className="modal-box"><h3>Agendar entrevista</h3>
        <div className="bo-input-group"><label>Postulante</label><input className="form-control" value={modalEntrevista.nombrePostulante} onChange={e=>setModalEntrevista(p=>({...p,nombrePostulante:e.target.value}))}/></div>
        <div className="bo-input-group"><label>Número</label><input className="form-control" value={modalEntrevista.numero} onChange={e=>setModalEntrevista(p=>({...p,numero:e.target.value}))}/></div>
        <div className="bo-input-group"><label>Número de referencia</label><input className="form-control" value={modalEntrevista.numeroRef} onChange={e=>setModalEntrevista(p=>({...p,numeroRef:e.target.value}))}/></div>
        <div className="bo-input-group"><label>Turno</label><select className="form-select" value={modalEntrevista.turno} onChange={e=>setModalEntrevista(p=>({...p,turno:e.target.value}))}><option value="">Selecciona</option><option value="TURNO 1">TURNO 1</option><option value="TURNO 2">TURNO 2</option></select></div>
        <div className="bo-input-group"><label>Fecha</label><input type="date" className="form-control" value={modalEntrevista.fechaAgendamiento} onChange={e=>setModalEntrevista(p=>({...p,fechaAgendamiento:e.target.value}))}/></div>
        <div className="bo-input-group"><label>Observación</label><textarea className="form-control" value={modalEntrevista.observacion} onChange={e=>setModalEntrevista(p=>({...p,observacion:e.target.value}))}/></div>
        {modalEntrevista.error&&<p style={{color:'#dc2626'}}>{modalEntrevista.error}</p>}<div className="modal-btns"><button className="btn-cancelar-modal" onClick={()=>setModalEntrevista(p=>({...p,open:false}))}>Cancelar</button><button className="btn-confirmar-modal" onClick={guardarEntrevista} disabled={modalEntrevista.guardando}>{modalEntrevista.guardando?'Guardando…':'Agendar'}</button></div>
      </div></div>}

      {/* ══ MODAL ROTACIÓN MANUAL ════════════════════════════════════════════ */}
      {modalRotar.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget) setModalRotar(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Rotar lead manualmente</h3>
            <p>{modalRotar.desc}</p>
            {(() => {
              const disponibles = asesores.filter(a => a.nombre !== modalRotar.asesorActual)
              const filtrados = disponibles.filter(a => (a.nombre||'').toLowerCase().includes(rotBusqueda.trim().toLowerCase()))
              return (
                <div style={{border:`1px solid ${rotModalAsesor?'#e5e7eb':'#f97316'}`, borderRadius:10, padding:8, marginBottom:10}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input autoFocus value={rotBusqueda} onChange={e=>setRotBusqueda(e.target.value)} placeholder="Buscar asesor…"
                      onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(filtrados[0]) setRotModalAsesor(filtrados[0].nombre) } }}
                      style={{border:'none', outline:'none', flex:1, fontSize:13, background:'transparent'}} />
                  </div>
                  <div style={{maxHeight:170, overflowY:'auto', marginTop:6}}>
                    {filtrados.map(a=>(
                      <div key={a.id} onClick={()=>setRotModalAsesor(a.nombre)}
                        style={{padding:'7px 9px', cursor:'pointer', fontSize:13, borderRadius:7, fontWeight:a.nombre===rotModalAsesor?700:400, background:a.nombre===rotModalAsesor?'#fff7ed':'transparent', color:a.nombre===rotModalAsesor?'#c2410c':'#111827'}}>
                        {a.nombre}
                      </div>
                    ))}
                    {filtrados.length===0 && <div style={{padding:'8px 9px', fontSize:12, color:'#9ca3af'}}>Sin resultados</div>}
                  </div>
                </div>
              )
            })()}
            <textarea value={rotModalMotivo} onChange={e=>setRotModalMotivo(e.target.value)} placeholder="Motivo de la rotación (opcional)..." />
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalRotar(p=>({...p,open:false}))}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={confirmarRotacion} disabled={!rotModalAsesor}>Rotar ahora</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL EDITAR CONTACTO (campaña / N1 / N2 / usuario WhatsApp) ═════ */}
      {modalEditarContacto.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalEditarContacto.guardando) setModalEditarContacto(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Editar contacto</h3>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:10}}>
              <div className="bo-input-group"><label>Campaña</label>
                <CampanaSelect value={modalEditarContacto.campana} onChange={v=>setModalEditarContacto(p=>({...p,campana:v}))} />
              </div>
              <div className="bo-input-group"><label>N1</label>
                <input className="form-control" value={modalEditarContacto.n1} onChange={e=>setModalEditarContacto(p=>({...p,n1:e.target.value}))} placeholder="Número principal" style={{fontFamily:'monospace'}} />
              </div>
              <div className="bo-input-group"><label>N2 (opcional)</label>
                <input className="form-control" value={modalEditarContacto.n2} onChange={e=>setModalEditarContacto(p=>({...p,n2:e.target.value}))} placeholder="Número secundario" style={{fontFamily:'monospace'}} />
              </div>
              <div className="bo-input-group"><label>Usuario WhatsApp</label>
                <input className="form-control" value={modalEditarContacto.usuarioWhatsapp} onChange={e=>setModalEditarContacto(p=>({...p,usuarioWhatsapp:e.target.value}))} placeholder="Si no tiene N1, ej. usuario_clie" />
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalEditarContacto(p=>({...p,open:false}))} disabled={modalEditarContacto.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarEdicionContacto} disabled={modalEditarContacto.guardando}>{modalEditarContacto.guardando?'Guardando...':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REGISTRAR CAPACITACIÓN ═════════════════════════════════════ */}
      {modalCapacitacion.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalCapacitacion.guardando) setModalCapacitacion(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Registrar en capacitación</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Nombre del postulante</label><input className="form-control" value={modalCapacitacion.nombrePostulante} onChange={e=>setModalCapacitacion(p=>({...p,nombrePostulante:e.target.value}))} placeholder="Nombre y apellidos" /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Número (el del lead, o cambia por uno de referencia)</label><input className="form-control" value={modalCapacitacion.numero} onChange={e=>setModalCapacitacion(p=>({...p,numero:e.target.value}))} placeholder="Número de contacto" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Fecha de inicio de capacitación</label><input type="date" className="form-control" value={modalCapacitacion.fechaInicio} onChange={e=>setModalCapacitacion(p=>({...p,fechaInicio:e.target.value}))} /></div>
            {modalCapacitacion.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalCapacitacion.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalCapacitacion(p=>({...p,open:false}))} disabled={modalCapacitacion.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarCapacitacion} disabled={modalCapacitacion.guardando}>{modalCapacitacion.guardando?'Guardando…':'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REGISTRAR CAPACITACIÓN ═════════════════════════════════════ */}
      {modalCapacitacion.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalCapacitacion.guardando) setModalCapacitacion(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Registrar en capacitación</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Nombre del postulante</label><input className="form-control" value={modalCapacitacion.nombrePostulante} onChange={e=>setModalCapacitacion(p=>({...p,nombrePostulante:e.target.value}))} placeholder="Nombre y apellidos" /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Número (el del lead, o cambia por uno de referencia)</label><input className="form-control" value={modalCapacitacion.numero} onChange={e=>setModalCapacitacion(p=>({...p,numero:e.target.value}))} placeholder="Número de contacto" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Fecha de inicio de capacitación</label><input type="date" className="form-control" value={modalCapacitacion.fechaInicio} onChange={e=>setModalCapacitacion(p=>({...p,fechaInicio:e.target.value}))} /></div>
            {modalCapacitacion.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalCapacitacion.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalCapacitacion(p=>({...p,open:false}))} disabled={modalCapacitacion.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarCapacitacion} disabled={modalCapacitacion.guardando}>{modalCapacitacion.guardando?'Guardando…':'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BL MODAL (base de llamadas asesor) ══════════════════════════════ */}
      {blModal.open && (
        <div style={{display:'flex',position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9999,alignItems:'flex-start',justifyContent:'center',padding:'40px 20px'}} onClick={e=>{ if(e.target===e.currentTarget) setBlModal(p=>({...p,open:false})) }}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:1000,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
            <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'#111827'}}>Base de llamadas — {blModal.nombre}</div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>Solo lectura · Back Data</div>
              </div>
              <button onClick={()=>setBlModal(p=>({...p,open:false}))} style={{width:32,height:32,borderRadius:'50%',border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:18,cursor:'pointer'}}>×</button>
            </div>
            <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <label style={{fontSize:12,fontWeight:600}}>Fecha:</label>
              <input type="date" value={blFecha} onChange={e=>setBlFecha(e.target.value)} style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit'}} />
              <button onClick={()=>setBlFecha(fechaHoy())} style={{padding:'6px 12px',border:'1px solid #e5e7eb',borderRadius:8,background:'#f9fafb',fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Hoy</button>
              <span style={{fontSize:12,color:'#9ca3af',marginLeft:'auto'}}>{blLeads?.length??0} registros</span>
            </div>
            {blLeads && blLeads.length > 0 && (
              <div style={{padding:'10px 24px',display:'flex',gap:10,flexWrap:'wrap',borderBottom:'1px solid #f3f4f6'}}>
                {[{label:'Leads',val:blLeads.length,color:'#fdba74'},{label:'Tipificados',val:blLeads.filter(l=>(l.tipif_vend||'').trim()!=='').length,color:'#fb923c'},{label:'VENTA CERRADA',val:blLeads.filter(l=>(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA').length,color:'#ea580c'},{label:'NC/Buzón',val:blLeads.filter(l=>['NO CONTESTA','BUZON DE VOZ'].includes((l.tipif_vend||'').toUpperCase())).length,color:'#c2410c'}]
                  .map(k=>(
                    <div key={k.label} style={{background:'#f9fafb',borderRadius:10,padding:'8px 14px',display:'flex',flexDirection:'column',gap:2,minWidth:100}}>
                      <div style={{fontSize:18,fontWeight:800,color:k.color}}>{k.val}</div>
                      <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase'}}>{k.label}</div>
                    </div>
                  ))}
              </div>
            )}
            <div style={{flex:1,overflow:'auto',padding:'0 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{position:'sticky',top:0,background:'#f9fafb',zIndex:1}}>
                  {['#','Teléfono N1','N2','Zona','Campaña','Hora asig.','Tipificación','Observación'].map(h=>(
                    <th key={h} style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {blCargando
                    ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Cargando...</td></tr>
                    : !blLeads
                      ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#f97316'}}>Error de conexión.</td></tr>
                      : blLeads.length === 0
                        ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Sin leads para esta fecha.</td></tr>
                        : blLeads.map((l,i)=>(
                            <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA'?'#f0fdf4':''}}>
                              <td style={{padding:8,color:'#9ca3af',fontSize:10}}>{i+1}</td>
                              <td style={{padding:8,fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{l.n1||'—'}</td>
                              <td style={{padding:8,fontFamily:'monospace',color:'#6b7280'}}>{l.n2||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.distrito||l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11,fontFamily:'monospace'}}>{l.hora_asig||'—'}</td>
                              <td style={{padding:8}}><BlBadge tipif={l.tipif_vend} /></td>
                              <td style={{padding:8,fontSize:11,color:'#6b7280'}}>{l.obs_asesor||'—'}</td>
                            </tr>
                          ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOAST ════════════════════════════════════════════════════════════ */}
    </div>
  )
}
