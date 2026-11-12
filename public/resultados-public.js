// RESULTADOS_GANADORES_V1: la pagina publica nunca consulta rutas administrativas.
// CONCILIACION_PAGOS_GANADORES_V2: aviso sobre verificacion administrativa.
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
   win.textContent='🏆 Primer lugar deportivo por aciertos (sujeto a las bases del concurso): '+data.leaders.map(x=>x.participant+' ('+x.folio+')').join(', ');
   win.hidden=false;
  }
  if(data.requiresManualReview){
   win.className='winner warning';win.textContent='Clasificación pendiente de revisión por múltiples encuentros suspendidos.';
   win.hidden=false;
  }
  // QUINIFUT_RESULTADOS_PUBLICOS_COMPACTOS_ROJOS_V9
  // Misma tabla compacta del administrador, pero de solo lectura. Se dibuja
  // exclusivamente con datos de /api/results/:id (resultados publicados).
  const matches=el('matchResults');
  matches.replaceChildren();
  matches.classList.add('pr-compact-results');
  matches.setAttribute('aria-label','Resultados publicados de los partidos de esta jornada');
  const legend=make('div','','pr-compact-heading');
  legend.append(make('span','⚽ RESULTADOS DE LOS PARTIDOS'));
  legend.append(make('small','Rojo = resultado publicado · S = suspendido'));
  matches.append(legend);
  const outcomeNames={L:'ganó el local',E:'empate',V:'ganó el visitante',S:'partido suspendido'};
  function mark(code, selected, extra=''){
    const chip=make('span',code,'pr-result-mark'+(extra?' '+extra:'')+(code===selected?' pr-chosen':''));
    chip.setAttribute('aria-hidden','true');
    return chip;
  }
  data.round.teams.forEach((match,i)=>{
    const wildcard=i===data.round.matchCount-1;
    const chosen=['L','E','V','S'].includes(data.outcomes[i])?data.outcomes[i]:null;
    const row=make('div','','pr-result-row'+(wildcard?' pr-wild':''));
    row.setAttribute('aria-label',(wildcard?'Comodín':'Partido '+(i+1))+': '+match.home+
      ' contra '+match.away+', resultado: '+(outcomeNames[chosen]||'pendiente'));
    // QUINIFUT_LOGOS_RESULTADOS_PUBLICOS_V10
    // Se muestran los mismos escudos cargados para esta jornada en el panel de administracion.
    // Solo se admiten imagenes base64 PNG/JPEG/WEBP; si no hay escudo, queda el nombre.
    function teamLogo(value) {
      if (typeof value !== 'string' || value.length >= 160000 ||
          !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
      const image=document.createElement('img');
      image.className='pr-team-logo';
      image.src=value;
      image.alt=''; // El nombre del equipo ya proporciona el texto accesible.
      image.loading='lazy';
      image.decoding='async';
      return image;
    }
    const home=make('div','','pr-team pr-team-home');
    if(wildcard)home.append(make('span','★','pr-wild-badge'));
    const homeImage=teamLogo(match.homeLogo);
    if(homeImage)home.append(homeImage);
    home.append(make('span',match.home,'pr-team-name'));
    const away=make('div','','pr-team pr-team-away');
    away.append(make('span',match.away,'pr-team-name'));
    const awayImage=teamLogo(match.awayLogo);
    if(awayImage)away.append(awayImage);
    row.append(mark('L',chosen,'pr-edge'),home,mark('E',chosen),away,
      mark('V',chosen,'pr-edge'),wildcard?make('span','','pr-no-suspend'):mark('S',chosen,'pr-suspend'));
    matches.append(row);
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
