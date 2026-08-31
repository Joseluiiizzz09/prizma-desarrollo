import { lazy, Suspense, Component } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { leerSesionActual, useAuth } from './hooks/useAuth'
import { cargosDeUsuario } from './utils/roles'
import { RUTAS } from './utils/rutas'

// Cada despliegue genera archivos con nombre distinto (hash de contenido).
// Una pestaña que ya estaba abierta desde antes del despliegue sigue
// referenciando el archivo viejo, que ya no existe en el servidor — al
// navegar a un modulo que no se habia cargado aun, el import() falla y la
// pantalla se queda en blanco sin ningun aviso. Esto detecta esa falla
// puntual y recarga la pagina una sola vez (evita bucle con sessionStorage)
// en vez de dejarla en blanco.
function lazyConRecarga(cargar) {
  return lazy(() =>
    cargar().catch(err => {
      const yaRecargo = sessionStorage.getItem('nc_recarga_por_chunk')
      if (!yaRecargo) {
        sessionStorage.setItem('nc_recarga_por_chunk', '1')
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    })
  )
}

const Login = lazyConRecarga(() => import('./pages/Login'))
const Dashboard = lazyConRecarga(() => import('./pages/Dashboard'))
const Backoffice = lazyConRecarga(() => import('./pages/Backoffice'))
const Supervisor = lazyConRecarga(() => import('./pages/Supervisor'))
const Validacion = lazyConRecarga(() => import('./pages/Validacion'))
const Seguimiento = lazyConRecarga(() => import('./pages/Seguimiento'))
const Grabaciones = lazyConRecarga(() => import('./pages/Grabaciones'))
const Cobranzas = lazyConRecarga(() => import('./pages/Cobranzas'))
const Calidad = lazyConRecarga(() => import('./pages/Calidad'))
const SupCalidad = lazyConRecarga(() => import('./pages/SupCalidad'))
const Jefatura = lazyConRecarga(() => import('./pages/Jefatura'))
const Usuarios = lazyConRecarga(() => import('./pages/Usuarios'))
const Backdatareclutamiento = lazyConRecarga(() => import('./pages/Backdatareclutamiento'))
const DashboardReclutamiento = lazyConRecarga(() => import('./pages/dashboardreclutamiento'))
const MarketingLeads = lazyConRecarga(() => import('./pages/MarketingLeads'))

// Sin esto, un error de render en cualquier pantalla (bug real o modulo que
// no cargo) deja la pagina completamente en blanco y sin ningun aviso —
// como paso con el bucle de redireccion de PrivateRoute. Muestra el error y
// un boton para recargar en vez de quedar en silencio.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#f5f6fa', color:'#334155', fontFamily:"'DM Sans', sans-serif", padding:20, textAlign:'center' }}>
          <div>
            <p style={{ fontWeight:700, marginBottom:8 }}>Ocurrió un error al cargar la página.</p>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:16, maxWidth:480 }}>{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => window.location.reload()} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'#ea580c', color:'#fff', fontWeight:700, cursor:'pointer' }}>Recargar</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteLoader() {
  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#f5f6fa', color:'#64748b', fontFamily:"'DM Sans', sans-serif" }}>
      Cargando módulo…
    </div>
  )
}

function rutaInicialAutorizada(sesion) {
  return cargosDeUsuario(sesion).map(cargo => RUTAS[cargo]).find(Boolean) || '/login'
}

function PrivateRoute({ children, cargo }) {
  // sessionStorage es la fuente autoritativa durante una vista delegada.
  // Leerla aquí evita una carrera entre navigate() y el setState de useAuth.
  useAuth() // mantiene este componente reactivo ante login/logout/cambio de vista
  const sesion = leerSesionActual()
  if (!sesion) return <Navigate to="/login" replace />
  const cargosPermitidos = Array.isArray(cargo) ? cargo : cargo ? [cargo] : null
  if (cargosPermitidos && !cargosPermitidos.some(c => cargosDeUsuario(sesion).includes(c))) {
    return <Navigate to={rutaInicialAutorizada(sesion)} replace />
  }
  return children
}

function InicioAutorizado() {
  useAuth()
  const sesion = leerSesionActual()
  return <Navigate to={sesion ? rutaInicialAutorizada(sesion) : '/login'} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<RouteLoader />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<InicioAutorizado />} />

      <Route path="/dashboard"     element={<PrivateRoute cargo="asesor"><Dashboard /></PrivateRoute>} />
      <Route path="/backoffice"    element={<PrivateRoute cargo="backoffice"><Backoffice /></PrivateRoute>} />
      <Route path="/supervisor"    element={<PrivateRoute cargo="supervisor"><Supervisor /></PrivateRoute>} />
      <Route path="/validacion"    element={<PrivateRoute cargo="validacion"><Validacion /></PrivateRoute>} />
      <Route path="/seguimiento"   element={<PrivateRoute cargo="seguimiento"><Seguimiento /></PrivateRoute>} />
      <Route path="/grabaciones"   element={<PrivateRoute cargo="grabaciones"><Grabaciones /></PrivateRoute>} />
      <Route path="/cobranzas"     element={<PrivateRoute cargo="cobranzas"><Cobranzas /></PrivateRoute>} />
      <Route path="/calidad"       element={<PrivateRoute cargo="calidad"><Calidad /></PrivateRoute>} />
      <Route path="/sup-calidad"   element={<PrivateRoute cargo="supcalidad"><SupCalidad /></PrivateRoute>} />
      <Route path="/jefatura"      element={<PrivateRoute cargo="jefatura"><Jefatura /></PrivateRoute>} />
      <Route path="/usuarios"      element={<PrivateRoute cargo="usuarios"><Usuarios /></PrivateRoute>} />
      <Route path="/backdata-reclutamiento" element={<PrivateRoute cargo={['backreclutamiento','entrevistas','capacitador']}><Backdatareclutamiento /></PrivateRoute>} />
      <Route path="/reclutamiento"          element={<PrivateRoute cargo="asesorreclutamiento"><DashboardReclutamiento /></PrivateRoute>} />
      <Route path="/marketing-leads"        element={<PrivateRoute cargo="marketing"><MarketingLeads /></PrivateRoute>} />

      <Route path="*" element={<InicioAutorizado />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
