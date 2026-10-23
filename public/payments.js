// CONTROL_PAGOS_V1: interfaz administrativa de abonos; no cambia la quiniela del participante.
const moneyPayments=cents=>(Number(cents||0)/100).toLocaleString('es-MX',{
 style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2
});
const pesosPayments=pesos=>(Number(pesos||0)).toLocaleString('es-MX',{
 style:'currency',currency:'MXN',minimumFractionDigits:2,maximumFractionDigits:2
});
const paymentDateTime=iso=>iso?new Date(iso).toLocaleString('es-MX',{
 timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'
}):'—';
const paymentDate=date=>{
 if(!date)return '—';
 const match=String(date).match(/^\d{4}-\d{2}-\d{2}/);
 return match?match[0].split('-').reverse().join('/'):String(date);
};
let paymentSelectedFolio='';
let paymentSelectedAccount=null;
let paymentPendingAttempt=null;
let paymentAccountSeq=0;
let paymentSummarySeq=0;
let paymentSearchTimer=null;
let paymentOperationBusy=false;
const paymentElement=id=>document.getElementById(id);
function makePaymentNode(tag,css,textValue){
 const element=document.createElement(tag);
 if(css)element.className=css;
 if(textValue!==undefined)element.textContent=textValue;
 return element;
}

const baseAdminRenderPayments=adminRender;
adminRender=function(){
 baseAdminRenderPayments();
 if(!unlocked||paymentElement('paymentControlPanel'))return;
 const panel=paymentElement('adminContent');
 const section=document.createElement('section');
 section.id='paymentControlPanel';section.className='admin-row';
 section.innerHTML=`
 <h2>Control administrativo de pagos</h2>
 <p class="hint">Los abonos registrados quedan pendientes hasta que el administrador los valide. Los estados anteriores de las quinielas no constituyen cobros verificados.</p>
 <label for="paymentRound">Jornada</label>
 <select id="paymentRound" onchange="reloadPaymentPanel()"><option value="">Todas las jornadas</option></select>
 <div class="payment-stats">
   <div><small>Importe registrado</small><strong id="paymentsRegistered">—</strong></div>
   <div><small>Cobrado validado</small><strong id="paymentsValidated">—</strong></div>
   <div><small>Abonos por validar</small><strong id="paymentsReviewing">—</strong></div>
   <div><small>Saldo pendiente</small><strong id="paymentsBalance">—</strong></div>
 </div>
 <div class="payment-filters">
   <input id="paymentSearch" maxlength="100" placeholder="Buscar nombre, folio o teléfono" aria-label="Buscar cuentas por cobrar" oninput="schedulePaymentSearch()">
   <select id="paymentState" aria-label="Filtrar situación de pago" onchange="loadPaymentAccounts()">
    <option value="">Todas las situaciones</option>
    <option value="sin_abonos">Sin abonos</option>
    <option value="por_validar">Abonos por validar</option>
    <option value="parcial">Pagos parciales</option>
    <option value="completo">Totalmente pagadas</option>
   </select>
 </div>
 <div class="payment-actions">
   <button type="button" class="secondary" onclick="reloadPaymentPanel()">ACTUALIZAR PAGOS</button>
   <button type="button" class="outline" onclick="exportPaymentHistory()">EXPORTAR ABONOS CSV</button>
 </div>
 <p id="paymentAccountHint" class="hint">Cargando cuentas…</p>
 <div id="paymentAccounts"></div>
 <div id="paymentEditor" class="payment-editor" hidden>
  <h3>Registrar abono</h3>
  <p id="paymentEditorTitle" class="hint"></p>
  <label for="paymentAmount">Importe del abono (MXN)</label>
  <input type="number" id="paymentAmount" min="0.01" step="0.01" inputmode="decimal" placeholder="Ejemplo: 50.00">
  <label for="paymentMethod">Medio de pago</label>
  <select id="paymentMethod"><option value="transferencia">Transferencia BBVA</option><option value="deposito">Depósito BBVA</option></select>
  <label for="paymentPaidOn">Fecha del pago</label><input id="paymentPaidOn" type="date">
  <label for="paymentReference">Referencia (opcional)</label><input id="paymentReference" maxlength="80" placeholder="Número o concepto de referencia">
  <label for="paymentNote">Observaciones (opcional)</label><textarea id="paymentNote" maxlength="300" rows="2" placeholder="Información del comprobante"></textarea>
  <p class="hint">Este abono NO se considerará cobrado hasta que lo valides. El comprobante se revisa por separado.</p>
  <div class="payment-actions"><button type="button" id="paymentSubmitButton" class="secondary" onclick="submitPayment()">GUARDAR ABONO PENDIENTE</button><button type="button" class="outline" onclick="closePaymentEditor()">CANCELAR</button></div>
 </div>
 <div id="paymentHistory" class="payment-history" hidden></div>
 <p class="hint">Los saldos se calculan exclusivamente con abonos validados; los abonos por revisar se muestran aparte. Ningún pago se confirma de forma automática al abrir WhatsApp.</p>
 `;
 const roundsSection=panel.querySelector('section.admin-row');
 if(roundsSection)roundsSection.after(section);else panel.insertBefore(section,panel.firstChild);
 loadPaymentRounds();reloadPaymentPanel();
};

async function loadPaymentRounds(){
 try{
  const options=await request('/api/admin/rounds');
  const select=paymentElement('paymentRound');if(!select)return;
  const old=select.value;
  select.replaceChildren(new Option('Todas las jornadas',''));
  for(const round of options)select.append(new Option(round.name+(round.is_active?' (activa)':''),round.id));
  if(Array.from(select.options).some(o=>o.value===old))select.value=old;
 }catch(e){const hint=paymentElement('paymentAccountHint');if(hint)hint.textContent='No se pudieron cargar jornadas: '+e.message}
}
function paymentQuery(){return new URLSearchParams({
 roundId:paymentElement('paymentRound')?.value||'',
 q:paymentElement('paymentSearch')?.value.trim()||'',
 state:paymentElement('paymentState')?.value||''
})}
function reloadPaymentPanel(){loadPaymentSummary();loadPaymentAccounts()}
function schedulePaymentSearch(){clearTimeout(paymentSearchTimer);paymentSearchTimer=setTimeout(loadPaymentAccounts,280)}
async function loadPaymentSummary(){
 const seq=++paymentSummarySeq,roundId=paymentElement('paymentRound')?.value||'';
 try{
  const data=await request('/api/admin/payments/rounds-summary?'+new URLSearchParams({roundId}));
  if(seq!==paymentSummarySeq||!paymentElement('paymentControlPanel'))return;
  paymentElement('paymentsRegistered').textContent=moneyPayments(data.registered_cents);
  paymentElement('paymentsValidated').textContent=moneyPayments(data.validated_cents);
  paymentElement('paymentsReviewing').textContent=moneyPayments(data.reviewing_cents);
  paymentElement('paymentsBalance').textContent=moneyPayments(data.balance_cents);
 }catch(e){if(seq===paymentSummarySeq){const el=paymentElement('paymentsRegistered');if(el)el.textContent='Error: '+e.message}}
}
async function loadPaymentAccounts(){
 const seq=++paymentAccountSeq,container=paymentElement('paymentAccounts');
 if(!container)return;
 const hint=paymentElement('paymentAccountHint');hint.textContent='Consultando cuentas…';
 try{
  const response=await request('/api/admin/payments/accounts?'+paymentQuery());
  if(seq!==paymentAccountSeq||!paymentElement('paymentAccounts'))return;
  const accounts=response.rows||[];
  container.replaceChildren();
  hint.textContent=accounts.length+' cuenta(s) visibles. Hasta 100 registros por búsqueda; usa filtros para localizar participaciones anteriores.';
  if(!accounts.length){container.append(makePaymentNode('p','hint','No se encontraron participaciones con estos filtros.'));return}
  for(const b of accounts){
   const card=makePaymentNode('div','payment-account');
   const title=makePaymentNode('strong','',b.name+' · '+b.folio);
   const meta=makePaymentNode('div','hint',b.round+' · '+(b.contact_phone||'Sin teléfono')+' · '+b.status);
   const totals=makePaymentNode('div','payment-account-amounts',
    'Total '+pesosPayments(b.amount)+' · Validado '+moneyPayments(b.validated_cents)+
    ' · Por revisar '+moneyPayments(b.reviewing_cents)+' · Saldo '+moneyPayments(b.balance_cents));
   const controls=makePaymentNode('div','payment-actions');
   const add=makePaymentNode('button','secondary','REGISTRAR ABONO');add.type='button';
   add.onclick=()=>openPaymentEditor(b);
   const history=makePaymentNode('button','outline','VER ABONOS');history.type='button';
   history.onclick=()=>openPaymentHistory(b.folio);
   controls.append(add,history);
   card.append(title,meta,totals,controls);
   container.append(card);
  }
 }catch(e){if(seq===paymentAccountSeq&&hint)hint.textContent='No se pudieron cargar cuentas: '+e.message}
}
function openPaymentEditor(account){
 paymentSelectedAccount=account;paymentSelectedFolio=account.folio;
 paymentPendingAttempt=null;
 const box=paymentElement('paymentEditor');box.hidden=false;
 paymentElement('paymentEditorTitle').textContent=account.name+' · '+account.folio+
  ' · Disponible para nuevo abono: '+moneyPayments(Math.max(0,Number(account.balance_cents)-Number(account.reviewing_cents)));
 paymentElement('paymentAmount').value='';
 paymentElement('paymentReference').value='';paymentElement('paymentNote').value='';
 paymentElement('paymentMethod').value='transferencia';
 paymentElement('paymentPaidOn').value=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Mexico_City'});
 box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closePaymentEditor(){paymentSelectedAccount=null;paymentSelectedFolio='';paymentPendingAttempt=null;const box=paymentElement('paymentEditor');if(box)box.hidden=true}
async function submitPayment(){
 if(paymentOperationBusy||!paymentSelectedFolio)return;
 const amount=paymentElement('paymentAmount').value.trim();
 const method=paymentElement('paymentMethod').value;
 const reference=paymentElement('paymentReference').value.trim();
 const note=paymentElement('paymentNote').value.trim();
 const paidOn=paymentElement('paymentPaidOn').value;
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0)return alert('Escribe un importe positivo con hasta 2 decimales.');
 if(!paidOn)return alert('Selecciona la fecha del pago.');
 const payload={folio:paymentSelectedFolio,amount,method,reference,note,paidOn};
 const signature=JSON.stringify(payload);
 if(!paymentPendingAttempt||paymentPendingAttempt.signature!==signature)
  paymentPendingAttempt={signature,key:crypto.randomUUID()};
 if(!confirm('¿Registrar el abono de '+pesosPayments(amount)+' como PENDIENTE de validación? No se contabilizará como cobrado todavía.'))return;
 const button=paymentElement('paymentSubmitButton');paymentOperationBusy=true;button.disabled=true;
 try{
  const result=await request('/api/admin/payments',{method:'POST',body:JSON.stringify({...payload,paymentKey:paymentPendingAttempt.key})});
  paymentPendingAttempt=null;
  alert(result.replayed?'El abono ya estaba registrado: no se duplicó.':'Abono guardado. Revisa la evidencia y valídalo cuando corresponda.');
  closePaymentEditor();await reloadPaymentPanel();await openPaymentHistory(payload.folio);
 }catch(e){alert('No se pudo confirmar el abono: '+e.message+'\nSi hubo un fallo de conexión, puedes reintentar sin cambiar los datos.');}
 finally{paymentOperationBusy=false;if(button)button.disabled=false}
}
async function openPaymentHistory(folio){
 const container=paymentElement('paymentHistory');if(!container)return;
 container.hidden=false;container.replaceChildren();
 container.append(makePaymentNode('h3','', 'Historial de abonos · '+folio));
 container.append(makePaymentNode('p','hint','Consultando movimientos…'));
 try{
  const entries=await request('/api/admin/payments/by-folio/'+encodeURIComponent(folio));
  container.replaceChildren(makePaymentNode('h3','','Historial de abonos · '+folio));
  const close=makePaymentNode('button','outline','CERRAR HISTORIAL');close.type='button';close.onclick=()=>{container.hidden=true};
  container.append(close);
  if(!entries.length){container.append(makePaymentNode('p','hint','No hay abonos registrados para este folio.'));return}
  for(const p of entries){
   const card=makePaymentNode('div','payment-history-row');
   card.append(makePaymentNode('strong','',moneyPayments(p.amount_cents)+' · '+p.state.toUpperCase()));
   card.append(makePaymentNode('p','hint',
    (p.method==='transferencia'?'Transferencia':'Depósito')+' · Pago: '+paymentDate(p.paid_on)+
    ' · Registrado: '+paymentDateTime(p.created_at)));
   if(p.reference)card.append(makePaymentNode('p','hint','Referencia: '+p.reference));
   if(p.note)card.append(makePaymentNode('p','hint','Nota: '+p.note));
   if(p.validated_at)card.append(makePaymentNode('p','hint','Validado: '+paymentDateTime(p.validated_at)));
   if(p.voided_at)card.append(makePaymentNode('p','hint','Anulado: '+paymentDateTime(p.voided_at)+' · '+p.void_reason));
   if(p.state!=='anulado'){
    const controls=makePaymentNode('div','payment-actions');
    if(p.state==='pendiente'){
     const validate=makePaymentNode('button','secondary','VALIDAR ABONO');validate.type='button';
     validate.onclick=()=>changePaymentState(p.id,'validate',folio);controls.append(validate);
    }
    const voidButton=makePaymentNode('button','outline','ANULAR');voidButton.type='button';
    voidButton.onclick=()=>changePaymentState(p.id,'void',folio);controls.append(voidButton);
    card.append(controls);
   }
   container.append(card);
  }
  container.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(e){container.append(makePaymentNode('p','hint','Error al cargar historial: '+e.message))}
}
async function changePaymentState(id,action,folio){
 if(paymentOperationBusy)return;
 let reason='';
 if(action==='validate'){
  if(!confirm('¿Confirmas que el abono realmente ingresó a la cuenta y corresponde a esta quiniela? Esta acción sumará el importe a COBRADO VALIDADO.'))return;
 }else{
  const input=prompt('Escribe el motivo de la anulación. El movimiento permanecerá en el historial:');
  if(input===null)return;
  reason=input.trim();if(!reason)return alert('Debes indicar un motivo de anulación.');
 }
 paymentOperationBusy=true;
 try{
  await request('/api/admin/payments/'+encodeURIComponent(id),{
   method:'PATCH',body:JSON.stringify({action,reason})});
  await reloadPaymentPanel();await openPaymentHistory(folio);
 }catch(e){alert('No se pudo actualizar el abono: '+e.message)}
 finally{paymentOperationBusy=false}
}
function exportPaymentHistory(){
 const id=paymentElement('paymentRound')?.value||'';
 location.href='/api/admin/payments/export.csv?'+new URLSearchParams({roundId:id});
}
document.head.insertAdjacentHTML('beforeend',`<style>
 #paymentControlPanel .payment-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
 #paymentControlPanel .payment-stats>div{background:#1c3550;border:1px solid #425f73;border-radius:8px;padding:10px;min-width:0}
 #paymentControlPanel .payment-stats small{display:block;color:#d3e2ef;font-size:11px;margin-bottom:5px}
 #paymentControlPanel .payment-stats strong{font-size:clamp(14px,4vw,19px);overflow-wrap:anywhere}
 #paymentControlPanel .payment-filters{display:grid;grid-template-columns:1fr;gap:8px}
 #paymentControlPanel .payment-actions{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}
 #paymentControlPanel .payment-actions button{flex:1 1 130px;padding:9px 10px;font-size:12px}
 #paymentControlPanel .payment-account,#paymentControlPanel .payment-history-row{border:1px solid #496070;border-radius:8px;padding:10px;margin:8px 0}
 #paymentControlPanel .payment-account-amounts{font-size:12px;line-height:1.6;margin:7px 0}
 #paymentControlPanel .payment-editor,#paymentControlPanel .payment-history{border:1px solid #768ca4;border-radius:9px;padding:13px;margin:14px 0}
 #paymentControlPanel [hidden]{display:none!important}
 @media(min-width:560px){#paymentControlPanel .payment-stats{grid-template-columns:repeat(4,minmax(0,1fr))}#paymentControlPanel .payment-filters{grid-template-columns:2fr 1fr}}
 </style>`);
