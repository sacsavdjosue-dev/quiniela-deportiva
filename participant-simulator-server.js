// SIMULADOR_PARTICIPANTES_V1
// Clasificacion OFICIAL publica, solo si la jornada ya cerro y el administrador
// publico resultados FINALES. Ningun dato de telefono, pago ni combinacion privada.
import {scoreRound} from './results-server.js';

export function roundClosedForOfficial(row, now = Date.now()) {
  // Una jornada archivada deja de recibir quinielas al activarse otra.
  if (row.is_active === false) return true;
  const config = row.config && typeof row.config === 'object' ? row.config : {};
  if (config.closed === true) return true;
  if (typeof config.closeAt === 'string' && config.closeAt.trim()) {
    const close = Date.parse(config.closeAt);
    return Number.isFinite(close) && now >= close;
  }
  return false;
}

const validId = value => /^[1-9]\d*$/.test(String(value ?? '')) &&
  Number.isSafeInteger(Number(value)) ? Number(value) : null;

const safePublicRow = entry => ({
  rank: entry.rank,
  participant: entry.participant,
  folio: entry.folio,
  bestScore: entry.bestScore,
  bestCombinationsCount: entry.bestCombinationsCount
});

export function installParticipantSimulator(app, pool) {
  // Se restringe la lista al resultado final PUBLICADO; los borradores y las
  // jornadas aun abiertas no se exponen como resultados oficiales.
  app.get('/api/participant/official/rounds', async (req, res, next) => {
    try {
      const r = await pool.query(`SELECT r.id,r.name,r.is_active,r.config,x.version,x.updated_at
        FROM rounds r INNER JOIN round_results x ON x.round_id=r.id
        WHERE x.status='final' AND x.published=TRUE
        ORDER BY r.id DESC LIMIT 200`);
      const rows = r.rows.filter(roundClosedForOfficial)
        .map(r => ({id: Number(r.id), name: r.name, version: Number(r.version), updatedAt: r.updated_at}));
      res.set('Cache-Control', 'no-store');
      res.json(rows);
    } catch (error) { next(error); }
  });

  // El publico no recibe la tabla bets ni sus pronosticos individuales.
  // Se calcula la posicion de todos los folios solo cuando es oficial.
  app.get('/api/participant/official/:id', async (req, res, next) => {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({error: 'Jornada invalida.'});
    try {
      const r = await pool.query(`SELECT r.id,r.name,r.is_active,r.config,
          x.status,x.published,x.outcomes,x.version,x.updated_at
        FROM rounds r INNER JOIN round_results x ON x.round_id=r.id
        WHERE r.id=$1 AND x.status='final' AND x.published=TRUE`, [id]);
      if (!r.rowCount || !roundClosedForOfficial(r.rows[0])) {
        return res.status(404).json({error: 'Esta jornada aun no tiene lista oficial disponible.'});
      }
      const saved = r.rows[0];
      const expected = Number(saved.config?.matchCount ?? saved.config?.teams?.length);
      if (![10,11].includes(expected) || !Array.isArray(saved.outcomes) ||
          saved.outcomes.length !== expected) {
        return res.status(503).json({error: 'Los resultados oficiales requieren revision administrativa.'});
      }
      const rows = await pool.query(`SELECT folio,name,combinations,created_at
        FROM bets WHERE round_id=$1 ORDER BY id`, [id]);
      const ranking = scoreRound(saved.outcomes, rows.rows);
      if (ranking.requiresManualReview || ranking.scoredMatches !== ranking.expectedMatches) {
        return res.status(503).json({error: 'La clasificacion definitiva requiere revision administrativa.'});
      }
      res.set('Cache-Control', 'no-store');
      res.json({
        round: {id: Number(saved.id), name: saved.name},
        status: 'final', updatedAt: saved.updated_at,
        scoredMatches: ranking.scoredMatches,
        rankings: ranking.rankings.map(safePublicRow),
        leaders: ranking.leaders.map(safePublicRow)
      });
    } catch (error) { next(error); }
  });
}
