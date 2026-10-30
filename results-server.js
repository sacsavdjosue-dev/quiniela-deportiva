// RESULTADOS_GANADORES_V1
// Captura administrativa por jornada, comodin y clasificacion publica sin datos financieros.
// Esta extension no altera bets, bet_payments, rounds ni el mecanismo de registro.

const OUTCOMES = new Set(['L', 'E', 'V']);
const MAX_RESULTS_MATCHES = 11;
const MAX_RANKING_COMBINATIONS_TO_SHOW = 12;

const validRoundId = value => /^[1-9]\d*$/.test(String(value ?? '')) &&
  Number.isSafeInteger(Number(value)) ? Number(value) : null;

function roundInfo(row) {
  const config = row.config || {};
  const teams = Array.isArray(config.teams) ? config.teams : [];
  const matchCount = Number(config.matchCount || teams.length);
  if (![10, 11].includes(matchCount) || teams.length < matchCount || matchCount > MAX_RESULTS_MATCHES)
    throw Error('Esta jornada no tiene una configuracion valida de 10 u 11 encuentros.');
  return {
    id: Number(row.id), name: row.name, active: Boolean(row.is_active),
    matchCount, teams: teams.slice(0, matchCount).map(t => ({
      home: String(t.home || 'Local'), away: String(t.away || 'Visitante')
    }))
  };
}

export function validateRoundResults(raw, matchCount, status) {
  if (!Array.isArray(raw) || raw.length !== matchCount)
    throw Error(`Debes enviar exactamente ${matchCount} resultados, incluyendo el comodin.`);
  if (!['borrador', 'final'].includes(status)) throw Error('Estado de publicacion invalido.');
  const outcomes = raw.map(x => x === '' ? null : x);
  if (!outcomes.every((x, i) => x === null || OUTCOMES.has(x) || (i < matchCount - 1 && x === 'S')))
    throw Error('Resultados invalidos: usa L, E, V, Suspendido o Pendiente.');
  const regular = outcomes.slice(0, -1);
  const suspended = regular.filter(x => x === 'S').length;
  if (status === 'final') {
    if (regular.some(x => x === null))
      throw Error('Para finalizar, captura todos los resultados de partidos normales.');
    if (suspended > 1)
      throw Error('Hay mas de un partido suspendido. El comodin reemplaza solamente uno; revisa las reglas antes de finalizar.');
    if (suspended === 1 && !OUTCOMES.has(outcomes[matchCount - 1]))
      throw Error('Para finalizar con un suspendido, captura el resultado del comodin.');
  }
  return {outcomes, suspended};
}

// Cada combinacion (secuencia L/E/V) es independiente. El comodin solo puntua
// cuando al menos un encuentro normal esta suspendido. Nunca puntua por si solo.
export function scoreRound(outcomes, bets) {
  const regular = outcomes.slice(0, -1);
  const suspended = regular.filter(x => x === 'S').length;
  const effective = [];
  for (let i = 0; i < regular.length; i++) {
    if (OUTCOMES.has(regular[i])) effective.push([i, regular[i]]);
  }
  if (suspended > 0 && OUTCOMES.has(outcomes[outcomes.length - 1]))
    effective.push([outcomes.length - 1, outcomes[outcomes.length - 1]]);

  const ranking = [];
  for (const bet of bets) {
    const combos = Array.isArray(bet.combinations) ? bet.combinations : [];
    let best = -1, bestCount = 0;
    const bestExamples = [];
    for (const combination of combos) {
      if (typeof combination !== 'string' || combination.length !== outcomes.length ||
          !/^[LEV]+$/.test(combination)) continue;
      let points = 0;
      for (const [index, result] of effective) if (combination[index] === result) points++;
      if (points > best) {
        best = points; bestCount = 1;
        bestExamples.length = 0;
        bestExamples.push(combination);
      } else if (points === best) {
        bestCount++;
        if (bestExamples.length < MAX_RANKING_COMBINATIONS_TO_SHOW)
          bestExamples.push(combination);
      }
    }
    ranking.push({
      folio: bet.folio,
      participant: bet.name,
      bestScore: Math.max(0, best),
      combinationsCount: combos.length,
      bestCombinationsCount: bestCount,
      bestCombinations: bestExamples,
      registeredAt: bet.created_at
    });
  }
  ranking.sort((a, b) => b.bestScore - a.bestScore ||
    String(a.registeredAt).localeCompare(String(b.registeredAt)) ||
    a.folio.localeCompare(b.folio));
  let lastScore = null, rank = 0;
  for (let i = 0; i < ranking.length; i++) {
    const row = ranking[i];
    if (row.bestScore !== lastScore) rank = i + 1;
    row.rank = rank;
    lastScore = row.bestScore;
  }
  return {
    scoredMatches: effective.length,
    expectedMatches: regular.length,
    suspendedMatches: suspended,
    requiresManualReview: suspended > 1,
    rankings: ranking,
    leaders: effective.length && ranking[0]?.bestScore > 0 ? ranking.filter(r => r.rank === 1) : []
  };
}

function responseSettings(round, stored) {
  const raw = Array.isArray(stored?.outcomes) ? stored.outcomes : [];
  const outcomes = raw.length === round.matchCount ? raw : Array(round.matchCount).fill(null);
  return {
    round, outcomes, status: stored?.status || 'borrador',
    published: stored?.published === true, version: Number(stored?.version || 0),
    updatedAt: stored?.updated_at || null
  };
}

export async function installResults(app, pool, requireAdmin) {
  await pool.query(`CREATE TABLE IF NOT EXISTS round_results (
    round_id BIGINT PRIMARY KEY REFERENCES rounds(id) ON DELETE RESTRICT,
    outcomes JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','final')),
    published BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS round_result_audit (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    previous_state JSONB,
    new_state JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS round_result_audit_round_idx ON round_result_audit(round_id, id DESC);`);

  const loadRound = async (db, id) => {
    const r = await db.query('SELECT id,name,config,is_active FROM rounds WHERE id=$1', [id]);
    return r.rowCount ? roundInfo(r.rows[0]) : null;
  };
  const loadSaved = async (db, id) => {
    const r = await db.query('SELECT outcomes,status,published,version,updated_at FROM round_results WHERE round_id=$1', [id]);
    return r.rows[0] || null;
  };
  const calculateRanking = async (db, id, settings) => {
    const result = await db.query(`SELECT folio,name,combinations,created_at
      FROM bets WHERE round_id=$1 ORDER BY id`, [id]);
    return scoreRound(settings.outcomes, result.rows);
  };

  app.get('/api/admin/results/:id', requireAdmin, async (req, res, next) => {
    try {
      const id = validRoundId(req.params.id);
      if (!id) return res.status(400).json({error: 'Jornada invalida'});
      const round = await loadRound(pool, id);
      if (!round) return res.status(404).json({error: 'Jornada no encontrada'});
      res.set('Cache-Control', 'no-store');
      res.json(responseSettings(round, await loadSaved(pool, id)));
    } catch (e) { next(e); }
  });

  app.put('/api/admin/results/:id', requireAdmin, async (req, res, next) => {
    const id = validRoundId(req.params.id);
    const {outcomes, status, published, expectedVersion} = req.body || {};
    if (!id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 ||
        typeof published !== 'boolean')
      return res.status(400).json({error: 'Solicitud o version invalida'});
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // Bloqueo por jornada: evita ediciones cruzadas y permite comparar versiones.
      const selected = await db.query('SELECT id,name,config,is_active FROM rounds WHERE id=$1 FOR UPDATE', [id]);
      if (!selected.rowCount) {
        await db.query('ROLLBACK');
        return res.status(404).json({error: 'Jornada no encontrada'});
      }
      const round = roundInfo(selected.rows[0]);
      let checked;
      try { checked = validateRoundResults(outcomes, round.matchCount, status); }
      catch (e) { await db.query('ROLLBACK'); return res.status(400).json({error: e.message}); }
      const current = await loadSaved(db, id);
      const version = Number(current?.version || 0);
      if (expectedVersion !== version) {
        await db.query('ROLLBACK');
        return res.status(409).json({error: 'Los resultados cambiaron desde otra sesion. Actualiza antes de guardar.'});
      }
      const newVersion = version + 1;
      await db.query(`INSERT INTO round_results(round_id,outcomes,status,published,version,updated_at)
        VALUES ($1,$2,$3,$4,$5,now())
        ON CONFLICT (round_id) DO UPDATE SET outcomes=EXCLUDED.outcomes,
          status=EXCLUDED.status,published=EXCLUDED.published,
          version=EXCLUDED.version,updated_at=now()`,
      [id, JSON.stringify(checked.outcomes), status, published, newVersion]);
      await db.query(`INSERT INTO round_result_audit(round_id,version,previous_state,new_state)
        VALUES($1,$2,$3,$4)`, [id, newVersion,
        current ? JSON.stringify({outcomes: current.outcomes, status: current.status, published: current.published, version}) : null,
        JSON.stringify({outcomes: checked.outcomes, status, published, version: newVersion})]);
      await db.query('COMMIT');
      res.set('Cache-Control', 'no-store');
      res.json({ok: true, version: newVersion});
    } catch (e) {
      try { await db.query('ROLLBACK'); } catch {}
      next(e);
    } finally { db.release(); }
  });

  app.get('/api/admin/results/:id/history', requireAdmin, async (req, res, next) => {
    try {
      const id = validRoundId(req.params.id);
      if (!id) return res.status(400).json({error: 'Jornada invalida'});
      const r = await pool.query(`SELECT version,changed_at,new_state->>'status' AS status,
        (new_state->>'published')::boolean AS published
        FROM round_result_audit WHERE round_id=$1 ORDER BY id DESC LIMIT 30`, [id]);
      res.set('Cache-Control', 'no-store'); res.json(r.rows);
    } catch (e) { next(e); }
  });

  app.get('/api/admin/results/:id/ranking', requireAdmin, async (req, res, next) => {
    try {
      const id = validRoundId(req.params.id);
      if (!id) return res.status(400).json({error: 'Jornada invalida'});
      const round = await loadRound(pool, id);
      if (!round) return res.status(404).json({error: 'Jornada no encontrada'});
      const settings = responseSettings(round, await loadSaved(pool, id));
      const ranking = await calculateRanking(pool, id, settings);
      res.set('Cache-Control', 'no-store'); res.json({...settings, ...ranking});
    } catch (e) { next(e); }
  });

  // Publico: solo se listan jornadas publicadas. No se exponen telefonos,
  // importes, estados de pago, identificadores internos de apuesta ni comprobantes.
  app.get('/api/results/rounds', async (req, res, next) => {
    try {
      const r = await pool.query(`SELECT r.id,r.name,x.status,x.updated_at
        FROM round_results x JOIN rounds r ON r.id=x.round_id
        WHERE x.published=true ORDER BY r.id DESC`);
      res.set('Cache-Control', 'no-store'); res.json(r.rows);
    } catch (e) { next(e); }
  });

  app.get('/api/results/:id', async (req, res, next) => {
    try {
      const id = validRoundId(req.params.id);
      if (!id) return res.status(400).json({error: 'Jornada invalida'});
      const r = await pool.query(`SELECT r.id,r.name,r.config,r.is_active,
        x.outcomes,x.status,x.published,x.version,x.updated_at
        FROM round_results x JOIN rounds r ON r.id=x.round_id
        WHERE x.round_id=$1 AND x.published=true`, [id]);
      if (!r.rowCount) return res.status(404).json({error: 'Esta jornada no tiene resultados publicados.'});
      const stored = r.rows[0];
      const settings = responseSettings(roundInfo(stored), stored);
      const ranking = await calculateRanking(pool, id, settings);
      // Respuesta publica minima: nada de secuencias completas ni marcas de tiempo
      // individuales. El detalle de combinaciones queda en la vista administrativa.
      const publicRow = item => ({
        rank: item.rank, participant: item.participant, folio: item.folio,
        bestScore: item.bestScore, bestCombinationsCount: item.bestCombinationsCount
      });
      res.set('Cache-Control', 'no-store');
      res.json({round: settings.round, outcomes: settings.outcomes, status: settings.status,
        updatedAt: settings.updatedAt, scoredMatches: ranking.scoredMatches,
        expectedMatches: ranking.expectedMatches, suspendedMatches: ranking.suspendedMatches,
        requiresManualReview: ranking.requiresManualReview,
        rankings: ranking.rankings.map(publicRow), leaders: ranking.leaders.map(publicRow)});
    } catch (e) { next(e); }
  });
}
