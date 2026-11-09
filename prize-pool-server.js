// BOLSA_ACUMULADA_V1
// Una cifra publica agregada de la jornada activa. Nunca expone folios, pagos
// individuales ni informacion privada. Solo cuentan los abonos validados.

export function installPrizePool(app, pool) {
  const CACHE_MS = 5000;
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;

  const loadPool = async () => {
    // Un cache breve reduce consultas concurrentes sin ocultar actualizaciones
    // mas de 5 segundos en la API; los navegadores consultan cada 30 segundos.
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const {rows} = await pool.query(`
        WITH active_round AS (
          SELECT id, name FROM rounds WHERE is_active = TRUE LIMIT 1
        ), confirmed AS (
          SELECT r.id, r.name,
                 COALESCE(SUM(p.amount_cents) FILTER (WHERE p.state = 'validado'), 0)::numeric AS confirmed_cents
          FROM active_round r
          LEFT JOIN bets b ON b.round_id = r.id
          LEFT JOIN bet_payments p ON p.bet_id = b.id
          GROUP BY r.id, r.name
        )
        SELECT id, name,
               confirmed_cents::text AS confirmed_cents,
               FLOOR(confirmed_cents * 7 / 10)::text AS prize_cents,
               (confirmed_cents - FLOOR(confirmed_cents * 7 / 10))::text AS retained_cents
        FROM confirmed
      `);
      const round = rows[0];
      const data = {
        roundId: round ? String(round.id) : null,
        roundName: round ? round.name : null,
        confirmedCents: round ? String(round.confirmed_cents) : '0',
        prizeCents: round ? String(round.prize_cents) : '0',
        retainedCents: round ? String(round.retained_cents) : '0',
        prizePercent: 70,
        retainedPercent: 30,
        updatedAt: new Date().toISOString()
      };
      cached = data;
      cachedAt = Date.now();
      return data;
    })();
    try { return await inFlight; }
    finally { inFlight = null; }
  };

  app.get('/api/prize-pool', async (_req, res, next) => {
    try {
      const data = await loadPool();
      res.set('Cache-Control', 'no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      res.json(data);
    } catch (err) { next(err); }
  });
}
