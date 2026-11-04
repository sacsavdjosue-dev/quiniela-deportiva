// RESULTADOS_PARTICIPANTES_SIMULADOS_V4
// Despliega resultados de participantes debajo de la puntuacion personal;
// no crea una tercera pestana ni tabla aparte.
(() => {
'use strict';
const matches=document.getElementById('simMatches');
const output=document.getElementById('simScore');
if(!matches||!output)return;
const make=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const wrap=make('div',undefined,'sim-participants');
wrap.id='simulatedParticipantResults';
wrap.append(make('h3','Resultados de los participantes'));
const status=make('p','Selecciona resultados o pulsa RESULTADOS AL AZAR para ver los puntos de cada folio.','muted');
status.setAttribute('role','status');
const list=make('div');
const more=make('button','MOSTRAR MÁS','secondary');more.type='button';more.hidden=true;
wrap.append(status,list,more);
output.insertAdjacentElement('afterend',wrap);
let all=[],shown=0,total=0,timer=null,controller=null,requestNum=0;
const PAGE=40;
function draw(reset=false){
 if(reset){shown=0;list.replaceChildren();}
 const slice=all.slice(shown,shown+PAGE);shown+=slice.length;
 for(const person of slice){
  const row=make('div',undefined,'leader-row');
  const detail=make('div');
  detail.append(make('strong',(person.rank===null?'—':'#'+person.rank)+' · '+(person.participant||'Participante')));
  detail.append(make('small','Folio: '+person.folio));
  row.append(detail,make('span',person.bestScore+' / '+total+' aciertos','score'));
  list.append(row);
 }
 more.hidden=shown>=all.length;
 more.textContent='MOSTRAR MÁS ('+(all.length-shown)+' restantes)';
}
more.addEventListener('click',()=>draw());
function invalidate(){clearTimeout(timer);if(controller)controller.abort();requestNum++;}
function update(){
 invalidate();const current=requestNum;
 const fields=Array.from(matches.querySelectorAll('select[data-i]'));
 const outcomes=fields.map(n=>n.value||null);
 if(![10,11].includes(outcomes.length)){
  status.textContent='Cargando partidos de la jornada…';all=[];list.replaceChildren();more.hidden=true;return;
 }
 if(outcomes.slice(0,-1).filter(x=>x==='S').length>1){
  status.textContent='El comodín solamente sustituye un suspendido. Corrige los resultados.';
  all=[];list.replaceChildren();more.hidden=true;return;
 }
 if(!outcomes.some(x=>['L','E','V'].includes(x))){
  status.textContent='Selecciona resultados o pulsa RESULTADOS AL AZAR para consultar los puntos.';
  all=[];list.replaceChildren();more.hidden=true;return;
 }
 status.textContent='Calculando los resultados de los participantes…';
 timer=setTimeout(async()=>{
  controller=new AbortController();
  try{
   const response=await fetch('/api/participant/simulated-results',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    cache:'no-store',signal:controller.signal,body:JSON.stringify({outcomes})});
   const data=await response.json().catch(()=>{throw Error('Respuesta no válida del servidor.')});
   if(!response.ok)throw Error(data.error||'No se pudieron calcular los resultados.');
   if(current!==requestNum)return;
   all=Array.isArray(data.rankings)?data.rankings:[];
   total=Number(data.scoredMatches||0);
   status.textContent=all.length
    ?all.length+' quiniela(s) registradas · '+total+' encuentro(s) puntuados. Puntos según los resultados elegidos (no oficiales).'
    :'No hay quinielas registradas en la jornada activa.';
   draw(true);
  }catch(err){
   if(current!==requestNum||err.name==='AbortError')return;
   status.textContent='No se pudieron mostrar los resultados: '+err.message;
   all=[];draw(true);
  }
 },250);
}
// Eventos delegados: sirven tambien si la lista de partidos se vuelve a crear.
matches.addEventListener('change',e=>{if(e.target.matches('select[data-i]'))update()});
document.getElementById('randomSim')?.addEventListener('click',update);
document.getElementById('clearSim')?.addEventListener('click',update);
const style=document.createElement('style');style.textContent=`
.sim-participants{margin:12px 0 0;padding-top:11px;border-top:1px solid #4c6b7a}
.sim-participants h3{margin:4px 0 5px;font-size:16px}
.sim-participants .leader-row{padding:9px 2px}
.sim-participants .leader-row .score{font-size:15px;white-space:nowrap}
.sim-participants button[hidden]{display:none!important}
.sim-participants>button{margin:10px 0;width:100%}
`;document.head.append(style);
})();
