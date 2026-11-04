// SIMULADOR_SEPARADO_EN_VIVO_V2
// Clasificación pública provisional por jornada (incluida una jornada abierta).
// Sin teléfonos, importes, pagos, pronósticos individuales ni combinaciones.
import {scoreRound} from './results-server.js';
import {roundClosedForOfficial} from './participant-simulator-server.js';

const validId = value => /^[1-9]\d*$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value))
  ? Number(value) : null;
const acceptable = new Set(['L','E','V','S']);
const CACHE_MS = 12000;
const leaderboardCache = new Map();

export function publicLiveSnapshot({round, results, bets}) {
  const config = round.config && typeof round.config === 'object' ? round.config : {};
  const count = Number(config.matchCount ?? config.teams?.length);
  if (![10,11].includes(count)) throw new Error('La configuración de la jornada no es válida.');
  const published = results?.published === true;
  const stored = published && Array.isArray(results?.outcomes) && results.outcomes.length === count
    ? results.outcomes : Array(count).fill(null);
  const outcomes = stored.map((value,index) =>
    ['L','E','V'].includes(value) || (index < count-1 && value === 'S') ? value : null);
  const suspended = outcomes.slice(0,-1).filter(x => x === 'S').length;
  // Si hay varios suspendidos, el comodín no puede sustituir a todos.
  // Evitamos puntuarlo hasta que administración resuelva la incidencia.
  const safeOutcomes = suspended > 1 ? [...outcomes.slice(0,-1), null] : outcomes;
  const ranking = scoreRound(safeOutcomes, bets);
  const closed = roundClosedForOfficial(round);
  const official = closed && published && results?.status === 'final' &&
    !ranking.requiresManualReview && ranking.scoredMatches === ranking.expectedMatches;
  return {
    round: {id: Number(round.id), name: String(round.name)},
    closed, official, published, stage: official ? 'OFICIAL' : 'EN VIVO · PROVISIONAL',
    updatedAt: results?.updated_at || null,
    scoredMatches: ranking.scoredMatches,
    expectedMatches: ranking.expectedMatches,
    suspendedMatches: suspended,
    requiresManualReview: suspended > 1,
    totalRegistered: ranking.rankings.length,
    rankings: ranking.rankings.map(item => ({
      rank: ranking.scoredMatches ? item.rank : null,
      folio: item.folio,
      // Los nombres de borradores no publicados no se exponen públicamente.
      participant: published ? item.participant : null,
      bestScore: item.bestScore,
      combinationsCount: item.combinationsCount
    }))
  };
}

export function installParticipantLive(app,pool) {
  app.get('/api/participant/live/rounds', async (req,res,next) => {
    try {
      const data = await pool.query(`SELECT r.id,r.name,r.is_active,
        (SELECT COUNT(*)::integer FROM bets b WHERE b.round_id=r.id) AS registrations
        FROM rounds r ORDER BY r.is_active DESC,r.id DESC LIMIT 200`);
      res.set('Cache-Control','no-store');
      res.json(data.rows.map(row=>({id:Number(row.id),name:row.name,
        active:row.is_active===true,registrations:Number(row.registrations)})));
    } catch(error) {next(error)}
  });

  app.get('/api/participant/live/:id', async (req,res,next) => {
    const id=validId(req.params.id);
    if(!id) return res.status(400).json({error:'Jornada inválida.'});
    try {
      const now=Date.now();
      const cached=leaderboardCache.get(id);
      if(cached && now<cached.expires){
        res.set('Cache-Control','no-store');
        return res.json(await cached.promise);
      }
      if(leaderboardCache.size>25) leaderboardCache.clear();
      const promise=(async()=>{
        const roundResult=await pool.query(`SELECT r.id,r.name,r.config,r.is_active,
          x.outcomes,x.status,x.published,x.updated_at
          FROM rounds r LEFT JOIN round_results x ON x.round_id=r.id
          WHERE r.id=$1`,[id]);
        if(!roundResult.rowCount) return null;
        const betsResult=await pool.query(`SELECT folio,name,combinations,created_at
          FROM bets WHERE round_id=$1 ORDER BY id`,[id]);
        return publicLiveSnapshot({round:roundResult.rows[0],results:roundResult.rows[0],
          bets:betsResult.rows});
      })();
      leaderboardCache.set(id,{expires:now+CACHE_MS,promise});
      let data;
      try {data=await promise;} catch(error) {leaderboardCache.delete(id);throw error}
      if(!data){leaderboardCache.delete(id);return res.status(404).json({error:'Jornada no encontrada.'})}
      res.set('Cache-Control','no-store');
      res.json(data);
    } catch(error){next(error)}
  });
}
