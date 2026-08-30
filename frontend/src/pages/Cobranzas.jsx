import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usuarioTieneCargo } from '../utils/roles'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import { API, ncHeaders } from '../services/api'
import '../styles/cobranzas.css'

const PAGE_SIZE = 25

const COBRANZA_TIPIFICACIONES = ['PAGADO', 'PENDIENTE', 'BAJA', 'SUSPENDIDO', 'VENCIDO']

// Resultado de la llamada de cobranza a un recibo (distinto del estado de pago de arriba).
const TIPIFICACIONES_LLAMADA_COBRANZA = [
  'PAGO', 'NO CONTESTA', 'CORTA LLAMADA', 'GENERAR DESCUENTO', 'NO PAGARÁ',
  'CONFORME', 'PROBLEMAS CON EL SERVICIO', 'AGENDADO', 'NUMERO INCORRECTO', 'NO TIENE WHATSAPP',
]

function claseLlamadaCobranza(valor) {
  const texto = String(valor || '').toUpperCase()
  if (['PAGO', 'CONFORME'].includes(texto)) return 'positivo'
  if (['NO PAGARÁ', 'NUMERO INCORRECTO'].includes(texto)) return 'negativo'
  if (['GENERAR DESCUENTO', 'PROBLEMAS CON EL SERVICIO'].includes(texto)) return 'alerta'
  if (['AGENDADO'].includes(texto)) return 'informativo'
  return 'pendiente'
}

// Replica FECHA.MES/EDATE de Excel: suma n meses y recorta al ultimo dia del
// mes destino si el dia de origen no existe ahi (31 ene + 1 mes = 28/29 feb).
function sumarMesesExcel(fecha, n) {
  const anio = fecha.getFullYear()
  const mesDestino = fecha.getMonth() + n
  const ultimoDia = new Date(anio, mesDestino + 1, 0).getDate()
  return new Date(anio, mesDestino, Math.min(fecha.getDate(), ultimoDia))
}

// Replica las formulas de Excel dadas por Cobranza para los 6 vencimientos:
// venc1 = FECHA(anio,mes,ciclo+18) de la instalacion (empujado 1 mes si cae antes
// de la instalacion); venc2..6 = FECHA.MES(anterior, 1).
function calcularVencimientosRecibos(fechaInstalacionValor, ciclo) {
  const cicloNum = Number(ciclo)
  const fechaInstalacionIso = fechaISO(fechaInstalacionValor)
  if (!fechaInstalacionIso || !Number.isInteger(cicloNum)) return []
  const instalacion = new Date(`${fechaInstalacionIso}T00:00:00`)
  if (Number.isNaN(instalacion.getTime())) return []
  let vencimiento = new Date(instalacion.getFullYear(), instalacion.getMonth(), cicloNum + 18)
  if (vencimiento < instalacion) vencimiento = sumarMesesExcel(vencimiento, 1)
  const fechas = [vencimiento]
  for (let i = 1; i < 6; i++) fechas.push(sumarMesesExcel(fechas[i - 1], 1))
  return fechas.map(f => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`)
}

const TIPIFICACIONES_CALIDAD = {
  llamada: ['PENDIENTE', 'CONTESTA', 'NO CONTESTA', 'APAGADO', 'CORTA LLAMADA'],
  whatsapp: ['PENDIENTE', 'SE ENVIA', 'TIENE', 'NO TIENE'],
  servicio_internet: ['PENDIENTE', 'TODO CORRECTO', 'INTERMITENCIAS CON EL SERVICIO', 'NO RECONOCE LA TITULARIDAD', 'NO ES LA MISMA VELOCIDAD CONTRATADA', 'PROBLEMA SOLUCIONADO', 'OTROS'],
  servicio_instalacion: ['PENDIENTE', 'TODO CORRECTO', 'INTERMITENCIAS CON EL SERVICIO', 'NO RECONOCE LA TITULARIDAD', 'NO ES LA MISMA VELOCIDAD CONTRATADA', 'PROBLEMA SOLUCIONADO', 'OTROS'],
  ofrecieron_adicionales: ['PENDIENTE', 'NO', 'SI', 'SI, PERO NO SE BRINDO'],
  adicional: ['PENDIENTE', 'IPTV', 'NETFLIX', 'STAR+', 'DISNEY+', 'OTROS', 'CRUNCHYROLL', 'REPETIDOR'],
  estado_cliente: ['PENDIENTE', 'SATISFECHO', 'REGULAR', 'INSATISFECHO', 'OBSERVADO', 'NO RECONOCE EL SERVICIO', 'BAJA'],
}

function fechaISO(valor) {
  if (!valor) return ''
  return String(valor).slice(0, 10)
}

function fechaVisible(valor) {
  const iso = fechaISO(valor)
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fechaHoraVisible(valor) {
  if (!valor) return '—'
  const fecha = new Date(String(valor).replace(' ', 'T'))
  if (Number.isNaN(fecha.getTime())) return fechaVisible(valor)
  return fecha.toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function claseCalidad(valor) {
  const texto = String(valor || 'PENDIENTE').toUpperCase()
  if (texto === 'PENDIENTE') return 'pendiente'
  if (['CONTESTA','SE ENVIA','TIENE','TODO CORRECTO','PROBLEMA SOLUCIONADO','SI','SATISFECHO'].includes(texto)) return 'positivo'
  if (['NO CONTESTA','APAGADO','CORTA LLAMADA','NO TIENE','INSATISFECHO','NO RECONOCE EL SERVICIO','BAJA','NO RECONOCE LA TITULARIDAD'].includes(texto)) return 'negativo'
  if (texto.includes('INTERMITENCIA') || texto.includes('NO ES LA MISMA') || texto === 'REGULAR' || texto === 'OBSERVADO' || texto.includes('NO SE BRINDO')) return 'alerta'
  return 'informativo'
}

// Catálogo de estados del panel de Rendimiento de Super Calidad (orden fijo,
// usado por los KPIs, la distribución mensual y las tarjetas de personal).
const CAMPOS_ESTADO_CALIDAD = ['pendiente', 'satisfecho', 'regular', 'insatisfecho', 'observado', 'no_reconoce_servicio', 'baja']
const ESTADOS_CALIDAD_INFO = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'satisfecho', label: 'Satisfecho' },
  { key: 'regular', label: 'Regular' },
  { key: 'insatisfecho', label: 'Insatisfecho' },
  { key: 'observado', label: 'Observado' },
  { key: 'no_reconoce_servicio', label: 'No reconoce' },
  { key: 'baja', label: 'Baja' },
]

// Fórmula de efectividad de Calidad — no existía una definición previa en el
// sistema (revisado en backend y frontend), así que se usa temporalmente:
// satisfechos / gestiones cerradas × 100, donde "cerradas" excluye Pendiente.
// Centralizada aquí: para cambiar la fórmula solo hace falta tocar esta función.
// La lista de "cerradas" se deriva de CAMPOS_ESTADO_CALIDAD (todo menos
// pendiente) para que ambas listas nunca puedan desincronizarse.
const CAMPOS_CERRADOS_CALIDAD = CAMPOS_ESTADO_CALIDAD.filter(campo => campo !== 'pendiente')
function calcularEfectividad(totales) {
  const cerradas = CAMPOS_CERRADOS_CALIDAD.reduce((suma, campo) => suma + Number(totales?.[campo] || 0), 0)
  const pct = cerradas ? (Number(totales?.satisfecho || 0) / cerradas) * 100 : 0
  return { cerradas, pct }
}

function FiltroColumna({ titulo, opciones, seleccionados, onChange, buscable = false }) {
  const [abierto, setAbierto] = useState(false)
  const [buscar, setBuscar] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = evento => { if (!ref.current?.contains(evento.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const visibles = opciones.filter(opcion => !buscar || opcion.toLowerCase().includes(buscar.toLowerCase()))
  const todosMarcados = seleccionados === null || (opciones.length > 0 && seleccionados.length === opciones.length)
  const alternar = opcion => {
    const actuales = todosMarcados ? [...opciones] : seleccionados
    onChange(actuales.includes(opcion)
      ? actuales.filter(valor => valor !== opcion)
      : [...actuales, opcion])
  }
  return (
    <div className="calidad-filtro-columna" ref={ref}>
      <button type="button" className={!todosMarcados ? 'activo' : ''} onClick={() => setAbierto(valor => !valor)}>
        {titulo}<span>▼</span>
      </button>
      {abierto && <div className="calidad-filtro-menu">
        {buscable && <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={`Buscar ${titulo.toLowerCase()}…`} />}
        <label className="calidad-filtro-todos"><input type="checkbox" checked={todosMarcados} onChange={() => onChange(todosMarcados ? [] : null)} /> Todos</label>
        <div className="calidad-filtro-opciones">
          {visibles.map(opcion => <label key={opcion}><input type="checkbox" checked={todosMarcados || seleccionados.includes(opcion)} onChange={() => alternar(opcion)} /> {opcion}</label>)}
          {!visibles.length && <small>Sin resultados</small>}
        </div>
      </div>}
    </div>
  )
}

export default function Cobranzas({ areaNombre = 'Cobranzas', modoSupervisorCalidad = false }) {
  const navigate = useNavigate()
  const { sesion, logout } = useAuth()
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState('')
  const [usuariosCalidad, setUsuariosCalidad] = useState([])
  const [clienteCalidad, setClienteCalidad] = useState(null)
  const [clienteCobranza, setClienteCobranza] = useState(null)
  const [cicloInput, setCicloInput] = useState('')
  const [codigoPagoInput, setCodigoPagoInput] = useState('')
  const [comentarioCobranza, setComentarioCobranza] = useState('')
  const [comentarioCalidad, setComentarioCalidad] = useState('')
  const [historialCalidad, setHistorialCalidad] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [filtroVendedores, setFiltroVendedores] = useState(null)
  const [filtroEstados, setFiltroEstados] = useState(null)
  const [ordenPendientesPrimero, setOrdenPendientesPrimero] = useState(false)
  const [pestanaCalidad, setPestanaCalidad] = useState('llamadas')
  const [fechaKpiCalidad, setFechaKpiCalidad] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone:'America/Lima' }))
  const [cargandoRendimiento, setCargandoRendimiento] = useState(false)
  const [mesRendimiento, setMesRendimiento] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone:'America/Lima' }).slice(0, 7))
  const [porUsuarioRendimiento, setPorUsuarioRendimiento] = useState([])
  const [porDiaRendimiento, setPorDiaRendimiento] = useState([])
  const [encargadoRendimiento, setEncargadoRendimiento] = useState('')
  const canvasEvolucion = useRef(null)
  const instEvolucion = useRef(null)
  const peticionRendimientoRef = useRef(0)
  // Jefatura las supervisa al entrar por Accesos directos, pero solo Calidad edita.
  const esCalidad = areaNombre.toLowerCase().includes('calidad') && ['calidad','supcalidad'].includes(sesion?.cargo)
  const puedeEditarCalidad = esCalidad && !sesion?._actorJefatura
  const esCobranza = areaNombre.toLowerCase().includes('cobranza') && usuarioTieneCargo(sesion, 'cobranzas')
  const puedeEditarCobranza = esCobranza && !sesion?._actorJefatura

  const cargar = useCallback(async () => {
    setCargando(true)
    setMensaje('')
    try {
      const res = await fetch(`${API}/ventas/cobranzas-listado`, { headers: ncHeaders() })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo cargar Cobranzas')
      setClientes(Array.isArray(json.data) ? json.data : [])
      setUsuariosCalidad(Array.isArray(json.usuariosCalidad) ? json.usuariosCalidad : [])
    } catch (error) {
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarRendimiento = useCallback(async () => {
    if (!modoSupervisorCalidad) return
    const [anioStr, mesStr] = mesRendimiento.split('-')
    const anio = Number(anioStr)
    const mes = Number(mesStr)
    if (!Number.isInteger(anio) || !Number.isInteger(mes)) return
    // Guarda de orden: si el usuario cambia de mes antes de que responda la
    // petición anterior, solo se aplica la respuesta de la petición más reciente.
    const idPeticion = ++peticionRendimientoRef.current
    setCargandoRendimiento(true)
    setMensaje('')
    try {
      const res = await fetch(`${API}/ventas/calidad-rendimiento?anio=${anio}&mes=${mes}`, { headers:ncHeaders() })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo cargar el rendimiento')
      if (idPeticion !== peticionRendimientoRef.current) return
      setPorUsuarioRendimiento(Array.isArray(json.porUsuario) ? json.porUsuario : [])
      setPorDiaRendimiento(Array.isArray(json.porDia) ? json.porDia : [])
    } catch (error) {
      if (idPeticion !== peticionRendimientoRef.current) return
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally {
      if (idPeticion === peticionRendimientoRef.current) setCargandoRendimiento(false)
    }
  }, [mesRendimiento, modoSupervisorCalidad])

  useEffect(() => {
    if (pestanaCalidad === 'rendimiento') cargarRendimiento()
  }, [pestanaCalidad, cargarRendimiento])

  useEffect(() => {
    if (!clienteCalidad) return undefined
    const cerrar = evento => { if (evento.key === 'Escape') setClienteCalidad(null) }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [clienteCalidad])

  useEffect(() => {
    if (!clienteCobranza) return undefined
    const cerrar = evento => { if (evento.key === 'Escape') setClienteCobranza(null) }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [clienteCobranza])

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const resultado = clientes.filter(cliente => {
      if (modoSupervisorCalidad && pestanaCalidad === 'ventas' && !cliente.calidad_tratamiento_at) return false
      const fecha = fechaISO(cliente.fecha_instalacion)
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      if (filtroVendedores !== null && !filtroVendedores.includes(String(cliente.vendedor_nombre || 'SIN VENDEDOR').trim())) return false
      if (filtroEstados !== null && !filtroEstados.includes(String(cliente.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase())) return false
      if (!texto) return true
      return [cliente.nombre, cliente.dni, cliente.sot, cliente.telefono1, cliente.telefono2, cliente.vendedor_nombre, cliente.paquete]
        .some(valor => String(valor || '').toLowerCase().includes(texto))
    })
    if (!ordenPendientesPrimero) return resultado
    // Pendientes arriba, satisfechos al final; el resto de estados queda en medio
    // conservando su orden original (sort estable).
    const rangoEstado = cliente => {
      const estado = String(cliente.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase()
      if (estado === 'PENDIENTE') return 0
      if (estado === 'SATISFECHO') return 2
      return 1
    }
    return [...resultado].sort((a, b) => rangoEstado(a) - rangoEstado(b))
  }, [clientes, busqueda, desde, hasta, filtroVendedores, filtroEstados, modoSupervisorCalidad, pestanaCalidad, ordenPendientesPrimero])

  useEffect(() => { setPagina(1) }, [busqueda, desde, hasta, filtroVendedores, filtroEstados])

  const vendedoresFiltro = useMemo(() => [...new Set(clientes.map(cliente => String(cliente.vendedor_nombre || 'SIN VENDEDOR').trim()))].sort((a, b) => a.localeCompare(b, 'es')), [clientes])
  const estadosFiltro = useMemo(() => [...new Set([
    ...TIPIFICACIONES_CALIDAD.estado_cliente,
    ...clientes.map(cliente => String(cliente.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase()),
  ])].sort((a, b) => a.localeCompare(b, 'es')), [clientes])

  // Agrupa por mes de instalación (más reciente primero) para el landing de
  // tarjetas — evita mostrar la tabla plana completa de una vez según crece.
  const clientesPorMes = useMemo(() => {
    const nombresMes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    const mapa = new Map()
    filtrados.forEach(cliente => {
      const iso = fechaISO(cliente.fecha_instalacion)
      const clave = iso ? iso.slice(0, 7) : 'sin-fecha'
      if (!mapa.has(clave)) mapa.set(clave, [])
      mapa.get(clave).push(cliente)
    })
    return [...mapa.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([clave, clientesMes]) => {
        let label = 'Sin fecha'
        if (clave !== 'sin-fecha') {
          const [anio, mes] = clave.split('-')
          const nombre = nombresMes[Number(mes) - 1] || mes
          label = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`
        }
        return { clave, label, clientes: clientesMes }
      })
  }, [filtrados])
  // Tarjetas por mes solo como landing por defecto: en cuanto haya un rango
  // de fechas o una búsqueda activa, se muestra la tabla plana filtrada (clic
  // en una tarjeta de mes fija ese rango).
  const mostrarMesesCalidad = esCalidad && pestanaCalidad === 'llamadas' && !desde && !hasta && !busqueda.trim()
  const mostrarMesesCobranza = !esCalidad && !desde && !hasta && !busqueda.trim()
  const mostrarMeses = esCalidad ? mostrarMesesCalidad : mostrarMesesCobranza

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const visibles = filtrados.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const instaladosHoy = clientes.filter(c => fechaISO(c.fecha_instalacion) === hoy).length
  const paquetes = new Set(clientes.map(c => String(c.paquete || '').trim()).filter(Boolean)).size
  // KPIs de Calidad: global (todos los instalados vigentes) y del día (gestionados hoy).
  const esConforme = c => String(c.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase() === 'SATISFECHO'
  const totalConformes = clientes.filter(esConforme).length
  const pctConformidad = clientes.length ? Math.round((totalConformes / clientes.length) * 100) : 0
  const mesActualKpi = hoy.slice(0, 7)
  const contactadosMes = clientes.filter(c => fechaISO(c.calidad_tratamiento_at).slice(0, 7) === mesActualKpi).length
  const gestionadosDia = clientes.filter(c => fechaISO(c.calidad_tratamiento_at) === fechaKpiCalidad).length
  const conformesDia = clientes.filter(c => fechaISO(c.calidad_tratamiento_at) === fechaKpiCalidad && esConforme(c)).length
  // Días reales del mes seleccionado (28/29/30/31), a partir del propio Date.
  const diasDelMesRendimiento = useMemo(() => {
    const [anioStr, mesStr] = mesRendimiento.split('-')
    const anio = Number(anioStr)
    const mes = Number(mesStr)
    if (!Number.isInteger(anio) || !Number.isInteger(mes)) return 31
    return new Date(anio, mes, 0).getDate()
  }, [mesRendimiento])

  const etiquetaMesRendimiento = useMemo(() => {
    const [anioStr, mesStr] = mesRendimiento.split('-')
    const anio = Number(anioStr)
    const mes = Number(mesStr)
    if (!Number.isInteger(anio) || !Number.isInteger(mes)) return ''
    const nombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    const nombre = nombres[mes - 1] || ''
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`
  }, [mesRendimiento])

  // Drill-down: persona activa según el filtro de encargado (dropdown, tarjeta o ranking).
  const personaSeleccionadaRendimiento = useMemo(
    () => porUsuarioRendimiento.find(persona => String(persona.id) === encargadoRendimiento) || null,
    [porUsuarioRendimiento, encargadoRendimiento]
  )

  // Totales del período: de la persona seleccionada, o sumados de todo el equipo.
  const totalesRendimiento = useMemo(() => {
    const base = { gestiones:0, pendiente:0, satisfecho:0, regular:0, insatisfecho:0, observado:0, no_reconoce_servicio:0, baja:0 }
    const campos = ['gestiones', ...CAMPOS_ESTADO_CALIDAD]
    if (personaSeleccionadaRendimiento) {
      for (const campo of campos) base[campo] = Number(personaSeleccionadaRendimiento[campo] || 0)
      return base
    }
    return porUsuarioRendimiento.reduce((total, fila) => {
      for (const campo of campos) total[campo] += Number(fila[campo] || 0)
      return total
    }, base)
  }, [porUsuarioRendimiento, personaSeleccionadaRendimiento])

  const efectividadRendimiento = useMemo(() => calcularEfectividad(totalesRendimiento), [totalesRendimiento])

  // Distribución del mes (7 estados): se calcula con los mismos totales ya cargados (sin nuevas consultas).
  const distribucionRendimiento = useMemo(() => {
    if (!totalesRendimiento.gestiones) return null
    return ESTADOS_CALIDAD_INFO.map(info => ({
      ...info,
      cantidad: totalesRendimiento[info.key],
      pct: Math.round((totalesRendimiento[info.key] / totalesRendimiento.gestiones) * 100),
    }))
  }, [totalesRendimiento])

  // Serie diaria para el gráfico de evolución: agrega por-usuario/por-día ya
  // agregado en backend, sin pedir datos nuevos al cambiar de encargado.
  const serieDiariaRendimiento = useMemo(() => {
    const filas = encargadoRendimiento
      ? porDiaRendimiento.filter(fila => String(fila.id) === encargadoRendimiento)
      : porDiaRendimiento
    const campos = ['gestiones', ...CAMPOS_ESTADO_CALIDAD]
    const porDia = new Map()
    for (const fila of filas) {
      const dia = Number(fila.dia)
      const acumulado = porDia.get(dia) || Object.fromEntries(campos.map(campo => [campo, 0]))
      for (const campo of campos) acumulado[campo] += Number(fila[campo] || 0)
      porDia.set(dia, acumulado)
    }
    return Array.from({ length: diasDelMesRendimiento }, (_, indice) => {
      const dia = indice + 1
      const datos = porDia.get(dia) || Object.fromEntries(campos.map(campo => [campo, 0]))
      return { dia, gestiones: datos.gestiones, efectividad: Math.round(calcularEfectividad(datos).pct * 10) / 10 }
    })
  }, [porDiaRendimiento, encargadoRendimiento, diasDelMesRendimiento])

  // Comparación entre encargados, de mayor a menor cantidad de gestiones.
  const rankingRendimiento = useMemo(
    () => [...porUsuarioRendimiento].sort((a, b) => Number(b.gestiones || 0) - Number(a.gestiones || 0)),
    [porUsuarioRendimiento]
  )

  useEffect(() => {
    if (!modoSupervisorCalidad || pestanaCalidad !== 'rendimiento' || !canvasEvolucion.current) return undefined
    let cancelado = false
    ;(async () => {
      const { default: Chart } = await import('chart.js/auto')
      if (cancelado || !canvasEvolucion.current) return
      if (instEvolucion.current) { instEvolucion.current.destroy(); instEvolucion.current = null }
      instEvolucion.current = new Chart(canvasEvolucion.current, {
        data: {
          labels: serieDiariaRendimiento.map(dia => String(dia.dia)),
          datasets: [
            {
              type: 'bar', label: 'Gestiones', yAxisID: 'y', order: 2,
              data: serieDiariaRendimiento.map(dia => dia.gestiones),
              backgroundColor: 'rgba(15,23,42,.72)', borderRadius: 4, maxBarThickness: 22,
            },
            {
              type: 'line', label: 'Efectividad', yAxisID: 'y1', order: 1,
              data: serieDiariaRendimiento.map(dia => dia.efectividad),
              borderColor: '#ea580c', backgroundColor: 'rgba(234,88,12,.08)',
              tension: .35, pointRadius: 2, pointBackgroundColor: '#ea580c', fill: true,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
              beginAtZero: true, position: 'left',
              grid: { color: '#f1f5f9' }, ticks: { precision: 0, font: { size: 10 } },
              title: { display: true, text: 'Gestiones', font: { size: 10, weight: '700' } },
            },
            y1: {
              beginAtZero: true, min: 0, max: 100, position: 'right',
              grid: { display: false }, ticks: { callback: valor => `${valor}%`, font: { size: 10 } },
              title: { display: true, text: 'Efectividad', font: { size: 10, weight: '700' } },
            },
          },
        },
      })
    })()
    return () => {
      cancelado = true
      // Destruye también al salir de la pestaña Rendimiento (no solo al
      // desmontar el componente), para no dejar un Chart.js huérfano atado
      // a un <canvas> que ya no está en el DOM.
      if (instEvolucion.current) { instEvolucion.current.destroy(); instEvolucion.current = null }
    }
  }, [serieDiariaRendimiento, modoSupervisorCalidad, pestanaCalidad])

  useEffect(() => () => { instEvolucion.current?.destroy() }, [])

  function salir() { logout(); navigate('/login') }
  function limpiar() { setBusqueda(''); setDesde(''); setHasta(''); setFiltroVendedores(null); setFiltroEstados(null) }

  async function guardarCalidad(cliente, campo, valor) {
    const propiedad = `calidad_${campo}`
    const anterior = cliente[propiedad] || 'PENDIENTE'
    const clave = `${cliente.id}-${campo}`
    setMensaje('')
    setGuardando(clave)
    setClientes(actuales => actuales.map(c => c.id === cliente.id ? { ...c, [propiedad]: valor } : c))
    setClienteCalidad(actual => actual?.id === cliente.id ? { ...actual, [propiedad]: valor } : actual)
    try {
      const res = await fetch(`${API}/ventas/calidad/${cliente.id}`, {
        method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ campo, valor }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar la tipificación')
    } catch (error) {
      setClientes(actuales => actuales.map(c => c.id === cliente.id ? { ...c, [propiedad]: anterior } : c))
      setClienteCalidad(actual => actual?.id === cliente.id ? { ...actual, [propiedad]: anterior } : actual)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally {
      setGuardando('')
    }
  }

  async function asignarCalidad(cliente, usuarioId) {
    const responsable = usuariosCalidad.find(usuario => String(usuario.id) === String(usuarioId))
    if (!responsable) return
    const anteriorId = cliente.calidad_asignado_a_id
    const anteriorNombre = cliente.calidad_asignado_a_nombre
    const clave = `${cliente.id}-responsable`
    const aplicar = actual => actual?.id === cliente.id
      ? { ...actual, calidad_asignado_a_id: responsable.id, calidad_asignado_a_nombre: responsable.nombre }
      : actual
    setMensaje('')
    setGuardando(clave)
    setClientes(actuales => actuales.map(aplicar))
    setClienteCalidad(aplicar)
    try {
      const res = await fetch(`${API}/ventas/calidad/${cliente.id}/asignar`, {
        method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ usuario_id: responsable.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo asignar el responsable')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id
        ? { ...actual, calidad_asignado_a_id: anteriorId, calidad_asignado_a_nombre: anteriorNombre }
        : actual
      setClientes(actuales => actuales.map(revertir))
      setClienteCalidad(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally {
      setGuardando('')
    }
  }

  function resumenCalidad(cliente) {
    const pendientes = Object.keys(TIPIFICACIONES_CALIDAD)
      .filter(campo => (cliente[`calidad_${campo}`] || 'PENDIENTE') === 'PENDIENTE').length
    return pendientes ? `${pendientes} PENDIENTES` : 'COMPLETADO'
  }

  function abrirCalidad(cliente) {
    setClienteCalidad(cliente)
    setComentarioCalidad(cliente.calidad_comentario || '')
  }

  async function guardarComentario(cliente) {
    const anterior = cliente.calidad_comentario || ''
    const comentario = comentarioCalidad.trim()
    const clave = `${cliente.id}-comentario`
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, calidad_comentario: comentario } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCalidad(aplicar)
    try {
      const res = await fetch(`${API}/ventas/calidad/${cliente.id}/comentario`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ comentario }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar el comentario')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, calidad_comentario: anterior } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCalidad(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  function resumenCobranza(cliente) {
    if (!cliente.cobranza_ciclo_facturacion) return 'SIN CICLO'
    const pagados = [1, 2, 3, 4, 5, 6].filter(n => (cliente[`cobranza_recibo${n}_tipificacion`] || 'PENDIENTE') === 'PAGADO').length
    return pagados === 6 ? 'COMPLETADO' : `${pagados}/6 PAGADOS`
  }

  function abrirCobranza(cliente) {
    setClienteCobranza(cliente)
    setCicloInput(cliente.cobranza_ciclo_facturacion || '')
    setCodigoPagoInput(cliente.cobranza_codigo_pago || '')
    setComentarioCobranza(cliente.cobranza_comentario || '')
  }

  async function guardarCiclo(cliente) {
    const ciclo = Number(cicloInput)
    if (!Number.isInteger(ciclo) || ciclo < 1 || ciclo > 31) { setMensaje('Ingresa un ciclo de facturación válido (1-31)'); return }
    const anterior = cliente.cobranza_ciclo_facturacion
    const clave = `${cliente.id}-ciclo`
    setMensaje('')
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, cobranza_ciclo_facturacion: ciclo } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCobranza(aplicar)
    try {
      const res = await fetch(`${API}/ventas/cobranza/${cliente.id}/ciclo`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ ciclo }) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar el ciclo de facturación')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, cobranza_ciclo_facturacion: anterior } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCobranza(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  async function guardarCodigoPago(cliente) {
    const codigoPago = codigoPagoInput.trim()
    const anterior = cliente.cobranza_codigo_pago || ''
    const clave = `${cliente.id}-codigo`
    setMensaje('')
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, cobranza_codigo_pago: codigoPago } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCobranza(aplicar)
    try {
      const res = await fetch(`${API}/ventas/cobranza/${cliente.id}/codigo-pago`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ codigo_pago: codigoPago }) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar el código de pago')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, cobranza_codigo_pago: anterior } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCobranza(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  async function guardarRecibo(cliente, numero, valor) {
    const propiedad = `cobranza_recibo${numero}_tipificacion`
    const anterior = cliente[propiedad] || 'PENDIENTE'
    const clave = `${cliente.id}-recibo${numero}`
    setMensaje('')
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, [propiedad]: valor } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCobranza(aplicar)
    try {
      const res = await fetch(`${API}/ventas/cobranza/${cliente.id}/recibo`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ numero, valor }) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar la tipificación del recibo')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, [propiedad]: anterior } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCobranza(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  async function guardarReciboLlamada(cliente, numero, valor) {
    const propiedad = `cobranza_recibo${numero}_tipificacion_llamada`
    const propiedadFecha = `cobranza_recibo${numero}_fecha_llamada`
    const anterior = cliente[propiedad] || null
    const anteriorFecha = cliente[propiedadFecha] || null
    const clave = `${cliente.id}-recibo${numero}-llamada`
    setMensaje('')
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, [propiedad]: valor, [propiedadFecha]: new Date().toISOString() } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCobranza(aplicar)
    try {
      const res = await fetch(`${API}/ventas/cobranza/${cliente.id}/recibo-llamada`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ numero, valor }) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar la tipificación de la llamada')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, [propiedad]: anterior, [propiedadFecha]: anteriorFecha } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCobranza(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  async function guardarComentarioCobranza(cliente) {
    const anterior = cliente.cobranza_comentario || ''
    const comentario = comentarioCobranza.trim()
    const clave = `${cliente.id}-comentario-cobranza`
    setMensaje('')
    setGuardando(clave)
    const aplicar = actual => actual?.id === cliente.id ? { ...actual, cobranza_comentario: comentario } : actual
    setClientes(actuales => actuales.map(aplicar)); setClienteCobranza(aplicar)
    try {
      const res = await fetch(`${API}/ventas/cobranza/${cliente.id}/comentario`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ comentario }) })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo guardar el comentario')
    } catch (error) {
      const revertir = actual => actual?.id === cliente.id ? { ...actual, cobranza_comentario: anterior } : actual
      setClientes(actuales => actuales.map(revertir)); setClienteCobranza(revertir)
      setMensaje(error.message || 'Error conectando con el servidor')
    } finally { setGuardando('') }
  }

  async function abrirHistorial(cliente) {
    setCargandoHistorial(true)
    setHistorialCalidad({ cliente, entradas:[] })
    try {
      const res = await fetch(`${API}/ventas/calidad/${cliente.id}/historial`, { headers:ncHeaders() })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.mensaje || 'No se pudo cargar el historial')
      setHistorialCalidad({ cliente, entradas:Array.isArray(json.data) ? json.data : [] })
    } catch (error) {
      setMensaje(error.message || 'Error conectando con el servidor'); setHistorialCalidad(null)
    } finally { setCargandoHistorial(false) }
  }

  return (
    <div className="cobranzas-shell">
      <header className="cobranzas-topbar">
        <div className="cobranzas-brand">
          <img className="cobranzas-logo" src="/assets/logo3.png" alt="" />
          <div>
            <span className="cobranzas-wordmark" style={{fontSize:22,fontWeight:800,letterSpacing:"0.08em",lineHeight:1}}>PRIZMA</span>
            <span>PANEL DE {areaNombre.toUpperCase()}</span>
          </div>
        </div>
        <div className="cobranzas-top-actions">
          <JefaturaViewControls>
            <span className="cobranzas-area-badge">{areaNombre.toUpperCase()}</span>
            <span className="cobranzas-user">{sesion?.nombre || '—'}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="cobranzas-exit" onClick={salir}>Salir</button>
        </div>
      </header>

      <main className="cobranzas-main">
        {!modoSupervisorCalidad && <section className="cobranzas-heading">
          <div><h1>Clientes instalados</h1><p>Información contractual consolidada para el área de {areaNombre}.</p></div>
          <button onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Actualizar'}</button>
        </section>}

        {modoSupervisorCalidad && <section className="sup-calidad-toolbar">
          <nav className="sup-calidad-tabs" aria-label="Secciones de Super de Calidad">
            <button className={pestanaCalidad === 'llamadas' ? 'activo' : ''} onClick={() => setPestanaCalidad('llamadas')}>Llamadas</button>
            <button className={pestanaCalidad === 'rendimiento' ? 'activo' : ''} onClick={() => setPestanaCalidad('rendimiento')}>Rendimiento</button>
          </nav>
          <div className="sup-calidad-toolbar-controls">
            {pestanaCalidad === 'rendimiento' && <>
              <label className="sup-calidad-fecha"><span>MES</span><input type="month" value={mesRendimiento} onChange={e => { if (e.target.value) setMesRendimiento(e.target.value) }} /></label>
              <label className="sup-calidad-encargado"><span>ENCARGADO</span>
                <select value={encargadoRendimiento} onChange={e => setEncargadoRendimiento(e.target.value)}>
                  <option value="">Todos los encargados</option>
                  {porUsuarioRendimiento.map(persona => <option value={String(persona.id)} key={persona.id}>{persona.nombre}</option>)}
                </select>
              </label>
            </>}
            <button className="sup-calidad-actualizar" onClick={pestanaCalidad === 'rendimiento' ? cargarRendimiento : cargar} disabled={cargando || cargandoRendimiento}>{cargando || cargandoRendimiento ? 'Cargando…' : 'Actualizar'}</button>
          </div>
        </section>}

        {pestanaCalidad !== 'rendimiento' && <><section className="cobranzas-kpis">
          <article><strong>{clientes.length}</strong><span>TOTAL INSTALADOS</span></article>
          <article><strong>{instaladosHoy}</strong><span>INSTALADOS HOY</span></article>
          <article><strong>{paquetes}</strong><span>PAQUETES CONTRATADOS</span></article>
        </section>

        <section className="cobranzas-filtros">
          <label className="cobranzas-search"><span>BUSCAR CLIENTE</span><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, documento, SOT, número o paquete…" /></label>
          <label><span>DESDE</span><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label><span>HASTA</span><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          <button onClick={limpiar}>Limpiar</button>
        </section>

        {mostrarMeses ? (
        <section className="calidad-meses-resumen">
          <div className="cobranzas-table-title"><strong>{modoSupervisorCalidad ? 'Llamadas de Calidad' : 'Listado de clientes'}</strong><span>{clientes.length} registros</span></div>
          <div className="calidad-meses-grid">
            {clientesPorMes.filter(grupo => grupo.clave !== 'sin-fecha').map(grupo => {
              const pctMes = esCalidad
                ? (grupo.clientes.length ? Math.round((grupo.clientes.filter(c => String(c.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase() === 'SATISFECHO').length / grupo.clientes.length) * 100) : 0)
                : (grupo.clientes.length ? Math.round((grupo.clientes.filter(c => resumenCobranza(c) === 'COMPLETADO').length / grupo.clientes.length) * 100) : 0)
              const detalle = esCalidad
                ? `${grupo.clientes.filter(c => String(c.calidad_estado_cliente || 'PENDIENTE').trim().toUpperCase() === 'PENDIENTE').length} pendientes`
                : `${grupo.clientes.filter(c => resumenCobranza(c) === 'SIN CICLO').length} sin ciclo`
              return (
                <button type="button" key={grupo.clave} className="calidad-mes-card" onClick={() => {
                  const [anio, mes] = grupo.clave.split('-')
                  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate()
                  setDesde(`${grupo.clave}-01`); setHasta(`${grupo.clave}-${String(ultimoDia).padStart(2, '0')}`)
                }}>
                  <div className="calidad-mes-card-header">
                    <span className="calidad-mes-nombre">{grupo.label}</span>
                    <span className="calidad-mes-total">{grupo.clientes.length} clientes</span>
                  </div>
                  <div className="calidad-mes-barra"><i style={{ width: `${pctMes}%` }} /></div>
                  <div className="calidad-mes-footer">
                    <span className="calidad-mes-pct">{pctMes}% {esCalidad ? 'conformidad' : 'cobranza completa'}</span>
                    <span className="calidad-mes-pendientes">{detalle}</span>
                  </div>
                </button>
              )
            })}
            {!clientesPorMes.filter(grupo => grupo.clave !== 'sin-fecha').length && <div className="cobranzas-empty">No hay clientes instalados para mostrar.</div>}
          </div>
        </section>
        ) : (
        <section className="cobranzas-table-card">
          <div className="cobranzas-table-title">
            <strong>{modoSupervisorCalidad ? 'Llamadas de Calidad' : 'Listado de clientes'}</strong>
            <span>{filtrados.length} registros</span>
            {(desde || hasta) && <button type="button" className="calidad-volver-meses" onClick={() => { setDesde(''); setHasta('') }}>← Todos los meses</button>}
          </div>
          {mensaje && <div className="cobranzas-error">{mensaje}</div>}
          <div className="cobranzas-table-scroll">
            <table>
              <thead><tr><th>#</th><th>NOMBRE DEL CLIENTE</th><th>DOCUMENTO</th><th>SOT</th><th>N1</th><th>N2</th><th>{esCalidad ? <FiltroColumna titulo="VENDEDOR" opciones={vendedoresFiltro} seleccionados={filtroVendedores} onChange={setFiltroVendedores} buscable /> : 'VENDEDOR'}</th><th>FECHA DE INSTALACIÓN</th><th>PAQUETE CONTRATADO</th>{esCalidad && <><th>RESPONSABLE CALIDAD</th><th><div style={{display:'flex',alignItems:'center',gap:4}}><FiltroColumna titulo="ESTADO FINAL" opciones={estadosFiltro} seleccionados={filtroEstados} onChange={setFiltroEstados} /><button type="button" className={`calidad-orden-btn${ordenPendientesPrimero ? ' activo' : ''}`} onClick={() => setOrdenPendientesPrimero(v => !v)} title="Pendientes primero, satisfechos al final">⇅</button></div></th><th>FECHA DE TRATAMIENTO</th><th>GESTIÓN DE CALIDAD</th><th>HISTORIAL</th><th>COMENTARIO</th></>}{esCobranza && <th>COBRANZA</th>}</tr></thead>
              <tbody>
                {!cargando && visibles.map((cliente, index) => (
                  <tr key={cliente.id}>
                    <td>{(paginaSegura - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="cobranzas-name">{cliente.nombre || '—'}</td>
                    <td>{cliente.dni || '—'}</td><td>{cliente.sot || '—'}</td>
                    <td>{cliente.telefono1 || '—'}</td><td>{cliente.telefono2 || '—'}</td><td className="cobranzas-vendedor">{cliente.vendedor_nombre || '—'}</td>
                    <td className="cobranzas-date">{fechaVisible(cliente.fecha_instalacion)}</td>
                    <td>{cliente.paquete || '—'}</td>
                    {esCalidad && <>
                      <td className="calidad-responsable">{cliente.calidad_asignado_a_nombre || 'SIN ASIGNAR'}</td>
                      <td><span className={`calidad-estado-final ${claseCalidad(cliente.calidad_estado_cliente)}`}>{cliente.calidad_estado_cliente || 'PENDIENTE'}</span></td>
                      <td className="calidad-fecha">{fechaHoraVisible(cliente.calidad_tratamiento_at)}</td>
                      <td className="calidad-gestion-cell">
                        <button className={`calidad-gestion-btn ${resumenCalidad(cliente) === 'COMPLETADO' ? 'completo' : ''}`} onClick={() => abrirCalidad(cliente)}>
                          <span>Gestionar calidad</span><small>{resumenCalidad(cliente)}</small>
                        </button>
                      </td>
                      <td><button className="calidad-historial-btn" onClick={() => abrirHistorial(cliente)}>Historial</button></td>
                      <td className="calidad-comentario-col" title={cliente.calidad_comentario || ''}>{cliente.calidad_comentario || '—'}</td>
                    </>}
                    {esCobranza && (
                      <td className="cobranza-gestion-cell">
                        <button className={`cobranza-gestion-btn ${resumenCobranza(cliente) === 'COMPLETADO' ? 'completo' : resumenCobranza(cliente) === 'SIN CICLO' ? 'alerta' : ''}`} onClick={() => abrirCobranza(cliente)}>
                          <span>Gestionar cobranza</span><small>{resumenCobranza(cliente)}</small>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!cargando && !visibles.length && <tr><td colSpan={esCalidad ? 15 : esCobranza ? 10 : 9} className="cobranzas-empty">No hay clientes instalados para los filtros seleccionados.</td></tr>}
                {cargando && <tr><td colSpan={esCalidad ? 15 : esCobranza ? 10 : 9} className="cobranzas-empty">Cargando clientes instalados…</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="cobranzas-pagination">
            <span>Mostrando {visibles.length ? (paginaSegura - 1) * PAGE_SIZE + 1 : 0}–{(paginaSegura - 1) * PAGE_SIZE + visibles.length} de {filtrados.length}</span>
            <div><button disabled={paginaSegura <= 1} onClick={() => setPagina(p => p - 1)}>‹</button><b>Página {paginaSegura} de {totalPaginas}</b><button disabled={paginaSegura >= totalPaginas} onClick={() => setPagina(p => p + 1)}>›</button></div>
          </footer>
        </section>
        )}</>}

        {esCalidad && pestanaCalidad === 'rendimiento' && <>
        <div className="kpis-calidad-dia">
          <label><span>DÍA A CONSULTAR</span><input type="date" value={fechaKpiCalidad} onChange={e => { if (e.target.value) setFechaKpiCalidad(e.target.value) }} /></label>
        </div>
        <section className="cobranzas-kpis kpis-calidad">
            <article><strong>{clientes.length}</strong><span>GLOBAL · INSTALADOS</span></article>
            <article className="kpi-conforme"><strong>{totalConformes}</strong><span>GLOBAL · CONFORMES</span></article>
            <article className="kpi-conforme"><strong>{pctConformidad}%</strong><span>GLOBAL · % CONFORMIDAD</span></article>
            <article><strong>{contactadosMes}</strong><span>MES · CONTACTADOS</span></article>
            <article><strong>{gestionadosDia}</strong><span>DÍA · GESTIONADOS</span></article>
            <article className="kpi-conforme"><strong>{conformesDia}</strong><span>DÍA · CONFORMES</span></article>
        </section>
        </>}

        {modoSupervisorCalidad && pestanaCalidad === 'rendimiento' && <section className="sup-calidad-rendimiento">
          <header>
            <span className="sup-calidad-eyebrow">{personaSeleccionadaRendimiento ? 'DETALLE INDIVIDUAL' : 'RENDIMIENTO DEL EQUIPO'}</span>
            <h2>{personaSeleccionadaRendimiento ? personaSeleccionadaRendimiento.nombre : 'Métricas por personal de Calidad'}</h2>
            <p>
              {personaSeleccionadaRendimiento
                ? `${personaSeleccionadaRendimiento.cargo === 'supcalidad' ? 'Supervisora de Calidad' : 'Personal de Calidad'} · ${etiquetaMesRendimiento}`
                : `Vista mensual de todo el equipo · ${etiquetaMesRendimiento}`}
            </p>
            {personaSeleccionadaRendimiento && (
              <button type="button" className="sup-rend-volver" onClick={() => setEncargadoRendimiento('')}>← Todos los encargados</button>
            )}
          </header>

          <div className="sup-rend-kpis">
            <article><strong>{totalesRendimiento.gestiones}</strong><span>GESTIONES DEL MES</span></article>
            <article><strong>{totalesRendimiento.satisfecho}</strong><span>SATISFECHOS</span></article>
            <article><strong>{totalesRendimiento.regular}</strong><span>REGULARES</span></article>
            <article><strong>{totalesRendimiento.insatisfecho}</strong><span>INSATISFECHOS</span></article>
            <article><strong>{totalesRendimiento.pendiente}</strong><span>PENDIENTES</span></article>
            <article className="sup-rend-kpi-efectividad">
              <strong>{efectividadRendimiento.pct.toFixed(1)}%</strong><span>EFECTIVIDAD</span>
              <small>{totalesRendimiento.satisfecho} de {efectividadRendimiento.cerradas} cerradas</small>
            </article>
          </div>

          {mensaje && <div className="cobranzas-error">{mensaje}</div>}

          <div className="sup-rend-grid">
            <div className="sup-rend-chart-card">
              <div className="sup-rend-card-title">Evolución mensual de Calidad</div>
              <div className="sup-rend-chart-wrap"><canvas ref={canvasEvolucion} /></div>
            </div>
            <div className="sup-rend-distribucion-card">
              <div className="sup-rend-card-title">Distribución del mes</div>
              {distribucionRendimiento ? (<>
                <div className="sup-rend-dist-bar">
                  {distribucionRendimiento.filter(estado => estado.pct > 0).map(estado => (
                    <span key={estado.key} className={`seg-${estado.key}`} style={{ width: `${estado.pct}%` }} title={`${estado.label}: ${estado.cantidad} (${estado.pct}%)`} />
                  ))}
                </div>
                <div className="sup-rend-dist-legend">
                  {distribucionRendimiento.map(estado => (
                    <span key={estado.key} className={`leg-${estado.key}`}>
                      {estado.label}<b>{estado.cantidad}</b><small>{estado.pct}%</small>
                    </span>
                  ))}
                </div>
              </>) : <div className="sup-calidad-sin-datos">Sin gestiones registradas en este período.</div>}
            </div>
          </div>

          {!personaSeleccionadaRendimiento && <div className="sup-rend-ranking-card">
            <div className="sup-rend-card-title">Comparación entre encargados<span>ordenado por gestiones</span></div>
            <div className="sup-rend-ranking-scroll">
              <table className="sup-rend-ranking">
                <thead><tr><th>ENCARGADO</th><th>GESTIONES</th><th>SATISFECHOS</th><th>PENDIENTES</th><th>EFECTIVIDAD</th></tr></thead>
                <tbody>
                  {rankingRendimiento.map(persona => {
                    const efectividad = calcularEfectividad(persona)
                    return (
                      <tr key={persona.id} onClick={() => setEncargadoRendimiento(String(persona.id))}>
                        <td className="sup-rend-ranking-nombre">{persona.nombre}</td>
                        <td>{persona.gestiones}</td>
                        <td>{persona.satisfecho}</td>
                        <td>{persona.pendiente}</td>
                        <td>
                          <div className="sup-rend-ranking-ef">
                            <span>{efectividad.pct.toFixed(1)}%</span>
                            <div className="sup-rend-ranking-ef-track"><div style={{ width: `${Math.min(efectividad.pct, 100)}%` }} /></div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!cargandoRendimiento && !rankingRendimiento.length && <tr><td colSpan={5} className="cobranzas-empty">No hay personal activo de Calidad para mostrar.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>}

          {!personaSeleccionadaRendimiento && <div className="sup-calidad-metricas-grid">
            {porUsuarioRendimiento.map(persona => {
              const efectividad = calcularEfectividad(persona)
              const seleccionar = () => setEncargadoRendimiento(String(persona.id))
              return (
                <article
                  className="sup-calidad-persona" key={persona.id} role="button" tabIndex={0}
                  onClick={seleccionar}
                  onKeyDown={evento => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); seleccionar() } }}
                >
                  <header>
                    <div><strong>{persona.nombre}</strong><span>{persona.cargo === 'supcalidad' ? 'SUPERVISORA DE CALIDAD' : 'PERSONAL DE CALIDAD'}</span></div>
                    <b>{Number(persona.gestiones || 0)}<small>GESTIONES</small></b>
                  </header>
                  <div className="sup-rend-persona-efectividad">
                    <span>Efectividad</span><strong>{efectividad.pct.toFixed(1)}%</strong><small>{persona.satisfecho} / {efectividad.cerradas} cerradas</small>
                  </div>
                  <div>
                    <span className="m-pendiente"><b>{persona.pendiente}</b>PENDIENTE</span>
                    <span className="m-positivo"><b>{persona.satisfecho}</b>SATISFECHO</span>
                    <span className="m-alerta"><b>{persona.regular}</b>REGULAR</span>
                    <span className="m-negativo"><b>{persona.insatisfecho}</b>INSATISFECHO</span>
                    <span className="m-alerta"><b>{persona.observado}</b>OBSERVADO</span>
                    <span className="m-negativo"><b>{persona.no_reconoce_servicio}</b>NO RECONOCE</span>
                    <span className="m-negativo"><b>{persona.baja}</b>BAJA</span>
                  </div>
                </article>
              )
            })}
            {!cargandoRendimiento && !porUsuarioRendimiento.length && <div className="sup-calidad-sin-datos">No hay personal activo de Calidad para mostrar.</div>}
            {cargandoRendimiento && <div className="sup-calidad-sin-datos">Cargando métricas del equipo…</div>}
          </div>}
        </section>}
      </main>

      {esCalidad && clienteCalidad && (
        <div className="calidad-modal-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget) setClienteCalidad(null) }}>
          <section className="calidad-modal" role="dialog" aria-modal="true" aria-label={`Gestión de calidad de ${clienteCalidad.nombre || 'cliente'}`}>
            <header>
              <div><span>GESTIÓN DE CALIDAD</span><h2>{clienteCalidad.nombre || 'Cliente'}</h2><p>Documento: {clienteCalidad.dni || '—'} · SOT: {clienteCalidad.sot || '—'}</p></div>
              <button onClick={() => setClienteCalidad(null)} aria-label="Cerrar">×</button>
            </header>
            <div className="calidad-responsable-box">
              <label><span>RESPONSABLE DE LA LLAMADA DE CALIDAD</span>
                <select value={clienteCalidad.calidad_asignado_a_id || ''} disabled={!puedeEditarCalidad || guardando === `${clienteCalidad.id}-responsable`} onChange={e => asignarCalidad(clienteCalidad, e.target.value)}>
                  <option value="">— Seleccionar personal de Calidad —</option>
                  {usuariosCalidad.map(usuario => <option value={usuario.id} key={usuario.id}>{usuario.nombre}</option>)}
                </select>
              </label>
            </div>
            <div className="calidad-modal-grid">
              {Object.entries(TIPIFICACIONES_CALIDAD).map(([campo, opciones]) => (
                <label key={campo}><span>{campo.replaceAll('_', ' ')}</span>
                  <select
                    value={clienteCalidad[`calidad_${campo}`] || 'PENDIENTE'}
                    disabled={!puedeEditarCalidad || guardando === `${clienteCalidad.id}-${campo}`}
                    onChange={e => guardarCalidad(clienteCalidad, campo, e.target.value)}
                    className={claseCalidad(clienteCalidad[`calidad_${campo}`])}
                  >
                    {opciones.map(opcion => <option value={opcion} key={opcion}>{opcion}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="calidad-comentario-box">
              <label><span>COMENTARIO DE CALIDAD (OPCIONAL)</span><textarea maxLength="1500" value={comentarioCalidad} disabled={!puedeEditarCalidad} onChange={e => setComentarioCalidad(e.target.value)} placeholder="Escribe aquí una observación de la gestión…" /></label>
              {puedeEditarCalidad && <button disabled={guardando === `${clienteCalidad.id}-comentario`} onClick={() => guardarComentario(clienteCalidad)}>{guardando === `${clienteCalidad.id}-comentario` ? 'Guardando…' : 'Guardar comentario'}</button>}
            </div>
            <footer><span>{clienteCalidad.calidad_asignado_a_nombre ? `Asignado a ${clienteCalidad.calidad_asignado_a_nombre}` : 'Selecciona quién realizará la llamada'}</span><button onClick={() => setClienteCalidad(null)}>Cerrar ficha</button></footer>
          </section>
        </div>
      )}

      {esCalidad && historialCalidad && (
        <div className="calidad-modal-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget) setHistorialCalidad(null) }}>
          <section className="calidad-modal calidad-historial-modal" role="dialog" aria-modal="true">
            <header><div><span>HISTORIAL DE CALIDAD</span><h2>{historialCalidad.cliente.nombre || 'Cliente'}</h2><p>Registro completo de responsables, tipificaciones y comentarios</p></div><button onClick={() => setHistorialCalidad(null)}>×</button></header>
            <div className="calidad-historial-lista">
              {cargandoHistorial && <p>Cargando historial…</p>}
              {!cargandoHistorial && !historialCalidad.entradas.length && <p>Este cliente todavía no tiene movimientos de Calidad.</p>}
              {historialCalidad.entradas.map(entrada => <article key={entrada.id}><div><strong>{entrada.campo.replaceAll('_',' ').toUpperCase()}</strong><time>{fechaHoraVisible(entrada.created_at)}</time></div><p><span>{entrada.valor_anterior || '—'}</span><b>→</b><span>{entrada.valor_nuevo || '—'}</span></p><small>Gestionado por {entrada.usuario_nombre || 'Calidad'}</small></article>)}
            </div>
            <footer><span>{historialCalidad.entradas.length} movimientos registrados</span><button onClick={() => setHistorialCalidad(null)}>Cerrar historial</button></footer>
          </section>
        </div>
      )}

      {esCobranza && clienteCobranza && (
        <div className="calidad-modal-overlay" onMouseDown={evento => { if (evento.target === evento.currentTarget) setClienteCobranza(null) }}>
          <section className="calidad-modal" role="dialog" aria-modal="true" aria-label={`Gestión de cobranza de ${clienteCobranza.nombre || 'cliente'}`}>
            <header>
              <div><span>GESTIÓN DE COBRANZA</span><h2>{clienteCobranza.nombre || 'Cliente'}</h2><p>Documento: {clienteCobranza.dni || '—'} · SOT: {clienteCobranza.sot || '—'}</p></div>
              <button onClick={() => setClienteCobranza(null)} aria-label="Cerrar">×</button>
            </header>
            <div className="cobranza-datos-box">
              <label><span>CICLO DE FACTURACIÓN</span>
                <div className="cobranza-input-row">
                  <input type="number" min="1" max="31" value={cicloInput} disabled={!puedeEditarCobranza} onChange={e => setCicloInput(e.target.value)} placeholder="Ej. 5" />
                  {puedeEditarCobranza && <button disabled={guardando === `${clienteCobranza.id}-ciclo`} onClick={() => guardarCiclo(clienteCobranza)}>{guardando === `${clienteCobranza.id}-ciclo` ? 'Guardando…' : 'Guardar'}</button>}
                </div>
              </label>
              <label><span>CÓDIGO DE PAGO</span>
                <div className="cobranza-input-row">
                  <input type="text" maxLength={60} value={codigoPagoInput} disabled={!puedeEditarCobranza} onChange={e => setCodigoPagoInput(e.target.value)} placeholder="Código de pago del cliente" />
                  {puedeEditarCobranza && <button disabled={guardando === `${clienteCobranza.id}-codigo`} onClick={() => guardarCodigoPago(clienteCobranza)}>{guardando === `${clienteCobranza.id}-codigo` ? 'Guardando…' : 'Guardar'}</button>}
                </div>
              </label>
            </div>
            {clienteCobranza.cobranza_ciclo_facturacion ? (
              <div className="cobranza-modal-recibos">
                {calcularVencimientosRecibos(clienteCobranza.fecha_instalacion, clienteCobranza.cobranza_ciclo_facturacion).map((fecha, indice) => {
                  const numero = indice + 1
                  const valorActual = clienteCobranza[`cobranza_recibo${numero}_tipificacion`] || 'PENDIENTE'
                  const valorLlamada = clienteCobranza[`cobranza_recibo${numero}_tipificacion_llamada`] || ''
                  const fechaLlamada = clienteCobranza[`cobranza_recibo${numero}_fecha_llamada`]
                  return (
                    <div className="cobranza-recibo-row" key={numero}>
                      <div className="cobranza-recibo-info">
                        <b>RECIBO {numero}</b><span>Vence {fechaVisible(fecha)}</span>
                        {fechaLlamada && <span className="cobranza-recibo-ultima-llamada">Última llamada: {fechaHoraVisible(fechaLlamada)}</span>}
                      </div>
                      <div className="cobranza-recibo-selects">
                        <select
                          value={valorActual}
                          disabled={!puedeEditarCobranza || guardando === `${clienteCobranza.id}-recibo${numero}`}
                          onChange={e => guardarRecibo(clienteCobranza, numero, e.target.value)}
                          className={`cobranza-tipificacion-${valorActual.toLowerCase()}`}
                          title="Estado de pago"
                        >
                          {COBRANZA_TIPIFICACIONES.map(opcion => <option value={opcion} key={opcion}>{opcion}</option>)}
                        </select>
                        <select
                          value={valorLlamada}
                          disabled={!puedeEditarCobranza || guardando === `${clienteCobranza.id}-recibo${numero}-llamada`}
                          onChange={e => guardarReciboLlamada(clienteCobranza, numero, e.target.value)}
                          className={`cobranza-select-llamada ${claseLlamadaCobranza(valorLlamada)}`}
                          title="Resultado de la llamada"
                        >
                          <option value="">— Sin gestionar —</option>
                          {TIPIFICACIONES_LLAMADA_COBRANZA.map(opcion => <option value={opcion} key={opcion}>{opcion}</option>)}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="cobranza-sin-ciclo">Ingresa el ciclo de facturación para calcular los vencimientos de los 6 recibos.</p>
            )}
            <div className="calidad-comentario-box">
              <label><span>COMENTARIO (OPCIONAL)</span><textarea maxLength="1500" value={comentarioCobranza} disabled={!puedeEditarCobranza} onChange={e => setComentarioCobranza(e.target.value)} placeholder="Escribe aquí una observación de la gestión…" /></label>
              {puedeEditarCobranza && <button disabled={guardando === `${clienteCobranza.id}-comentario-cobranza`} onClick={() => guardarComentarioCobranza(clienteCobranza)}>{guardando === `${clienteCobranza.id}-comentario-cobranza` ? 'Guardando…' : 'Guardar comentario'}</button>}
            </div>
            <footer><span>{resumenCobranza(clienteCobranza)}</span><button onClick={() => setClienteCobranza(null)}>Cerrar ficha</button></footer>
          </section>
        </div>
      )}
    </div>
  )
}
