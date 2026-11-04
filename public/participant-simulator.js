// SIMULADOR_PARTICIPANTES_V1
// Los participantes simulan SUS pronosticos, sin consultar apuestas ajenas.
// Lista oficial: solo la que el servidor confirma como cerrada, final y publicada.
(() => {
'use strict';
if (!/^\/(?:index\.html)?$/.test(location.pathname)) return;
const controls = document.querySelector('#user .controls');
if (!controls) return;

const simulator = document.createElement('section');
simulator.id = 'participantSimulator';
simulator.className = 'participant-extra';
simulator.innerHTML = `
  <h2>🎯 Simulador de resultados</h2>
  <p class="hint">Selecciona resultados hipotéticos para comprobar los aciertos de los pronósticos que tienes marcados arriba. No modifica tu registro ni los resultados oficiales.</p>
  <p id="simulatorRound" class="hint"></p>
  <div id="simulatorMatches"></div>
  <div class="participant-extra-actions">
    <button id="simulatorRandom" class="secondary" type="button">SIMULAR AL AZAR</button>
    <button id="simulatorClear" class="outline" type="button">BORRAR RESULTADOS</button>
  </div>
  <div id="simulatorScore" class="simulator-score" role="status" aria-live="polite">Carga la jornada para comenzar.</div>
  <p class="hint">Este simulador utiliza tus selecciones actuales, no consulta quinielas de otros participantes y no determina premios.</p>`;
const official = document.createElement('section');
official.id = 'participantOfficial';
official.className = 'participant-extra';
official.innerHTML = `
  <h2>🏆 Lista oficial de la jornada</h2>
  <p class="hint">Disponible únicamente cuando finaliza la recepción de quinielas y el administrador publica resultados definitivos. Las posiciones se basan en aciertos; la entrega de premios requiere revisión administrativa.</p>
  <div class="participant-official-filter">
    <select id="officialRoundSelect" aria-label="Seleccionar jornada oficial"><option value="">Consultando jornadas…</option></select>
    <button id="officialRefresh" class="outline" type="button">ACTUALIZAR</button>
  </div>
  <p id="officialMessage" class="hint" role="status" aria-live="polite">Consultando listas oficiales…</p>
  <div id="officialSummary" hidden></div>
  <div id="officialRanking"></div>`;
controls.append(simulator, official);

const el = id => document.getElementById(id);
let signature = '';
let simulationOutcomes = [];
let officialRequest = 0;

function currentSignature() {
  if (typeof cfg !== 'object' || !cfg || !Array.isArray(cfg.teams)) return '';
  const count = Number(cfg.matchCount) || 0;
  if (![10,11].includes(count) || cfg.teams.length < count) return '';
  return JSON.stringify([cfg.round, cfg.teams.slice(0,count).map(t=>[t.home,t.away])]);
}
function make(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function rebuildSimulator() {
  const nextSignature = currentSignature();
  if (!nextSignature || signature === nextSignature) return;
  signature = nextSignature;
  const count = Number(cfg.matchCount);
  simulationOutcomes = Array(count).fill(null);
  const matchList = el('simulatorMatches');
  if (!matchList) return;
  matchList.replaceChildren();
  el('simulatorRound').textContent = 'Jornada: ' + cfg.round + ' · ' + count + ' encuentros (incluye comodín)';
  cfg.teams.slice(0,count).forEach((match, i) => {
    const last = i === count-1;
    const row = make('div', undefined, 'simulator-match' + (last ? ' simulator-wildcard' : ''));
    const name = make('label', (last?'⭐ COMODÍN':`Partido ${i+1}`) + ' · ' + match.home + ' vs ' + match.away);
    name.htmlFor = 'simulator-result-' + i;
    const picker = document.createElement('select');
    picker.id = 'simulator-result-' + i;
    picker.setAttribute('aria-label','Resultado hipotético de '+(last?'comodín':'partido '+(i+1)));
    for (const [value,text] of [['','Pendiente'],['L','L · Local'],['E','E · Empate'],['V','V · Visitante'],...(last?[]:[['S','S · Suspendido']])]) {
      picker.append(new Option(text,value));
    }
    picker.onchange = () => {
      simulationOutcomes[i] = picker.value || null;
      calculateSimulation();
    };
    row.append(name,picker);
    matchList.append(row);
  });
  calculateSimulation();
}
function calculateSimulation() {
  const output = el('simulatorScore');
  if (!output) return;
  if (!signature) { output.textContent='Aún no se cargó la jornada.'; return; }
  if (!Array.isArray(picks) || picks.length !== simulationOutcomes.length ||
      picks.some(p=>!Array.isArray(p)||!p.length)) {
    output.textContent='Primero marca todos tus pronósticos en la quiniela de arriba para simular sus aciertos.';
    return;
  }
  const regular = simulationOutcomes.slice(0,-1);
  const suspended = regular.filter(x=>x==='S').length;
  if (suspended>1) {
    output.textContent='Hay más de un partido suspendido. El comodín solo sustituye a uno; se requiere revisión de las reglas antes de calcular la clasificación.';
    return;
  }
  const scored = [];
  regular.forEach((value,i)=>{if(['L','E','V'].includes(value))scored.push([i,value])});
  if (suspended===1 && ['L','E','V'].includes(simulationOutcomes.at(-1))) {
    scored.push([simulationOutcomes.length-1,simulationOutcomes.at(-1)]);
  }
  if (!scored.length) {
    output.textContent='Selecciona al menos un resultado hipotético para iniciar la simulación.';
    return;
  }
  const combinationsList = combinations();
  if (!Array.isArray(combinationsList)) {
    output.textContent='Tus selecciones superan el límite de combinaciones. Reduce dobles o triples para simular.';
    return;
  }
  let best = -1;
  let bestCount = 0;
  const examples = [];
  for (const combination of combinationsList) {
    let points = 0;
    for (const [index,result] of scored) if (combination[index]===result) points++;
    if (points>best) {best=points;bestCount=0;examples.length=0;}
    if (points===best) {
      bestCount++;
      if (examples.length<3) examples.push(combination.split('').join(' '));
    }
  }
  const notice = suspended===1 && !['L','E','V'].includes(simulationOutcomes.at(-1))
    ? ' Falta simular el comodín para reemplazar el suspendido.' : '';
  output.replaceChildren(
    make('strong','Mejor resultado simulado: '+best+' de '+scored.length+' aciertos'),
    make('p','Combinaciones con ese puntaje: '+bestCount+' de '+combinationsList.length+'.'+notice),
    make('small','Ejemplos: '+examples.join('  |  '))
  );
}

el('simulatorRandom').onclick = () => {
  if (!signature) return;
  simulationOutcomes = simulationOutcomes.map(()=>['L','E','V'][Math.floor(Math.random()*3)]);
  simulationOutcomes.forEach((value,i)=>{const input=el('simulator-result-'+i);if(input)input.value=value;});
  calculateSimulation();
};
el('simulatorClear').onclick = () => {
  simulationOutcomes.fill(null);
  simulationOutcomes.forEach((_,i)=>{const input=el('simulator-result-'+i);if(input)input.value='';});
  calculateSimulation();
};

// La logica original sigue siendo dueña de las elecciones y del registro.
// El simulador únicamente observa cuando se vuelven a dibujar los pronósticos.
const previousRender = render;
render = function(...args) {
  const value = previousRender.apply(this,args);
  rebuildSimulator();
  calculateSimulation();
  return value;
};
rebuildSimulator();

async function getOfficial(url) {
  const response = await fetch(url,{headers:{'Accept':'application/json'},cache:'no-store'});
  let data;
  try {data=await response.json()} catch {throw Error('Respuesta inválida del servidor.');}
  if (!response.ok) throw Error(data.error || 'No fue posible consultar el listado.');
  return data;
}
async function refreshOfficialList() {
  const call = ++officialRequest;
  const picker = el('officialRoundSelect');
  const previous = picker?.value || '';
  el('officialMessage').textContent='Consultando jornadas con resultados definitivos…';
  el('officialRanking').replaceChildren();
  el('officialSummary').hidden=true;
  try {
    const rounds = await getOfficial('/api/participant/official/rounds');
    if (call!==officialRequest || !picker) return;
    picker.replaceChildren();
    if (!rounds.length) {
      picker.append(new Option('Ninguna jornada oficial disponible',''));
      picker.disabled=true;
      el('officialMessage').textContent='Todavía no hay una lista oficial. Se mostrará cuando cierre la jornada y el administrador publique los resultados finales.';
      return;
    }
    picker.disabled=false;
    for (const round of rounds) picker.append(new Option(round.name,String(round.id)));
    picker.value=rounds.some(r=>String(r.id)===previous)?previous:String(rounds[0].id);
    await loadOfficialRanking(picker.value,call);
  } catch(error) {
    if (call===officialRequest) el('officialMessage').textContent='No se pudo consultar el listado oficial: '+error.message;
  }
}
async function loadOfficialRanking(id,call=++officialRequest) {
  const container=el('officialRanking');
  container.replaceChildren();
  el('officialSummary').hidden=true;
  el('officialMessage').textContent='Cargando clasificación oficial…';
  try {
    const data=await getOfficial('/api/participant/official/'+encodeURIComponent(id));
    if(call!==officialRequest) return;
    const summary=el('officialSummary');
    summary.replaceChildren(make('strong',data.round.name+' · Clasificación definitiva'),
      make('p','Encuentros puntuados: '+data.scoredMatches+' · Folios registrados: '+data.rankings.length));
    summary.hidden=false;
    if (data.leaders.length) {
      container.append(make('h3','🏆 Primer lugar por aciertos'));
      container.append(make('p',data.leaders.map(r=>r.participant+' ('+r.folio+')').join(', '),'hint'));
    }
    if (!data.rankings.length) container.append(make('p','La jornada no tiene quinielas registradas.','hint'));
    for (const entry of data.rankings) {
      const row=make('div',undefined,'official-ranking-row');
      row.append(make('strong','#'+entry.rank+' · '+entry.participant));
      row.append(make('small','Folio '+entry.folio+' · '+entry.bestScore+'/'+data.scoredMatches+' aciertos'));
      container.append(row);
    }
    el('officialMessage').textContent='Lista oficial publicada. Los empates comparten posición. La verificación de pagos y premios se realiza por separado.';
  } catch(error) {
    if(call===officialRequest) el('officialMessage').textContent='No se pudo consultar la lista: '+error.message;
  }
}
el('officialRefresh').onclick=refreshOfficialList;
el('officialRoundSelect').onchange=event=>loadOfficialRanking(event.target.value);
refreshOfficialList();

const css=document.createElement('style');
css.textContent=`
#participantSimulator,#participantOfficial{background:#0c2b3c;border:1px solid #426676;border-radius:11px;padding:12px;margin:14px 0;color:white}
.participant-extra h2{font-size:17px;margin:3px 0 9px}
.participant-extra h3{font-size:14px;margin:10px 0 5px}
#simulatorMatches .simulator-match{display:grid;grid-template-columns:minmax(0,1fr) 125px;gap:7px;align-items:center;border-bottom:1px solid #345367;padding:7px 0}
#simulatorMatches label{font-size:12px;font-weight:650;overflow-wrap:anywhere}
#simulatorMatches select,#participantOfficial select{width:100%;min-width:0;border:1px solid #96acb9;background:#f5f7fa;color:#132d3d;border-radius:7px;padding:9px 5px;font-size:12px}
#simulatorMatches .simulator-wildcard{border-left:3px solid #d5f235;padding-left:7px;background:#244638}
.participant-extra-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}
.participant-extra-actions button{flex:1 1 145px;font-size:12px}
.simulator-score{background:#183c53;border:1px solid #52788e;padding:12px;border-radius:8px;font-size:13px;line-height:1.55}
.simulator-score p{margin:5px 0}
.simulator-score small{color:#d3e5e8;overflow-wrap:anywhere}
.participant-official-filter{display:flex;gap:8px;align-items:center}
.participant-official-filter select{flex:1}
.participant-official-filter button{flex:0 0 auto;font-size:11px}
#officialSummary{background:#1b4154;border-radius:8px;padding:10px;margin:9px 0;font-size:12px}
#officialSummary p{margin:5px 0}
.official-ranking-row{border-bottom:1px solid #476579;padding:9px 0;font-size:12px}
.official-ranking-row small{display:block;color:#c6e0e7;margin-top:3px}
#participantSimulator [hidden],#participantOfficial [hidden]{display:none!important}
@media(max-width:375px){#simulatorMatches .simulator-match{grid-template-columns:minmax(0,1fr) 109px;gap:4px}}
`;
document.head.append(css);
})();
