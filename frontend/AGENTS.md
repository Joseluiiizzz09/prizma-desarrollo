# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Reglas obligatorias de flujo de trabajo

Este proyecto está en producción/desarrollo activo. Contiene lógica existente que no debe romperse. Codex es el coordinador principal; Codex (vía MCP) es el segundo analista y revisor independiente.

**Regla principal:** nunca hacer cambios importantes basándose únicamente en el análisis de Codex. Para cambios de lógica, backend, frontend, permisos, estados, autenticación, rutas, APIs, base de datos, ventas, usuarios o que toquen múltiples archivos:

1. Codex analiza primero el problema.
2. Codex pide a Codex (MCP) un análisis independiente.
3. Codex trabaja en modo análisis/revisión y NO modifica archivos.
4. Codex compara ambos análisis.
5. Si Codex y Codex no coinciden, DETENERSE y resolver la discrepancia antes de modificar código.
6. Elegir siempre la solución de menor impacto.

**Protección de la lógica existente.** Antes de modificar código: entender el flujo actual completo, identificar qué archivos participan realmente, revisar llamadas frontend→backend, estados y dependencias, permisos y roles, efectos secundarios, componentes que reutilizan la misma función, y contratos de API. No asumir cómo funciona una parte sin leerla.

- NO modificar código no relacionado con la solicitud.
- NO hacer refactorizaciones generales.
- NO renombrar variables, endpoints, rutas, estados o estructuras solo para "mejorar" el código.
- NO eliminar código existente salvo que sea estrictamente necesario y se haya comprobado que no tiene consumidores.
- NO cambiar dependencias, versiones, configuración, variables de entorno, base de datos o infraestructura sin autorización explícita.

**Implementación.** Codex es el único agente que modifica archivos por defecto; Codex no edita simultáneamente los mismos archivos. Los cambios deben ser mínimos y localizados. Antes de editar, indicar: problema detectado, solución propuesta, archivos que se tocarán, archivos que NO hace falta tocar, y riesgos posibles.

**Revisión obligatoria con Codex** después de cualquier cambio relevante:
1. Obtener `git diff`.
2. Pedir a Codex (MCP) que revise ese diff.
3. Pedir que busque específicamente: regresiones, lógica rota, estados inconsistentes, problemas frontend/backend, errores de permisos, efectos secundarios, código eliminado accidentalmente, rutas o APIs afectadas.
4. Codex revisa las observaciones de Codex y corrige únicamente problemas reales.
5. Repetir la revisión si hubo nuevas correcciones.

**Validación** después de modificar: ejecutar build y tests si existen, revisar errores de compilación e imports, revisar `git diff` y confirmar que no aparecieron cambios no relacionados. Si no hay tests automáticos (actualmente no los hay en este repo), hacer una revisión estática adicional entre Codex y Codex.

**Git y seguridad.** Nunca ejecutar sin autorización explícita: `git reset --hard`, `git clean -fd`, `git push --force`. No reescribir historial. No borrar ramas de respaldo. No descartar cambios del usuario. Comprobar `git status` antes de una modificación grande. No hacer commit automáticamente salvo que el usuario lo solicite.

**Principio final:** la prioridad no es escribir más código ni terminar más rápido, sino (1) preservar la lógica existente, (2) modificar únicamente lo solicitado, (3) evitar regresiones, (4) mantener compatibilidad frontend/backend, (5) usar Codex + Codex como doble revisión. Ante la duda, DETENERSE antes de modificar.

## Commands

```bash
npm run dev       # Vite dev server on port 5173, proxies /api -> http://localhost:3000
npm run build     # Production build to dist/
npm run preview   # Preview the production build locally
```

There is no lint, typecheck, or test script configured in this repo. There is no ESLint/Prettier config either — don't assume one exists.

The frontend does nothing without the backend. Run the sibling repo `../netcontact-api` (Express + MySQL) separately (`npm run dev` there, via nodemon) — the Vite dev proxy targets `http://localhost:3000`. Without it, login and every data call fail.

## Architecture

This is the frontend-only half of "Netcontact" (a call-center / sales CRM): a React 18 + React Router 6 SPA built with Vite. The backend (Express, JWT auth, MySQL via `mysql2`) lives in the **sibling directory `../netcontact-api`**, outside this git repo — read it when you need to know what an endpoint actually does or enforces, since the frontend's assumptions about the API are not always accurate (see Known gaps below).

### Role-based page structure

The app is organized as one page per job role (`cargo`), not by generic feature layers:

- `src/App.jsx` declares all routes flatly and statically imports every page (no code-splitting).
- `src/pages/{Dashboard,Backoffice,Supervisor,Validacion,Seguimiento,Grabaciones,SupGrabaciones,Programacion,Jefatura,Usuarios}.jsx` — each is a large, self-contained module (several hundred to ~1700 lines) that owns its own data fetching, state, filters, and JSX. There is no shared data layer or store; treat each page as mostly independent when making changes.
- Roles/cargos: `asesor`, `supervisor`, `backoffice`, `validacion`, `grabaciones`, `seguimiento`, `jefatura`, `usuarios`, `programacion`, `supgrabaciones` (route map lives in `src/pages/Login.jsx`). Note `instalacion` and `postventa` are listed there but have **no corresponding route** in `App.jsx` — don't assume they work.
- A user can hold multiple `cargo`s; `src/utils/roles.js` (`permisosDeUsuario`, `cargosDeUsuario`, `usuarioTieneCargo`) is the shared way to check secondary permissions layered on top of the primary `cargo`.

### Auth

- JWT + user object are stored in `sessionStorage` (`nc_token`, `nc_usuario`), not `localStorage` (deliberate — see Login.jsx cleanup of legacy `localStorage` keys on login).
- `src/hooks/useAuth.js` wraps session read/write, but it is **not a shared context** — every component calling `useAuth()` gets its own local `useState`, so a logout in one place does not reactively propagate elsewhere. `Login.jsx` writes to `sessionStorage` directly rather than going through the hook.
- `PrivateRoute` in `App.jsx` only checks that *some* session exists — it does **not** check that the session's `cargo` matches the route being accessed. Per-page components do their own `sesion?.cargo === '...'` checks in places, but this is inconsistent. Don't treat client-side role checks as real access control; the backend (`../netcontact-api/middleware/auth.js`) is the actual enforcement point, and even it has known gaps in scoping permissions by row-level ownership (e.g. `ventas` endpoints). If you're touching anything auth/permission-related, verify behavior against the backend code, not just the frontend's assumptions.
- Login also supports a "cargo activo" selection flow (`requiereSeleccionCargo` / `cargoActivo` in `Login.jsx`) for multi-role users — as of the last review this frontend flow has no matching backend implementation, so treat it as possibly dead/unreachable code rather than a working feature.

### API access

- `src/services/api.js` only exports constants (`NC_API`, `API`) and header builders (`ncHeaders`, `ncHeadersFile`) — there is no centralized HTTP client. Every page does its own `fetch`, its own JSON parsing, and its own error handling, so patterns vary page to page. When adding a new API call, follow the pattern already used in the page you're editing rather than inventing a new one.
- JSON calls use the relative path `API = '/api'` (works via the Vite proxy in dev, and presumably a same-origin reverse proxy in prod). File/blob downloads (`MediaViewer.jsx`) use `NC_API`, which is an absolute `http://localhost:3000` in dev (`import.meta.env.DEV`) and empty string in prod — this split exists so the JWT can be sent via header on blob fetches instead of being exposed in a URL.

### Styling

No single convention — expect to encounter all of these:
- CSS Modules for newer/isolated pieces (`Login.module.css`, `Topbar.module.css`).
- One global plain CSS file per page in `src/styles/*.css`, loaded globally (not scoped).
- A separate, likely-stale `css/backoffice.css` at the repo root, distinct from `src/styles/backoffice.css` — check which one is actually referenced before editing backoffice styles.
- Bootstrap 5 imported globally, plus inline styles scattered through JSX.
- `validacion.html` at the repo root is a standalone legacy HTML/CSS/JS page (own `<script>` tags, own `css/validacion.css`) that duplicates `src/pages/Validacion.jsx`. It is not part of the Vite build. Confirm with the user which one is actually live before changing "the validación screen."

### Other shared pieces

- `src/services/ubigeo.js` — static Peru location data (department/province/district) used by forms.
- `src/components/MediaViewer.jsx` — authenticated blob-based viewer for protected recordings/files.
- `src/components/VentaAssignmentModal.jsx`, `src/components/JefaturaViewControls.jsx`, `src/components/Topbar.jsx` — shared UI used across a subset of the role pages.
