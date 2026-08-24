import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Topbar.module.css'

export default function Topbar({ subtitulo, children }) {
  const { sesion, logout } = useAuth()
  const navigate = useNavigate()

  function handleSalir(e) {
    e.preventDefault()
    logout()
    navigate('/login')
  }

  return (
    <div className={styles.topbar}>
      <div className={styles.brand}>
        <div className={styles.logoCircle}>
          <img src="/assets/logo3.png" alt="PRIZMA" />
        </div>
        <div className={styles.brandText}>
          <span style={{fontSize:22,fontWeight:800,letterSpacing:"0.08em",lineHeight:1}}>PRIZMA</span>
          {subtitulo && <span className={styles.brandSub}>{subtitulo}</span>}
        </div>
      </div>

      <div className={styles.topbarRight}>
        {children}
        {sesion?.nombre && (
          <span className={styles.usuario}>{sesion.nombre}</span>
        )}
        <a href="#" className={styles.salir} onClick={handleSalir}>Salir</a>
      </div>
    </div>
  )
}
