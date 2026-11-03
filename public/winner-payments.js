// CONCILIACION_PAGOS_GANADORES_V2: vista exclusiva del panel /admin/pagos.
(() => {
'use strict';
if (!/^\/admin\/pagos\/?$/.test(location.pathname)) return;
let selectedRound = '';
let loadedReview = null;
const elem = id => document.getElementById(id);
const money = cents => (Number(cents || 0)/100).toLocaleString('es-MX', {
  style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2
});
const node = (tag, content, cls='') => {
  const el=document.createElement(tag);
  el.textContent=content;
  if(cls) el.className=cls;
  return el;
};
const originalRender=adminRender;
adminRender=function(){
  originalRender();
  if(!unlocked || elem('winnerPaymentReviewPanel'))return;
  const parent=elem('paymentsOnlyPanel');
  if(!parent)return;
  const section=document.createElement('section');
  section.id='winnerPaymentReviewPanel';section.className='admin-row';
  section.innerHTML=`
    <h2>🏆 Conciliación de posibles ganadores</h2>
    <p class="hint">Revisión privada de los primeros lugares por aciertos. Solo se consideran pagados los abonos VALIDADOS en este sistema; los estados antiguos de una quiniela no acreditan pago.</p>
    <label for="winnerPayRound">Jornada</label>
    <select id="winnerPayRound" style="width:100%;padding:10px" onchange="loadWinnerPaymentReview(this.value)"></select>
    <div class="payment-actions">
      <button type="button" class="secondary" onclick="loadWinnerPaymentReview(document.getElementById('winnerPayRound').value)">ACTUALIZAR REVISIÓN</button>
      <button type="button" class="outline" onclick="exportWinnerPaymentReview()">EXPORTAR CSV</button>
    </div>
    <p class="hint" id="winnerPaySummary">Cargando información…</p>
    <div id="winnerPayList"></div>
    <p class="hint">La clasificación deportiva no se altera por el estado de pago. La entrega de premios debe revisarse según las bases del concurso.</p>`;
  const payments=elem('paymentControlPanel');
  if(payments)payments.after(section);else parent.prepend(section);
  loadWinnerPayRounds();
};

async function loadWinnerPayRounds(){
  try{
    const rounds=await request('/api/admin/rounds');
    const select=elem('winnerPayRound');if(!select)return;
    select.replaceChildren();
    if(!rounds.length){elem('winnerPaySummary').textContent='No hay jornadas disponibles.';return;}
    for(const round of rounds)select.append(new Option(round.name+(round.is_active?' · ACTIVA':''),String(round.id)));
    if(!rounds.some(x=>String(x.id)===selectedRound))selectedRound=String((rounds.find(x=>x.is_active)||rounds[0]).id);
    select.value=selectedRound;
    await loadWinnerPaymentReview(selectedRound);
  }catch(e){const el=elem('winnerPaySummary');if(el)el.textContent='Error consultando jornadas: '+e.message;}
}

async function loadWinnerPaymentReview(id){
  if(!id)return;
  selectedRound=String(id);loadedReview=null;
  const list=elem('winnerPayList'),label=elem('winnerPaySummary');
  if(!list||!label)return;
  list.replaceChildren();label.textContent='Calculando aciertos y conciliando pagos…';
  try{
    const data=await request('/api/admin/results/'+encodeURIComponent(id)+'/payment-review');
    if(selectedRound!==String(id)||!elem('winnerPayList'))return;
    loadedReview=data;
    const review=data.paymentReview;
    if(!review)throw Error('El servidor aun no tiene instalada la conciliacion de pagos.');
    label.textContent=data.round.name+' · '+(data.status==='final'?'RESULTADOS FINALES':'RESULTADOS PROVISIONALES')+
      ' · '+data.rankings.length+' participaciones · '+review.summary.totalCandidates+' primer(os) lugar(es) por aciertos';
    if(data.status!=='final'){
      list.append(node('p','La jornada aún es provisional. Se muestran pagos para revisión, pero no se deben confirmar ganadores.', 'hint warning'));
    }
    if(!review.candidates.length){
      list.append(node('p','No hay primeros lugares definidos con aciertos por el momento.','hint'));
      return;
    }
    list.append(node('h3','Primeros lugares deportivos · revisión financiera'));
    list.append(node('p',review.summary.confirmedCandidates+' de '+review.summary.totalCandidates+
      ' folios tienen pago completo validado.','hint'));
    for(const entry of review.candidates){
      const card=node('div','','winner-pay-card');
      card.append(node('strong',entry.participant+' · '+entry.folio));
      card.append(node('p',entry.bestScore+' aciertos · Pago '+
        (entry.fullPaymentValidated?'COMPLETO Y VALIDADO':'PENDIENTE DE CONCILIACIÓN'),
        entry.fullPaymentValidated?'hint':'hint warning'));
      card.append(node('p','Importe '+money(entry.requiredCents)+
        ' · Validado '+money(entry.validatedCents)+
        ' · En revisión '+money(entry.reviewingCents)+
        ' · Saldo '+money(entry.outstandingCents),'hint'));
      list.append(card);
    }
  }catch(e){if(selectedRound===String(id))label.textContent='No se pudo cargar la conciliación: '+e.message;}
}

async function exportWinnerPaymentReview(){
  const id=selectedRound;
  if(!id)return alert('Selecciona una jornada.');
  try{
    // Descargar datos recientes en vez de reutilizar una vista que pudo quedar desactualizada.
    const data=await request('/api/admin/results/'+encodeURIComponent(id)+'/payment-review');
    if(!data.paymentReview)throw Error('No existe la conciliación de pagos.');
    const header=['Jornada','Posición','Folio','Participante','Aciertos','Importe MXN',
      'Validado MXN','Por revisar MXN','Saldo MXN','Pago completo validado','Primer lugar deportivo'];
    const leaders=new Set(data.paymentReview.candidates.map(x=>x.folio));
    const rows=data.paymentReview.entries.map(x=>[data.round.name,x.rank,x.folio,x.participant,
      x.bestScore,(x.requiredCents/100).toFixed(2),(x.validatedCents/100).toFixed(2),
      (x.reviewingCents/100).toFixed(2),(x.outstandingCents/100).toFixed(2),
      x.fullPaymentValidated?'SI':'NO',leaders.has(x.folio)?'SI':'NO']);
    const quote=value=>{
      let text=String(value??'');
      if(/^[\s\t\r\n]*[=+@-]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const csv='\ufeff'+[header,...rows].map(r=>r.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;
    link.download='conciliacion-ganadores-jornada-'+id+'.csv';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(e){alert('No se pudo exportar el reporte: '+e.message);}
}
Object.assign(window,{loadWinnerPaymentReview,exportWinnerPaymentReview});
document.head.insertAdjacentHTML('beforeend',`<style>
#winnerPaymentReviewPanel{border:1px solid #637c8b;border-radius:9px;padding:12px;margin:18px 0}
#winnerPaymentReviewPanel .winner-pay-card{padding:10px;margin:9px 0;border:1px solid #546f7e;border-radius:8px}
#winnerPaymentReviewPanel .winner-pay-card p{margin:5px 0}
#winnerPaymentReviewPanel .payment-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
#winnerPaymentReviewPanel .payment-actions button{flex:1 1 130px}
</style>`);
if(unlocked && elem('aTitle'))adminRender();
})();
