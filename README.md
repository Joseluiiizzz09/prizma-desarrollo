# PRISMA

Migracion progresiva del sistema actual. Los proyectos originales ubicados en
`C:\xampp\htdocs\sistema` y `C:\xampp\htdocs\netcontact-api` no forman parte
de este workspace y no deben modificarse.

## Estado actual

- `frontend`: copia React + Vite del sistema actual.
- `legacy-api`: copia del backend Node.js actual.
- `nginx`: entrada unica para desarrollo.
- MySQL 8.4: instancia y volumen exclusivos de PRISMA.
- Laravel, Redis, Horizon, Reverb y Scheduler: pendientes de etapas posteriores.

## Inicio

1. Copiar y personalizar `.env.example` como `.env` si fuera necesario.
2. Iniciar Docker Desktop.
3. Ejecutar `docker compose up -d --build`.
4. Abrir `http://localhost:8080`.

Puertos directos de desarrollo:

- Nginx: `8080`
- Vite: `5174`
- Legacy API: `3001`
- MySQL PRISMA: `3307`

## Seguridad de datos

El servicio legacy recibe `DB_HOST=prisma-mysql` y `DB_NAME=prisma`. No utiliza
la base `netcontact` ni los volúmenes del sistema actual. Las integraciones con
Google Sheets están desactivadas por defecto.

Los volúmenes se llaman:

- `prisma_mysql_data`
- `prisma_frontend_node_modules`
- `prisma_legacy_node_modules`
- `prisma_legacy_uploads`

Para detener los servicios sin borrar datos:

```powershell
docker compose down
```

No usar `docker compose down -v` salvo que se quiera eliminar deliberadamente
la base y los uploads de desarrollo de PRISMA.
