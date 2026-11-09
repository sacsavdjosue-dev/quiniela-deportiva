// PREMIO_ACUMULADO_VISIBILIDAD_V3
// Una jornada nueva oculta la bolsa por defecto. La API publica no revela
// importe alguno cuando el administrador la tiene deshabilitada.

export async function installPrizePool(app, pool, requireAdmin) {
  // Columna por jornada, independiente de las preferencias generales.
  // No cambia abonos, resultados ni el estado de las quinielas.
  await pool.query(`ALTER TABLE rounds
    ADD COLUMN IF NOT EXISTS prize_pool_visible BOOLEAN NOT NULL DEFAULT FALSE`);

  const CACHE_MS = 5000;
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;
  let generation = 0;

  async function loadPool() {
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    if (inFlight) return inFlight;
    const seenGeneration = generation;
    const pending = (async () => {
      const {rows} = await pool.query(`
        SELECT r.id, r.prize_pool_visible,
          CASE WHEN r.prize_pool_visible THEN
            FLOOR(COALESCE(SUM(p.amount_cents)
              FILTER (WHERE p.state = 'validado'), 0)::numeric * 7 / 10)::text
          ELSE NULL END AS prize_cents
        FROM rounds r
        LEFT JOIN bets b ON b.round_id = r.id
        LEFT JOIN bet_payments p ON p.bet_id = b.id
        WHERE r.is_active = TRUE
        GROUP BY r.id, r.prize_pool_visible
        LIMIT 1
      `);
      const active = rows[0];
      if (!active || active.prize_pool_visible !== true) return {visible:false};
      return {visible:true, roundId:String(active.id), prizeCents:String(active.prize_cents ?? '0')};
    })();
    inFlight = pending;
    try {
      const data = await pending;
      if (generation === seenGeneration) {
        cached = data;
        cachedAt = Date.now();
      }
      return data;
    } finally {
      if (inFlight === pending) inFlight = null;
    }
  }

  function invalidate() {
    generation += 1;
    cached = null;
    cachedAt = 0;
    inFlight = null;
  }

  app.get('/api/prize-pool', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      res.json(await loadPool());
    } catch (err) { next(err); }
  });

  app.get('/api/admin/prize-pool-visibility', requireAdmin, async (_req, res, next) => {
    try {
      const {rows} = await pool.query(`SELECT id,name,prize_pool_visible
        FROM rounds WHERE is_active=TRUE LIMIT 1`);
      const row = rows[0];
      res.set('Cache-Control', 'no-store');
      res.json({roundId:row ? String(row.id):null,
        roundName:row ? row.name:null, visible:row?.prize_pool_visible === true});
    } catch (err) { next(err); }
  });

  app.put('/api/admin/prize-pool-visibility', requireAdmin, async (req, res, next) => {
    if (typeof req.body?.visible !== 'boolean')
      return res.status(400).json({error:'Debes indicar verdadero o falso.'});
    try {
      const {rows} = await pool.query(`UPDATE rounds
        SET prize_pool_visible=$1 WHERE is_active=TRUE
        RETURNING id,name,prize_pool_visible`, [req.body.visible]);
      if (!rows.length) return res.status(404).json({error:'No hay una jornada activa.'});
      invalidate();
      res.set('Cache-Control', 'no-store');
      res.json({ok:true,roundId:String(rows[0].id),roundName:rows[0].name,
        visible:rows[0].prize_pool_visible === true});
    } catch (err) { next(err); }
  });
}
