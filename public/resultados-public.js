// RESULTADOS_GANADORES_V1: la pagina publica nunca consulta rutas administrativas.
(() => {
'use strict';
const el=id=>document.getElementById(id);
const make=(tag,text,className='')=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e};
const labels={L:'Local',E:'Empate',V:'Visitante',S:'Suspendido'};
let activeRound='';
async function getJSON(url){
 const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
 let data;try{data=await response.json()}catch{throw Error('El servidor devolvio una respuesta no valida.')}
 if(!response.ok)throw Error(data.error||'No se pudo consultar la jornada.');
 return data;
}
async function init(){
 try{
  const rounds=await getJSON('/api/results/rounds');
  const select=el('roundSelect');
  select.replaceChildren();
  if(!rounds.length){
   select.append(new Option('Todavía no hay resultados públicos',''));
   select.disabled=true;
   el('statusMessage').textContent='El administrador todavía no ha publicado resultados de ninguna jornada.';
   return;
  }
  for(const round of rounds)select.append(new Option(round.name+(round.status==='final'?' · Final':' · Provisional'),String(round.id)));
  const requested=new URLSearchParams(location.search).get('jornada');
  const validRequested=rounds.find(r=>String(r.id)===requested);
  select.value=String(validRequested?.id||rounds[0].id);
  select.addEventListener('change',()=>loadPublicResults(select.value));
  await loadPublicResults(select.value);
 }catch(e){el('statusMessage').textContent='No se pudieron cargar resultados: '+e.message}
}
async function loadPublicResults(id){
 activeRound=String(id);
 el('statusMessage').textContent='Consultando clasificación…';
 for(const area of ['summarySection','matchesSection','rankingSection'])el(area).hidden=true;
 try{
  const data=await getJSON('/api/results/'+encodeURIComponent(id));
  if(activeRound!==String(id))return;
  el('roundTitle').textContent=data.round.name;
  el('resultStatus').textContent=data.status==='final'?'FINAL':'PROVISIONAL';
  el('resultScored').textContent=data.scoredMatches+' / '+data.expectedMatches;
  el('resultEntries').textContent=String(data.rankings.length);
  el('resultSuspended').textContent=String(data.suspendedMatches);
  el('statusMessage').textContent=(data.status==='final'?'Resultados finales':'Resultados provisionales')+
   ' · Última actualización: '+new Date(data.updatedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'});
  el('summarySection').hidden=false;
  const win=el('winnerMessage');win.hidden=true;win.replaceChildren();
  if(data.status==='final'&&data.leaders.length&&data.scoredMatches>0){
   win.className='winner';
   win.textContent='🏆 Primer lugar: '+data.leaders.map(x=>x.participant+' ('+x.folio+')').join(', ');
   win.hidden=false;
  }
  if(data.requiresManualReview){
   win.className='winner warning';win.textContent='Clasificación pendiente de revisión por múltiples encuentros suspendidos.';
   win.hidden=false;
  }
  const matches=el('matchResults');matches.replaceChildren();
  data.round.teams.forEach((match,i)=>{
   const wildcard=i===data.round.matchCount-1;
   const row=make('div','','game'+(wildcard?' wild':''));
   row.append(make('span',(wildcard?'⭐ Comodín':'Partido '+(i+1))+' · '+match.home+' - '+match.away));
   const value=data.outcomes[i];
   const outcome=make('span',value?(value+' · '+labels[value]):'Pendiente','outcome');
   row.append(outcome);matches.append(row);
  });
  el('matchesSection').hidden=false;
  const list=el('rankingResults');list.replaceChildren();
  el('rankingDescription').textContent=data.scoredMatches?
   'Se comparan las combinaciones de cada folio contra los encuentros puntuados.':
   'Todavía no hay encuentros puntuables; no se asignan posiciones.';
  if(!data.scoredMatches){list.append(make('p','Sin puntuaciones disponibles.','note'))}
  else if(!data.rankings.length){list.append(make('p','No hay participaciones registradas.','note'))}
  else for(const person of data.rankings){
   const row=make('div','','person');
   const left=make('div','');
   left.append(make('strong','#'+person.rank+' · '+person.participant));
   left.append(make('small','Folio: '+person.folio+' · '+person.bestCombinationsCount+' combinación(es) con ese puntaje'));
   row.append(left,make('span',person.bestScore+' / '+data.scoredMatches,'score'));
   list.append(row);
  }
  el('rankingSection').hidden=false;
 }catch(e){if(activeRound===String(id))el('statusMessage').textContent='No se pudo cargar la jornada: '+e.message;}
}
init();
})();
