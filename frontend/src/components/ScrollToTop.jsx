import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      // contenedores internos con overflow (CSS Modules => clases hasheadas)
      document.querySelectorAll(
        '[class*="main"],[class*="sidebar"],[class*="layout"],[class*="content"],[class*="scroll"]'
      ).forEach((el) => { el.scrollTop = 0; el.scrollLeft = 0; });
    };
    reset();                                   // inmediato
    const r = requestAnimationFrame(reset);    // tras el primer paint
    const t = setTimeout(reset, 150);          // tras carga async (charts/datos)
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, [pathname]);

  return null;
}
