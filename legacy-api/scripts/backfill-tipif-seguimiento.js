'use strict';
/**
 * Backfill: sincroniza a los leads de Backoffice las ventas que YA estaban
 * marcadas EJECUTADA o CAIDA antes de que existiera la sincronización
 * automática en PATCH /ventas/:id (ver routes/ventas.js). Sin esto, esos
 * leads se quedan tipificados VENTA CERRADA para siempre aunque la venta
 * ya tenga un desenlace final conocido.
 *
 * Corre dentro del contenedor de la API (usa database.js tal cual, con las
 * mismas variables de entorno del proceso real).
 *
 * Uso:
 *   node scripts/backfill-tipif-seguimiento.js --dry-run
 *   node scripts/backfill-tipif-seguimiento.js --execute
 */

const isDry  = process.argv.includes('--dry-run');
const isExec = process.argv.includes('--execute');
if (!isDry && !isExec) {
  console.error('Error: debes indicar --dry-run o --execute');
  process.exit(1);
}

const db = require('../database');

const DESTINO = { EJECUTADA: 'EJECUTADA', CAIDA: 'VENTA CAIDA' };

function fechaPeruHoy() {
  const ahora = new Date();
  const peru  = new Date(ahora.getTime() + ahora.getTimezoneOffset() * 60000 + (-5 * 60 * 60000));
  return peru.getFullYear() + '-' + String(peru.getMonth() + 1).padStart(2, '0') + '-' + String(peru.getDate()).padStart(2, '0');
}

async function main() {
  // database.js corre initDB() al importarse; le damos un respiro antes de consultar.
  await new Promise(r => setTimeout(r, 1500));

  const [ventas] = await db.query(`
    SELECT v.id AS venta_id, v.estado, v.lead_id, l.tipif_vend, l.historial
      FROM ventas v
      JOIN leads l ON l.id = v.lead_id
     WHERE UPPER(v.estado) IN ('EJECUTADA', 'CAIDA')
       AND UPPER(TRIM(COALESCE(l.tipif_vend, ''))) NOT IN ('EJECUTADA', 'VENTA CAIDA')
  `);

  console.log(`${ventas.length} lead(s) por sincronizar.`);
  if (!ventas.length) { process.exit(0); }

  const fecha = fechaPeruHoy();
  const hora  = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

  if (isDry) {
    for (const v of ventas) {
      console.log(`  venta ${v.venta_id} -> lead ${v.lead_id}: '${v.tipif_vend}' -> '${DESTINO[v.estado.toUpperCase()]}'`);
    }
    console.log('Dry-run: no se modificó nada. Ejecuta con --execute para aplicar.');
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const v of ventas) {
      const tipifDestino = DESTINO[v.estado.toUpperCase()];
      let historial = [];
      try { historial = JSON.parse(v.historial || '[]'); } catch {}
      historial.push({
        tipo: 'TIPIF_VEND', tipif: tipifDestino, ts: Date.now(), hora, fecha,
        esFinal: true, origen: 'seguimiento_backfill', ventaId: v.venta_id,
      });
      await conn.query(`UPDATE leads SET tipif_vend=?, tipif_hora=?, historial=? WHERE id=?`, [
        tipifDestino, hora, JSON.stringify(historial), v.lead_id,
      ]);
    }
    await conn.commit();
    console.log(`${ventas.length} lead(s) actualizados correctamente.`);
  } catch (e) {
    await conn.rollback();
    console.error('Error, se revirtió todo:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit(process.exitCode || 0);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
