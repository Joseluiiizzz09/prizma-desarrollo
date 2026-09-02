import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import MarketingDashboard from '../components/MarketingDashboard'
import '../styles/jefatura.css'

export default function MarketingLeads() {
  const { sesion, logout } = useAuth()
  const navigate = useNavigate()
  const usuarioNombre = sesion?.nombre || 'Marketing'
  function salir() { logout(); navigate('/login') }

  return (
    <div className="jef-root">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="logo-circle"><img src="/assets/logo3.png" alt="NC" onError={e=>{e.target.parentNode.textContent='NC'}} /></div>
            <div className="brand-text">
              <span style={{fontSize:22,fontWeight:800,letterSpacing:"0.08em",lineHeight:1}}>PRIZMA</span>
              <span className="brand-sub">Marketing · Leads</span>
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-badge">MARKETING</span>
            <span className="topbar-user">{usuarioNombre}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="app-layout">
        <main className="main">
          <section className="section active">
            <MarketingDashboard />
          </section>
        </main>
      </div>
    </div>
  )
}
