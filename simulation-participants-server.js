// RESULTADOS_PARTICIPANTES_SIMULADOS_V4
// Lee las quinielas de la jornada activa para puntuar una simulacion en memoria.
// No guarda ni modifica pronosticos, marcadores, pagos o resultados oficiales.
// Si la clasificacion no esta publicada, solo se muestran los folios (sin nombres).
const VALID_PICK = new Set(['L','E','V']);

export function validateParticipantSimulation(raw, count) {
  if (![10,11].includes(count) || !Array.isArray(raw) || raw.length !== count)
    throw new Error('La simulacion no coincide con los partidos de la jornada activa.');
  const outcomes = raw.map(x => x === '' || x == null ? null : x);
  if (!outcomes.every((x,i) => x === null || VALID_PICK.has(x) || (x === 'S' && i < count-1)))
    throw new Error('Resultados no validos. Utiliza L, E, V, S o Pendiente.');
  if (outcomes.slice(0,-1).filter(x => x === 'S').length > 1)
    throw new Error('El comodin solo puede sustituir un partido suspendido.');
  return outcomes;
}

// El mejor puntaje de cada folio puede obtenerse sin expandir combinaciones:
// cada pronostico de dobles/triples es una eleccion independiente por partido.
export function scoreParticipantSimulations(outcomes, bets, showNames=false) {
  const regular = outcomes.slice(0,-1);
  const suspended = regular.filter(x => x === 'S').length;
  const checks = [];
  regular.forEach((result,i) => { if (VALID_PICK.has(result)) checks.push([i,result]); });
  if (suspended === 1 && VALID_PICK.has(outcomes.at(-1)))
    checks.push([outcomes.length-1,outcomes.at(-1)]);
  const rankings = bets.map(bet => {
    const groups = Array.isArray(bet.selections) ? bet.selections : [];
    const valid = groups.length === outcomes.length && groups.every(g =>
      Array.isArray(g) && g.length > 0 && g.every(x => VALID_PICK.has(x)));
    const points = valid ? checks.reduce((n,[i,result]) => n + Number(groups[i].includes(result)),0) : 0;
    return {participant:showNames?String(bet.name):null,folio:String(bet.folio),bestScore:points,
      registeredAt:bet.created_at || ''};
  });
  rankings.sort((a,b) => b.bestScore-a.bestScore ||
    String(a.registeredAt).localeCompare(String(b.registeredAt)) || a.folio.localeCompare(b.folio));
  let previous = null, rank = 0;
  rankings.forEach((r,i) => {
    if (r.bestScore !== previous) rank = i+1;
    r.rank = checks.length ? rank : null;
    previous = r.bestScore;
    delete r.registeredAt;
  });
  return {scoredMatches:checks.length, expectedMatches:outcomes.length-1,
    totalRegistered:rankings.length,rankings};
}

export function installSimulationParticipants(app,pool) {
  app.post('/api/participant/simulated-results',async(req,res,next) => {
    try {
      const selected=await pool.query(`SELECT r.id,r.name,r.config,COALESCE(x.published,FALSE) AS published
        FROM rounds r LEFT JOIN round_results x ON x.round_id=r.id
        WHERE r.is_active=true LIMIT 1`);
      if (!selected.rowCount) return res.status(503).json({error:'No hay jornada activa.'});
      const round=selected.rows[0],cfg=round.config||{};
      const count=Number(cfg.matchCount??cfg.teams?.length);
      let outcomes;
      try {outcomes=validateParticipantSimulation(req.body?.outcomes,count)}
      catch(err) {return res.status(400).json({error:err.message})}
      const bets=await pool.query('SELECT folio,name,selections,created_at FROM bets WHERE round_id=$1 ORDER BY id',[round.id]);
      const result=scoreParticipantSimulations(outcomes,bets.rows,round.published===true);
      res.set('Cache-Control','no-store');
      res.json({round:{id:Number(round.id),name:round.name},status:'SIMULADO_NO_OFICIAL',...result});
    }catch(err){next(err)}
  });
}
