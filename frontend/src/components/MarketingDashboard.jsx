import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import RangoFechasPicker from './RangoFechasPicker'
import { API, ncHeaders } from '../services/api'
import * as XLSX from 'xlsx'

// Extraido de MarketingLeads.jsx para que Jefatura (vista embebida) y el
// rol Marketing (pagina standalone) compartan el mismo dashboard — antes
// Jefatura.jsx tenia su propia copia vieja sin pestana de Reclutamiento,
// sin conteo de ventas y con el filtro de fechas vacio por defecto, y las
// dos copias fueron divergiendo con cada mejora.

const TIPIF_VEND_RECL_LABELS = {
  'VENTA CERRADA':   'Acepta propuesta',
  'BUZON DE VOZ':    'Buzón de voz',
  'NO TOCAR':        'No cumple el perfil',
  'CORTA LLAMADA':   'Corta llamada',
  'GESTION WSP':      'Gestión WSP',
  'NO CONTESTA':      'No contesta',
  'NO INTERESADO':    'No interesado',
  'NO ROTAR':         'No rotar',
  'VOLVER A LLAMAR':  'Volver a llamar',
  'FRAUDE':           'Provincia',
}
function labelTipifVendRecl(valor) { return TIPIF_VEND_RECL_LABELS[String(valor||'').trim().toUpperCase()] || valor }

const iconBtnStyle = { display:'inline-flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', padding:0 }
function IconEditar({ activo, ...props }) {
  return (
    <button type="button" {...props} style={{...iconBtnStyle, ...(activo?{borderColor:'#0f172a',boxShadow:'0 0 0 2px rgba(15,23,42,.12)'}:{}) }} title="Editar / agregar gasto">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>
  )
}
function IconDocumento(props) {
  return (
    <button type="button" {...props} style={iconBtnStyle} title="Ver historial de gastos">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
      </svg>
    </button>
  )
}

// Tipificaciones vigentes del vendedor en Backoffice (mismo set que
// TIPIF_VEND_OPCIONES en Backoffice.jsx) — el reporte de Marketing solo debe
// ofrecer estas para filtrar, no cualquier texto libre historico que haya
// quedado guardado en tipif_vend/tipif_back/tipif_back_2.
const TIPIF_VEND_VENTAS_ACTUALES = ['VENTA CERRADA','PREVENTA','AGENDADO','EN EJECUCION','INSTALADO','EJECUTADA','NO CONTESTA','BUZON DE VOZ','CORTA LLAMADA','NO DESEA','NO CALIFICA','SIN COBERTURA','CONTACTO CON TERCEROS','EDIFICIO NO LIBERADO','DESEA MOVIL','SERVICIO ACTIVO','NO ROTAR','VENTA CAIDA','SIN TIPIFICAR']
// OJO: "hoy" debe ser el dia calendario de Lima, no el del reloj/zona
// horaria del dispositivo del que mira el reporte — si no, este dashboard
// y la pestana "Base" de Backdatareclutamiento (que si usa America/Lima)
// terminan comparando dos fechas distintas y los totales no cuadran.
const PERU_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Lima', year:'numeric', month:'2-digit', day:'2-digit' })
function fechaHoy() { return PERU_DATE_FORMATTER.format(new Date()) }

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

export default function MarketingDashboard() {
  const [marketingVista, setMarketingVista] = useState('ventas')
  const [ordenCampanas, setOrdenCampanas] = useState('total')
  const [marketingFiltros, setMarketingFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingData, setMarketingData] = useState([])
  const [marketingCatalogos, setMarketingCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingCarga, setMarketingCarga] = useState({ cargando:false, error:'' })
  // Gasto de publicidad por campaña (compartido entre Ventas y Reclutamiento vía `area`)
  const [marketingCostos, setMarketingCostos] = useState([])
  const [marketingCostosRecl, setMarketingCostosRecl] = useState([])
  const [costoEditando, setCostoEditando] = useState('')
  const [entradaEditando, setEntradaEditando] = useState(null)
  const [costoForm, setCostoForm] = useState({ fecha:fechaHoy(), monto:'', notas:'' })
  const [guardandoCosto, setGuardandoCosto] = useState(false)
  const costosRequestRef = useRef(0)
  const costosReclRequestRef = useRef(0)
  // Mismo dashboard, pero para las campañas de Reclutamiento (leads_reclutamiento)
  const [marketingReclFiltros, setMarketingReclFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingReclData, setMarketingReclData] = useState([])
  const [marketingReclCatalogos, setMarketingReclCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingReclCarga, setMarketingReclCarga] = useState({ cargando:false, error:'' })
  const marketingRequestRef = useRef(0)
  const marketingReclRequestRef = useRef(0)

  const cargarMarketing = useCallback(async (filtros) => {
    const requestId = ++marketingRequestRef.current
    setMarketingCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      if (requestId !== marketingRequestRef.current) return
      setMarketingData(Array.isArray(data.data) ? data.data : [])
      setMarketingCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingCarga({ cargando:false, error:'' })
    } catch (error) {
      if (requestId !== marketingRequestRef.current) return
      setMarketingCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [])

  const cargarMarketingRecl = useCallback(async (filtros) => {
    const requestId = ++marketingReclRequestRef.current
    setMarketingReclCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads-reclutamiento/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      if (requestId !== marketingReclRequestRef.current) return
      setMarketingReclData(Array.isArray(data.data) ? data.data : [])
      setMarketingReclCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingReclCarga({ cargando:false, error:'' })
    } catch (error) {
      if (requestId !== marketingReclRequestRef.current) return
      setMarketingReclCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [])

  const cargarCostos = useCallback(async (filtros) => {
    const requestId = ++costosRequestRef.current
    try {
      const qs = new URLSearchParams()
      if (filtros.desde) qs.set('desde', filtros.desde)
      if (filtros.hasta) qs.set('hasta', filtros.hasta)
      if (filtros.campana) qs.set('campana', filtros.campana)
      qs.set('area', 'ventas')
      const res = await fetch(`${API}/marketing-costos?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el gasto de campañas')
      if (requestId !== costosRequestRef.current) return
      setMarketingCostos(Array.isArray(data.data) ? data.data : [])
    } catch {
      if (requestId !== costosRequestRef.current) return
      setMarketingCostos([])
    }
  }, [])

  const cargarCostosRecl = useCallback(async (filtros) => {
    const requestId = ++costosReclRequestRef.current
    try {
      const qs = new URLSearchParams()
      if (filtros.desde) qs.set('desde', filtros.desde)
      if (filtros.hasta) qs.set('hasta', filtros.hasta)
      if (filtros.campana) qs.set('campana', filtros.campana)
      qs.set('area', 'reclutamiento')
      const res = await fetch(`${API}/marketing-costos?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el gasto de campañas')
      if (requestId !== costosReclRequestRef.current) return
      setMarketingCostosRecl(Array.isArray(data.data) ? data.data : [])
    } catch {
      if (requestId !== costosReclRequestRef.current) return
      setMarketingCostosRecl([])
    }
  }, [])

  useEffect(() => { cargarMarketing(marketingFiltros) }, [marketingFiltros, cargarMarketing])
  useEffect(() => { cargarMarketingRecl(marketingReclFiltros) }, [marketingReclFiltros, cargarMarketingRecl])
  useEffect(() => { cargarCostos(marketingFiltros) }, [marketingFiltros, cargarCostos])
  useEffect(() => { cargarCostosRecl(marketingReclFiltros) }, [marketingReclFiltros, cargarCostosRecl])

  // La métrica comercial de ventas conserva el origen de cada cierre aunque
  // luego haya pasado a caída o ejecución.
  const TIPIF_CONJUNTO_VENTA = new Set(['VENTA CERRADA','VENTA CAIDA','EJECUTADA'])
  const resumenMarketing = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, instaladas:0, tipificaciones:[] }
      actual.total += cantidad
      const tipificacion = String(fila.tipificacion||'').trim().toUpperCase()
      if (TIPIF_CONJUNTO_VENTA.has(tipificacion)) actual.ventas += cantidad
      if (tipificacion === 'EJECUTADA') actual.instaladas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => ordenCampanas==='ventas'
      ? (b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es'))
      : ordenCampanas==='instaladas'
        ? (b.instaladas-a.instaladas || b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es'))
        : (b.total-a.total || a.campana.localeCompare(b.campana,'es')))
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)), maxInstaladas:Math.max(1,...campanas.map(c=>c.instaladas)) }
  }, [marketingData, ordenCampanas])

  // Gasto de publicidad, combinado con leads/ventas ya calculados por campaña.
  const resumenCostos = useMemo(() => {
    const gastoPorCampana = new Map()
    let gastoTotal = 0
    marketingCostos.forEach(c => {
      const monto = Number(c.monto || 0)
      gastoTotal += monto
      gastoPorCampana.set(c.campana, (gastoPorCampana.get(c.campana) || 0) + monto)
    })
    // Incluye también campañas con gasto cargado pero sin leads en el rango filtrado.
    const nombres = new Set([...resumenMarketing.campanas.map(c=>c.campana), ...gastoPorCampana.keys()])
    const filas = [...nombres].map(campana => {
      const base = resumenMarketing.campanas.find(c=>c.campana===campana) || { campana, total:0, ventas:0, instaladas:0 }
      const gasto = gastoPorCampana.get(campana) || 0
      return {
        campana,
        leads: base.total,
        ventas: base.ventas,
        gasto,
        costoPorLead: base.total ? gasto/base.total : 0,
        costoPorVenta: base.ventas ? gasto/base.ventas : 0,
      }
    }).sort((a,b) => b.gasto-a.gasto || b.leads-a.leads || a.campana.localeCompare(b.campana,'es'))
    const ventasTotal = resumenMarketing.campanas.reduce((s,c)=>s+c.ventas, 0)
    return { filas, gastoTotal, costoPorVenta: ventasTotal ? gastoTotal/ventasTotal : 0 }
  }, [marketingCostos, resumenMarketing])

  function formatoSoles(n) { return `S/ ${Number(n||0).toFixed(2)}` }

  function abrirPanelCosto(campana) {
    if (costoEditando === campana) { setCostoEditando(''); return }
    setCostoForm({ fecha:fechaHoy(), monto:'', notas:'' })
    setEntradaEditando(null)
    setCostoEditando(campana)
  }

  function editarEntradaCosto(entrada) {
    setCostoEditando(entrada.campana)
    setEntradaEditando(entrada.id)
    setCostoForm({ fecha:String(entrada.fecha).slice(0,10), monto:String(entrada.monto), notas:entrada.notas || '' })
  }

  async function guardarCosto(campana, area) {
    if (!costoForm.fecha || !costoForm.monto) return
    setGuardandoCosto(true)
    try {
      const url = entradaEditando ? `${API}/marketing-costos/${entradaEditando}` : `${API}/marketing-costos`
      const res = await fetch(url, {
        method: entradaEditando ? 'PUT' : 'POST',
        headers:{...ncHeaders(),'Content-Type':'application/json'},
        body: JSON.stringify({ campana, area, fecha:costoForm.fecha, monto:costoForm.monto, notas:costoForm.notas }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el gasto')
      setCostoForm({ fecha:fechaHoy(), monto:'', notas:'' })
      setEntradaEditando(null)
      if (area === 'reclutamiento') cargarCostosRecl(marketingReclFiltros)
      else cargarCostos(marketingFiltros)
    } catch (error) {
      setMarketingCarga(p => ({ ...p, error: error.message || 'Error de conexión' }))
    } finally {
      setGuardandoCosto(false)
    }
  }

  async function eliminarCosto(entrada, area) {
    if (!window.confirm(`¿Eliminar el gasto de ${formatoSoles(entrada.monto)} del ${entrada.fecha}?`)) return
    try {
      const res = await fetch(`${API}/marketing-costos/${entrada.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el gasto')
      if (entradaEditando === entrada.id) { setEntradaEditando(null); setCostoForm({ fecha:fechaHoy(), monto:'', notas:'' }) }
      if (area === 'reclutamiento') cargarCostosRecl(marketingReclFiltros)
      else cargarCostos(marketingFiltros)
    } catch (error) {
      setMarketingCarga(p => ({ ...p, error: error.message || 'Error de conexión' }))
    }
  }

  function exportarMarketingExcel() {
    descargarExcel(marketingData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-${fechaHoy()}.xlsx`)
  }

  const resumenMarketingRecl = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingReclData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, tipificaciones:[] }
      actual.total += cantidad
      // En Reclutamiento "venta" equivale a Acepta propuesta (VENTA CERRADA en tipif_vend).
      if (String(fila.tipificacion||'').trim().toUpperCase() === 'VENTA CERRADA') actual.ventas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => ordenCampanas==='ventas'
      ? (b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es'))
      : (b.total-a.total || a.campana.localeCompare(b.campana,'es')))
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)) }
  }, [marketingReclData, ordenCampanas])

  const resumenCostosRecl = useMemo(() => {
    const gastoPorCampana = new Map()
    let gastoTotal = 0
    marketingCostosRecl.forEach(c => {
      const monto = Number(c.monto || 0)
      gastoTotal += monto
      gastoPorCampana.set(c.campana, (gastoPorCampana.get(c.campana) || 0) + monto)
    })
    const nombres = new Set([...resumenMarketingRecl.campanas.map(c=>c.campana), ...gastoPorCampana.keys()])
    const filas = [...nombres].map(campana => {
      const base = resumenMarketingRecl.campanas.find(c=>c.campana===campana) || { campana, total:0, ventas:0 }
      const gasto = gastoPorCampana.get(campana) || 0
      return {
        campana,
        leads: base.total,
        ventas: base.ventas,
        gasto,
        costoPorLead: base.total ? gasto/base.total : 0,
        costoPorVenta: base.ventas ? gasto/base.ventas : 0,
      }
    }).sort((a,b) => b.gasto-a.gasto || b.leads-a.leads || a.campana.localeCompare(b.campana,'es'))
    const ventasTotal = resumenMarketingRecl.campanas.reduce((s,c)=>s+c.ventas, 0)
    return { filas, gastoTotal, costoPorVenta: ventasTotal ? gastoTotal/ventasTotal : 0 }
  }, [marketingCostosRecl, resumenMarketingRecl])

  function exportarMarketingReclExcel() {
    descargarExcel(marketingReclData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-reclutamiento-${fechaHoy()}.xlsx`)
  }

  return (
    <>
      <div className="sec-header">
        <div><h2>Dashboard de Leads por Campaña</h2><p>Información de altas y resultados para las áreas de Marketing y Reclutamiento</p></div>
        <div style={{display:'flex',gap:8}}>
          {marketingVista==='ventas'
            ? <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingExcel} disabled={!marketingData.length}>Exportar Excel</button>
            : <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingReclExcel} disabled={!marketingReclData.length}>Exportar Excel</button>}
          {marketingVista==='ventas'
            ? <button className="btn-nuevo" onClick={()=>cargarMarketing(marketingFiltros)}>Actualizar</button>
            : <button className="btn-nuevo" onClick={()=>cargarMarketingRecl(marketingReclFiltros)}>Actualizar</button>}
        </div>
      </div>

      <div className="nav-tabs" style={{display:'flex',gap:8,marginBottom:14}}>
        <button type="button" className={`btn-nuevo${marketingVista==='ventas'?'':' btn-tab-inactivo'}`}
          style={marketingVista==='ventas'?{}:{background:'#e5e7eb',color:'#374151'}}
          onClick={()=>setMarketingVista('ventas')}>Ventas</button>
        <button type="button" className={`btn-nuevo${marketingVista==='reclutamiento'?'':' btn-tab-inactivo'}`}
          style={marketingVista==='reclutamiento'?{}:{background:'#e5e7eb',color:'#374151'}}
          onClick={()=>setMarketingVista('reclutamiento')}>Reclutamiento</button>
      </div>

      {marketingVista==='ventas' && <>
      <div className="filtros-avanzados marketing-filtros">
        <div className="filtros-titulo">Filtros del reporte</div>
        <div className="filtros-grid">
          <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingFiltros.desde} hasta={marketingFiltros.hasta} onChange={v=>setMarketingFiltros(p=>({...p,...v}))} /></label>
          <label><span>Campaña</span><select value={marketingFiltros.campana} onChange={e=>setMarketingFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <label><span>Tipificación</span><select value={marketingFiltros.tipificacion} onChange={e=>setMarketingFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{TIPIF_VEND_VENTAS_ACTUALES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
        </div>
      </div>

      {marketingCarga.error && <div className="marketing-error">{marketingCarga.error}</div>}
      <div className="kpi-grid marketing-kpis">
        <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketing.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
        <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketing.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
        <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketing.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
        <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketing.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
        <div className="kpi-card k-orange"><div className="kpi-num">{formatoSoles(resumenCostos.gastoTotal)}</div><div className="kpi-label">Gasto total</div><div className="kpi-sub">publicidad, según filtros</div></div>
        <div className="kpi-card k-red"><div className="kpi-num">{formatoSoles(resumenCostos.costoPorVenta)}</div><div className="kpi-label">Costo por venta</div><div className="kpi-sub">promedio del período</div></div>
      </div>

      <div className="marketing-grid">
        <div className="chart-card marketing-ranking">
          <div className="chart-title-row">
            <span>Volumen de leads por campaña</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{display:'flex',gap:2}}>
                <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
                <button type="button" onClick={()=>setOrdenCampanas('instaladas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='instaladas'?'#0f172a':'#fff',color:ordenCampanas==='instaladas'?'#fff':'#374151',cursor:'pointer'}}>Instaladas</button>
              </div>
              {marketingCarga.cargando&&<small>Actualizando…</small>}
            </div>
          </div>
          <div className="marketing-barras">
            {resumenMarketing.campanas.length===0 && !marketingCarga.cargando
              ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
              : resumenMarketing.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                  <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                  <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketing.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                    <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketing.maxVentas*100)}%`,background:'#86efac'}} /></div>
                    <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} venta{c.ventas===1?'':'s'}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                    <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${c.instaladas ? Math.max(3,c.instaladas/resumenMarketing.maxInstaladas*100) : 0}%`,background:'#38bdf8'}} /></div>
                    <span style={{fontSize:9,color:'#0284c7',fontWeight:600,flexShrink:0}}>{c.instaladas} instalada{c.instaladas===1?'':'s'}</span>
                  </div>
                </div>)}
          </div>
        </div>

        <div className="tabla-wrap marketing-tabla-card">
          <div className="tabla-header"><span className="tabla-title">Costos por campaña</span><span className="tabla-count">{resumenCostos.filas.length} campañas</span></div>
          <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
            <thead><tr><th>Campaña</th><th>Leads</th><th>Ventas</th><th>Gasto</th><th>Costo por lead</th><th>Costo por venta</th><th>Acciones</th></tr></thead>
            <tbody>
              {resumenCostos.filas.length===0
                ? <tr><td colSpan="7" className="tabla-empty">Sin campañas para los filtros seleccionados.</td></tr>
                : resumenCostos.filas.map(c => {
                  const entradas = marketingCostos.filter(e => e.campana === c.campana)
                  return (
                    <Fragment key={c.campana}>
                      <tr>
                        <td><strong>{c.campana}</strong></td>
                        <td>{c.leads}</td>
                        <td>{c.ventas}</td>
                        <td>{formatoSoles(c.gasto)}</td>
                        <td>{formatoSoles(c.costoPorLead)}</td>
                        <td>{formatoSoles(c.costoPorVenta)}</td>
                        <td>
                          <div style={{display:'flex',gap:6}}>
                            <IconEditar activo={costoEditando===c.campana} onClick={()=>abrirPanelCosto(c.campana)} />
                            <IconDocumento onClick={()=>abrirPanelCosto(c.campana)} />
                          </div>
                        </td>
                      </tr>
                      {costoEditando === c.campana && (
                        <tr>
                          <td colSpan="7">
                            <div style={{padding:'8px 0'}}>
                              <div className="filtros-grid">
                                <label>
                                  <span>Fecha</span>
                                  <input type="date" value={costoForm.fecha} onChange={e=>setCostoForm(p=>({...p,fecha:e.target.value}))} />
                                </label>
                                <label>
                                  <span>Monto (S/)</span>
                                  <input type="number" min="0" step="0.01" value={costoForm.monto} onChange={e=>setCostoForm(p=>({...p,monto:e.target.value}))} />
                                </label>
                                <label className="filtro-busqueda">
                                  <span>Notas (opcional)</span>
                                  <input value={costoForm.notas} onChange={e=>setCostoForm(p=>({...p,notas:e.target.value}))} />
                                </label>
                                <button type="button" className="btn-nuevo" disabled={guardandoCosto || !costoForm.fecha || !costoForm.monto} onClick={()=>guardarCosto(c.campana,'ventas')}>
                                  {guardandoCosto ? 'Guardando…' : entradaEditando ? 'Actualizar' : 'Guardar'}
                                </button>
                                {entradaEditando && <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{ setEntradaEditando(null); setCostoForm({fecha:fechaHoy(),monto:'',notas:''}) }}>Cancelar edición</button>}
                              </div>
                              {entradas.length > 0 && (
                                <table className="tabla marketing-tabla" style={{marginTop:10}}>
                                  <thead><tr><th>Fecha</th><th>Monto</th><th>Notas</th><th>Registrado por</th><th></th></tr></thead>
                                  <tbody>
                                    {entradas.map(en => (
                                      <tr key={en.id}>
                                        <td>{String(en.fecha).slice(0,10)}</td>
                                        <td>{formatoSoles(en.monto)}</td>
                                        <td>{en.notas || '—'}</td>
                                        <td>{en.creado_por || '—'}</td>
                                        <td>
                                          <div style={{display:'flex',gap:6}}>
                                            <button type="button" className="venta-action-btn" onClick={()=>editarEntradaCosto(en)}>Editar</button>
                                            <button type="button" className="venta-action-btn delete" onClick={()=>eliminarCosto(en,'ventas')}>Eliminar</button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table></div>
        </div>
      </div>
      </>}

      {marketingVista==='reclutamiento' && <>
      <div className="filtros-avanzados marketing-filtros">
        <div className="filtros-titulo">Filtros del reporte</div>
        <div className="filtros-grid">
          <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingReclFiltros.desde} hasta={marketingReclFiltros.hasta} onChange={v=>setMarketingReclFiltros(p=>({...p,...v}))} /></label>
          <label><span>Campaña</span><select value={marketingReclFiltros.campana} onChange={e=>setMarketingReclFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingReclCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <label><span>Tipificación</span><select value={marketingReclFiltros.tipificacion} onChange={e=>setMarketingReclFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{marketingReclCatalogos.tipificaciones.map(v=><option key={v} value={v}>{labelTipifVendRecl(v)}</option>)}</select></label>
          <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingReclFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
        </div>
      </div>

      {marketingReclCarga.error && <div className="marketing-error">{marketingReclCarga.error}</div>}
      <div className="kpi-grid marketing-kpis">
        <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketingRecl.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
        <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketingRecl.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
        <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketingRecl.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
        <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketingRecl.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
        <div className="kpi-card k-orange"><div className="kpi-num">{formatoSoles(resumenCostosRecl.gastoTotal)}</div><div className="kpi-label">Gasto total</div><div className="kpi-sub">publicidad, según filtros</div></div>
        <div className="kpi-card k-red"><div className="kpi-num">{formatoSoles(resumenCostosRecl.costoPorVenta)}</div><div className="kpi-label">Costo por venta</div><div className="kpi-sub">promedio del período</div></div>
      </div>

      <div className="marketing-grid">
        <div className="chart-card marketing-ranking">
          <div className="chart-title-row">
            <span>Volumen de leads por campaña</span>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{display:'flex',gap:2}}>
                <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
              </div>
              {marketingReclCarga.cargando&&<small>Actualizando…</small>}
            </div>
          </div>
          <div className="marketing-barras">
            {resumenMarketingRecl.campanas.length===0 && !marketingReclCarga.cargando
              ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
              : resumenMarketingRecl.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                  <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                  <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketingRecl.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                    <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketingRecl.maxVentas*100)}%`,background:'#86efac'}} /></div>
                    <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} acepta{c.ventas===1?'':'n'} propuesta</span>
                  </div>
                </div>)}
          </div>
        </div>

        <div className="tabla-wrap marketing-tabla-card">
          <div className="tabla-header"><span className="tabla-title">Costos por campaña</span><span className="tabla-count">{resumenCostosRecl.filas.length} campañas</span></div>
          <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
            <thead><tr><th>Campaña</th><th>Leads</th><th>Ventas</th><th>Gasto</th><th>Costo por lead</th><th>Costo por venta</th><th>Acciones</th></tr></thead>
            <tbody>
              {resumenCostosRecl.filas.length===0
                ? <tr><td colSpan="7" className="tabla-empty">Sin campañas para los filtros seleccionados.</td></tr>
                : resumenCostosRecl.filas.map(c => {
                  const entradas = marketingCostosRecl.filter(e => e.campana === c.campana)
                  return (
                    <Fragment key={c.campana}>
                      <tr>
                        <td><strong>{c.campana}</strong></td>
                        <td>{c.leads}</td>
                        <td>{c.ventas}</td>
                        <td>{formatoSoles(c.gasto)}</td>
                        <td>{formatoSoles(c.costoPorLead)}</td>
                        <td>{formatoSoles(c.costoPorVenta)}</td>
                        <td>
                          <div style={{display:'flex',gap:6}}>
                            <IconEditar activo={costoEditando===c.campana} onClick={()=>abrirPanelCosto(c.campana)} />
                            <IconDocumento onClick={()=>abrirPanelCosto(c.campana)} />
                          </div>
                        </td>
                      </tr>
                      {costoEditando === c.campana && (
                        <tr>
                          <td colSpan="7">
                            <div style={{padding:'8px 0'}}>
                              <div className="filtros-grid">
                                <label>
                                  <span>Fecha</span>
                                  <input type="date" value={costoForm.fecha} onChange={e=>setCostoForm(p=>({...p,fecha:e.target.value}))} />
                                </label>
                                <label>
                                  <span>Monto (S/)</span>
                                  <input type="number" min="0" step="0.01" value={costoForm.monto} onChange={e=>setCostoForm(p=>({...p,monto:e.target.value}))} />
                                </label>
                                <label className="filtro-busqueda">
                                  <span>Notas (opcional)</span>
                                  <input value={costoForm.notas} onChange={e=>setCostoForm(p=>({...p,notas:e.target.value}))} />
                                </label>
                                <button type="button" className="btn-nuevo" disabled={guardandoCosto || !costoForm.fecha || !costoForm.monto} onClick={()=>guardarCosto(c.campana,'reclutamiento')}>
                                  {guardandoCosto ? 'Guardando…' : entradaEditando ? 'Actualizar' : 'Guardar'}
                                </button>
                                {entradaEditando && <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{ setEntradaEditando(null); setCostoForm({fecha:fechaHoy(),monto:'',notas:''}) }}>Cancelar edición</button>}
                              </div>
                              {entradas.length > 0 && (
                                <table className="tabla marketing-tabla" style={{marginTop:10}}>
                                  <thead><tr><th>Fecha</th><th>Monto</th><th>Notas</th><th>Registrado por</th><th></th></tr></thead>
                                  <tbody>
                                    {entradas.map(en => (
                                      <tr key={en.id}>
                                        <td>{String(en.fecha).slice(0,10)}</td>
                                        <td>{formatoSoles(en.monto)}</td>
                                        <td>{en.notas || '—'}</td>
                                        <td>{en.creado_por || '—'}</td>
                                        <td>
                                          <div style={{display:'flex',gap:6}}>
                                            <button type="button" className="venta-action-btn" onClick={()=>editarEntradaCosto(en)}>Editar</button>
                                            <button type="button" className="venta-action-btn delete" onClick={()=>eliminarCosto(en,'reclutamiento')}>Eliminar</button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table></div>
        </div>
      </div>
      </>}
    </>
  )
}
