// SIMULADOR_SEPARADO_EN_VIVO_V2: página pública independiente.
// La simulación no consulta apuestas de terceros ni modifica registros.
(() => {
'use strict';
const el=id=>document.getElementById(id);
const mk=(tag,value,cls='')=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=value;if(cls)node.className=cls;return node};
const sym=['L','E','V'];
let roundConfig=null;
let personalPicks=[];
let simulated=[];
let liveData=null;
let liveRoundRequest=0;
let liveDataRequest=0;
let selectedRound='';
let page=0;
const PAGE_SIZE=50;
const maxCombos=5000;
const isActiveLive=()=>!el('livePanel').classList.contains('hide');
const parseJSON=async url=>{
 const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
 let data;try{data=await response.json()}catch{throw Error('Respuesta inesperada del servidor.');}
 if(!response.ok)throw Error(data.error||'No se pudo consultar el servidor.');
 return data;
};
function setTab(tab){
 const sim=tab==='sim';
 el('simPanel').classList.toggle('hide',!sim);
 el('livePanel').classList.toggle('hide',sim);
 el('tabSim').classList.toggle('active',sim);
 el('tabLive').classList.toggle('active',!sim);
 el('tabSim').setAttribute('aria-pressed',String(sim));
 el('tabLive').setAttribute('aria-pressed',String(!sim));
 if(!sim)loadLiveRows();
}
el('tabSim').onclick=()=>setTab('sim');
el('tabLive').onclick=()=>setTab('live');

function expandPicks(groups){
 let total=1;
 for(const group of groups){total*=group.length;if(total>maxCombos)return null;}
 let rows=[''];
 for(const group of groups){const next=[];for(const prefix of rows)for(const choice of sym)if(group.includes(choice))next.push(prefix+choice);rows=next;}
 return rows;
}
function scoreHypothetical(){
 const output=el('simScore');
 if(!roundConfig){output.textContent='No hay jornada activa disponible.';return;}
 if(personalPicks.some(group=>!group.length)){
  output.textContent='Marca por lo menos un pronóstico L, E o V en cada encuentro para simular tus aciertos.';
  return;
 }
 const regular=simulated.slice(0,-1),suspended=regular.filter(v=>v==='S').length;
 if(suspended>1){output.textContent='Más de un partido suspendido: el comodín solo puede sustituir uno. Requiere revisión manual.';return;}
 const checks=[];
 regular.forEach((value,index)=>{if(sym.includes(value))checks.push([index,value]);});
 if(suspended===1&&sym.includes(simulated.at(-1)))checks.push([simulated.length-1,simulated.at(-1)]);
 if(!checks.length){output.textContent='Captura al menos un resultado hipotético.';return;}
 const combinations=expandPicks(personalPicks);
 if(!combinations){output.textContent='Tu selección supera 5,000 combinaciones. Reduce dobles o triples.';return;}
 let best=-1,count=0;const samples=[];
 for(const combination of combinations){let points=0;for(const [index,outcome] of checks)if(combination[index]===outcome)points++;
  if(points>best){best=points;count=0;samples.length=0;}
  if(points===best){count++;if(samples.length<3)samples.push(combination.split('').join(' '));}
 }
 const hint=suspended===1&&!sym.includes(simulated.at(-1))?' Falta el resultado del comodín para sustituir el encuentro suspendido.':'';
 output.replaceChildren(mk('strong',`Mejor combinación: ${best} / ${checks.length} aciertos`),
  mk('p',`${count} de ${combinations.length} combinaciones obtienen ese puntaje.${hint}`),
  mk('small','Ejemplos: '+samples.join('  ·  ')));
}
async function loadSim(){
 try{
  const cfg=await parseJSON('/api/config');
  const count=Number(cfg.matchCount);
  if(![10,11].includes(count)||!Array.isArray(cfg.teams)||cfg.teams.length<count)throw Error('Configuración incompleta.');
  roundConfig=cfg;
  personalPicks=Array.from({length:count},()=>[]);
  simulated=Array(count).fill(null);
  el('simRoundInfo').textContent=`${cfg.round} · ${count-1} partidos normales y 1 comodín. No requiere registro.`;
  const target=el('simMatches');target.replaceChildren();
  cfg.teams.slice(0,count).forEach((match,i)=>{
   const wildcard=i===count-1;
   const row=mk('div',undefined,'match'+(wildcard?' wild':''));
   const left=mk('div');
   left.append(mk('div',(wildcard?'⭐ COMODÍN · ':'Partido '+(i+1)+' · ')+match.home+' vs '+match.away,'names'));
   left.append(mk('small','Tus pronósticos (L / E / V)'));
   const buttons=mk('div',undefined,'pickline');
   for(const choice of sym){const button=mk('button',choice);button.type='button';button.setAttribute('aria-pressed','false');button.title='Pronóstico '+choice;
    button.onclick=()=>{const choices=personalPicks[i];const idx=choices.indexOf(choice);if(idx>=0)choices.splice(idx,1);else choices.push(choice);button.classList.toggle('on',idx<0);button.setAttribute('aria-pressed',String(idx<0));scoreHypothetical();};buttons.append(button);}
   left.append(buttons);
   const right=mk('div');right.append(mk('small','Resultado hipotético'));
   const select=document.createElement('select');select.setAttribute('aria-label','Resultado simulado del partido '+(i+1));select.dataset.i=String(i);
   const options=[['','Pendiente'],['L','L · Local'],['E','E · Empate'],['V','V · Visitante']];if(!wildcard)options.push(['S','S · Suspendido']);
   for(const [value,label]of options)select.append(new Option(label,value));
   select.onchange=()=>{simulated[i]=select.value||null;scoreHypothetical();};right.append(select);
   row.append(left,right);target.append(row);
  });
  scoreHypothetical();
 }catch(error){el('simRoundInfo').textContent='No se pudo cargar la jornada: '+error.message;}
}
el('randomSim').onclick=()=>{if(!roundConfig)return;simulated=simulated.map(()=>sym[Math.floor(Math.random()*3)]);document.querySelectorAll('#simMatches select').forEach((node,i)=>{node.value=simulated[i]});scoreHypothetical();};
el('clearSim').onclick=()=>{if(!roundConfig)return;personalPicks=personalPicks.map(()=>[]);simulated=simulated.map(()=>null);document.querySelectorAll('#simMatches select').forEach(node=>{node.value='';});document.querySelectorAll('.pickline button').forEach(node=>{node.classList.remove('on');node.setAttribute('aria-pressed','false')});scoreHypothetical();};

async function loadLiveRounds(){
 const call=++liveRoundRequest;
 try{
  const rounds=await parseJSON('/api/participant/live/rounds');
  if(call!==liveRoundRequest)return;
  const picker=el('liveRound');const prev=selectedRound||picker.value;
  picker.replaceChildren();
  if(!rounds.length){picker.append(new Option('Sin jornadas',''));el('liveMessage').textContent='No se han registrado jornadas.';return;}
  for(const r of rounds)picker.append(new Option(`${r.name}${r.active?' · activa':''} (${r.registrations} folios)`,String(r.id)));
  selectedRound=rounds.some(r=>String(r.id)===String(prev))?String(prev):String(rounds[0].id);
  picker.value=selectedRound;
  if(isActiveLive())loadLiveRows();
 }catch(error){el('liveMessage').textContent='No se pudieron cargar las jornadas: '+error.message;}
}
async function loadLiveRows(){
 if(!selectedRound)return;
 const request=++liveDataRequest;
 try{
  const data=await parseJSON('/api/participant/live/'+encodeURIComponent(selectedRound));
  if(request!==liveDataRequest||String(data.round.id)!==selectedRound)return;
  liveData=data;
  const badge=el('liveBadge');badge.textContent=data.official?'CLASIFICACIÓN OFICIAL':'EN VIVO · PROVISIONAL';
  const summary=el('liveStats');summary.classList.remove('hide');
  summary.textContent=`${data.round.name} · ${data.totalRegistered} folios registrados · ${data.scoredMatches}/${data.expectedMatches} partidos puntuados`;
  let message=(data.official?'Resultados definitivos.':'Resultados provisionales; pueden cambiar al ingresar nuevos folios o marcadores.');
  if(!data.published)message+=' El administrador aún no publica marcadores: se muestran folios pendientes, sin aciertos.';
  if(data.requiresManualReview)message+=' ATENCIÓN: múltiples suspendidos; el comodín no se suma hasta la revisión.';
  el('liveMessage').textContent=message;
  paintRanking();
 }catch(error){if(request===liveDataRequest)el('liveMessage').textContent='No se pudo consultar la clasificación: '+error.message;}
}
function paintRanking(){
 const target=el('liveRows');target.replaceChildren();
 if(!liveData)return;
 const query=el('liveSearch').value.trim().toLocaleLowerCase('es-MX');
 const rows=liveData.rankings.filter(item=>!query || (item.folio+' '+(item.participant||'')).toLocaleLowerCase('es-MX').includes(query));
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));page=Math.min(page,pages-1);
 const start=page*PAGE_SIZE;
 for(const item of rows.slice(start,start+PAGE_SIZE)){
  const row=mk('div',undefined,'leader-row');const left=mk('div');
  left.append(mk('strong',(item.rank?'#'+item.rank+' · ':'')+(item.participant||'Participante')));
  left.append(mk('small','Folio: '+item.folio+' · '+item.combinationsCount+' combinaciones'));
  row.append(left,mk('div',liveData.scoredMatches?item.bestScore+' / '+liveData.scoredMatches:'Pendiente','score'));
  target.append(row);
 }
 if(!rows.length)target.append(mk('p','No hay participaciones que coincidan con la búsqueda.','muted'));
 el('livePageLabel').textContent=`${rows.length} folios · página ${page+1} de ${pages}`;
 el('prevPage').disabled=page===0;el('nextPage').disabled=page>=pages-1;
}
el('liveRound').onchange=()=>{selectedRound=el('liveRound').value;page=0;liveData=null;loadLiveRows();};
el('liveSearch').oninput=()=>{page=0;paintRanking();};
el('prevPage').onclick=()=>{if(page>0){page--;paintRanking();}};
el('nextPage').onclick=()=>{page++;paintRanking();};
el('liveRefresh').onclick=()=>{loadLiveRounds();loadLiveRows();};
// Son consultas periódicas de 15 segundos; no un flujo por WebSocket.
setInterval(()=>{if(isActiveLive()&&!document.hidden)loadLiveRows();},15000);
setInterval(()=>{if(isActiveLive()&&!document.hidden)loadLiveRounds();},60000);
loadSim();loadLiveRounds();
})();
