/* ================================================
   ROUTES/MARKETING-COSTOS.JS — MySQL
   Gasto de publicidad por campaña, para el Dashboard de Leads por Campaña
   ================================================ */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const auth    = require('../middleware/auth');

// GET /api/marketing-costos?desde=&hasta=&campana=
router.get('/', auth(['jefatura']), async (req, res) => {
  try {
    const { desde, hasta, campana } = req.query;
    let sql = `SELECT id, campana, fecha, monto, notas, creado_por, created_at FROM marketing_costos_campana WHERE 1=1`;
    const params = [];
    if (desde)   { sql += ` AND fecha >= ?`; params.push(desde); }
    if (hasta)   { sql += ` AND fecha <= ?`; params.push(hasta); }
    if (campana) { sql += ` AND campana = ?`; params.push(campana); }
    sql += ` ORDER BY fecha DESC, id DESC`;
    const [data] = await db.query(sql, params);
    res.json({ ok:true, data });
  } catch (e) {
    res.status(500).json({ ok:false, mensaje:'Error al cargar costos de campaña' });
  }
});

// POST /api/marketing-costos
router.post('/', auth(['jefatura']), async (req, res) => {
  try {
    const { campana, fecha, monto, notas } = req.body;
    if (!String(campana||'').trim()) return res.status(400).json({ ok:false, mensaje:'La campaña es obligatoria' });
    if (!fecha) return res.status(400).json({ ok:false, mensaje:'La fecha es obligatoria' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) return res.status(400).json({ ok:false, mensaje:'El monto no es válido' });

    const [result] = await db.query(
      `INSERT INTO marketing_costos_campana (campana, fecha, monto, notas, creado_por) VALUES (?, ?, ?, ?, ?)`,
      [String(campana).trim(), fecha, montoNum, String(notas||'').trim(), req.user.usuario || '']
    );
    res.json({ ok:true, id: result.insertId, mensaje:'Gasto registrado' });
  } catch (e) {
    res.status(500).json({ ok:false, mensaje:'Error al registrar el gasto' });
  }
});

// DELETE /api/marketing-costos/:id
router.delete('/:id', auth(['jefatura']), async (req, res) => {
  try {
    await db.query(`DELETE FROM marketing_costos_campana WHERE id = ?`, [req.params.id]);
    res.json({ ok:true, mensaje:'Gasto eliminado' });
  } catch (e) {
    res.status(500).json({ ok:false, mensaje:'Error al eliminar el gasto' });
  }
});

module.exports = router;
