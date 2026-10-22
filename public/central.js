// Extensión para servidor central: el navegador no almacena apuestas como fuente oficial.
const request=async(url,options={})=>{const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});let data;try{data=await r.json()}catch{throw Error('No se pudo contactar al servidor')}if(!r.ok)throw Error(data.error||'Error del servidor');return data};
let centralReady=false;
async function syncConfig(){try{cfg=await request('/api/config');picks=[];centralReady=true;render();const session=await request('/api/admin/session');if(session.authenticated){unlocked=true;adminRender()}}catch(e){centralReady=false;document.querySelector('#user .hint').textContent='Sin conexión con el servidor. No se pueden registrar apuestas. '+e.message;document.querySelector('#user button.primary').disabled=true}}
const originalAdminRender=adminRender;
adminRender=function(){originalAdminRender();if(!unlocked)return;const panel=document.getElementById('adminContent');panel.insertAdjacentHTML('beforeend',`<hr style="margin:22px 0;border-color:#496070"><h2>Registro central de quinielas</h2><p class="hint">Estados: pendiente, recibida, pagada y validada. La recepción de WhatsApp y los pagos deben confirmarse manualmente.</p><div class="two"><button class="secondary" onclick="loadBets()">ACTUALIZAR REGISTRO</button><button class="outline" onclick="exportBets()">EXPORTAR CSV</button></div><div class="two" style="margin-top:8px"><input id="betSearch" placeholder="Buscar folio o participante" oninput="paintBets()"><select id="betStatus" onchange="paintBets()"><option value="">Todos los estados</option><option>pendiente</option><option>recibida</option><option>pagada</option><option>validada</option></select></div><p id="betSummary" class="hint"></p><div id="betTable" style="overflow-x:auto"></div><button class="outline" style="margin-top:15px" onclick="logoutAdmin()">CERRAR SESIÓN</button>`);loadBets()};
unlock=async function(){try{await request('/api/admin/login',{method:'POST',body:JSON.stringify({password:document.getElementById('pass').value})});unlocked=true;adminRender()}catch(e){alert(e.message)}};
async function logoutAdmin(){await request('/api/admin/logout',{method:'POST'});unlocked=false;location.reload()}
saveAdmin=async function(){collect();try{await request('/api/config',{method:'PUT',body:JSON.stringify(cfg)});picks=[];render();alert('Configuración guardada en el servidor central.');}catch(e){alert('No se guardó: '+e.message)}};
// Registrar primero en el servidor. Solo después preparar el enlace a WhatsApp.
sendWhatsApp=async function(){if(!centralReady)return alert('No hay conexión con el servidor central.');const name=document.getElementById('participant').value.trim();if(!name)return alert('Ingresa tu nombre.');if(picks.some(p=>!p.length))return alert('Completa todos los encuentros.');const rows=combinations();if(!rows)return alert('Demasiadas combinaciones. Reduce dobles o triples.');if(!rows.length)return alert('Completa los encuentros.');const phone=String(cfg.phone||'').replace(/\D/g,'');if(phone.length<10)return alert('El administrador debe configurar el número de WhatsApp.');const button=document.querySelector('#user button.primary');button.disabled=true;button.textContent='REGISTRANDO...';try{const bet=await request('/api/bets',{method:'POST',body:JSON.stringify({name,selections:picks,round:cfg.round})});const lines=bet.rows.map((r,i)=>`${String(i+1).padStart(3,'0')}: ${r.split('').join(' ')}`);const message=`⚽ ${bet.title}\n${bet.round}\nFolio: ${bet.folio}\nParticipante: ${name}\nL=Local E=Empate V=Visitante\nÚltima posición: COMODÍN (solo si se suspende un partido anterior)\n\nCOMBINACIONES (${bet.count}):\n${lines.join('\n')}\n\nCosto por quiniela: $${bet.cost} MXN\nTotal: $${bet.amount.toLocaleString('es-MX')} MXN\nEstado: PENDIENTE de confirmación por el administrador.`;const url='https://wa.me/'+phone+'?text='+encodeURIComponent(message);document.getElementById('sendStatus').textContent=`Registro central guardado · Folio ${bet.folio} · ${bet.count} combinaciones · $${bet.amount} MXN · Estado: pendiente.`;if(url.length>15000){document.getElementById('sendStatus').textContent+=' El mensaje excede el tamaño recomendado para WhatsApp; consulta tu folio con el administrador.';return}
const link = document.getElementById('whatsappLink');
link.classList.add('hidden');

// Abrir WhatsApp directamente después de guardar la quiniela.
window.location.assign(url);
}catch(e){alert('No se registró la quiniela: '+e.message)}finally{button.disabled=false;button.textContent='REGISTRAR QUINIELA Y ENVIAR POR WHATSAPP'}};
let bets=[];
async function loadBets(){try{bets=await request('/api/admin/bets');paintBets()}catch(e){document.getElementById('betTable').textContent=e.message}}
function paintBets(){const container=document.getElementById('betTable');if(!container)return;const search=(document.getElementById('betSearch')?.value||'').toLowerCase(),status=document.getElementById('betStatus')?.value||'';const filtered=bets.filter(b=>(!status||b.status===status)&&(!search||(b.folio+' '+b.name).toLowerCase().includes(search)));document.getElementById('betSummary').textContent=`${filtered.length} registros · ${filtered.reduce((n,b)=>n+b.count,0)} combinaciones · $${filtered.reduce((n,b)=>n+b.amount,0).toLocaleString('es-MX')} MXN (importe registrado, no necesariamente cobrado)`;container.replaceChildren();for(const b of filtered){const card=document.createElement('div');card.className='admin-row';const title=document.createElement('b');title.textContent=`${b.folio} · ${b.name}`;const meta=document.createElement('div');meta.className='hint';meta.textContent=`${b.round} · ${b.count} combinaciones · $${b.amount} MXN · ${b.created_at} UTC`;const select=document.createElement('select');select.style.cssText='margin:7px 0;width:100%;padding:8px';for(const s of ['pendiente','recibida','pagada','validada']){const opt=document.createElement('option');opt.value=s;opt.textContent=s;opt.selected=s===b.status;select.append(opt)}select.onchange=()=>changeStatus(b.folio,select.value);const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ver combinaciones';const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px';pre.textContent=b.combinations.map((r,i)=>`${String(i+1).padStart(3,'0')}. ${r.split('').join(' ')}`).join('\n');details.append(summary,pre);card.append(title,meta,select,details);container.append(card)}}
async function changeStatus(folio,status){try{await request('/api/admin/bets/'+encodeURIComponent(folio),{method:'PATCH',body:JSON.stringify({status})});const b=bets.find(x=>x.folio===folio);if(b)b.status=status;paintBets()}catch(e){alert(e.message);loadBets()}}
function exportBets(){const header=['Folio','Participante','Jornada','Estado','Combinaciones','Importe MXN','Fecha UTC','Secuencias'];const quote=x=>'"'+String(x).replace(/"/g,'""')+'"';const csv=[header,...bets.map(b=>[b.folio,b.name,b.round,b.status,b.count,b.amount,b.created_at,b.combinations.join(' | ')])].map(r=>r.map(quote).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='quinielas-registro.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
// Mostrar el estado de la apuesta y abrir WhatsApp mediante un gesto explícito.
const mainButton=document.querySelector('#user button.primary');mainButton.textContent='REGISTRAR QUINIELA Y ENVIAR POR WHATSAPP';mainButton.insertAdjacentHTML('afterend','<p id="sendStatus" class="hint" role="status"></p><a id="whatsappLink" class="hidden" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#00a86b;color:white;padding:12px;border-radius:9px;font-weight:800;text-decoration:none">ABRIR WHATSAPP</a>');
document.head.insertAdjacentHTML('beforeend','<style>#whatsappLink.hidden{display:none!important}button:disabled{opacity:.55;cursor:not-allowed}</style>');
syncConfig();

// Cierre de jornada: se configura en el servidor y no depende del reloj del cliente.
function renderClosingControls(){
  const panel=document.getElementById('adminContent');
  if(!panel||document.getElementById('aCloseAt'))return;
  const box=document.createElement('div');box.className='admin-row';
  box.innerHTML=`<h3>Cierre automático de jornada</h3><label>Fecha y hora con zona horaria (ISO 8601)</label><input id="aCloseAt" placeholder="2026-10-25T16:00:00-06:00" value="${safe(cfg.closeAt||'')}"><p class="hint">Ejemplo México centro: 2026-10-25T16:00:00-06:00. Dejar vacío significa sin cierre automático.</p><label><input id="aClosed" type="checkbox" ${cfg.closed?'checked':''} style="width:auto"> Cerrar jornada manualmente ahora</label><p class="hint">Al vencer el plazo o cerrar manualmente, se rechazan nuevas participaciones. Los registros existentes permanecen.</p>`;
  panel.insertBefore(box,panel.firstChild);
}
const previousAdminRenderClosing=adminRender;
adminRender=function(){previousAdminRenderClosing();if(unlocked)renderClosingControls()};
const previousSaveAdminClosing=saveAdmin;
saveAdmin=async function(){
  const closeAt=document.getElementById('aCloseAt')?.value.trim()||'';
  if(closeAt&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(closeAt))return alert('Usa fecha con zona horaria: 2026-10-25T16:00:00-06:00');
  if(closeAt&&!Number.isFinite(Date.parse(closeAt)))return alert('Fecha de cierre inválida');
  cfg.closeAt=closeAt;cfg.closed=!!document.getElementById('aClosed')?.checked;
  await previousSaveAdminClosing();
};

function refreshClosingStatus() {
  const el = document.getElementById('sendStatus');
  const button = document.querySelector('#user button.primary');

  if (!el || !button || !centralReady) return;

  const closed = cfg.closed === true ||
    Boolean(cfg.closeAt && Date.now() >= Date.parse(cfg.closeAt));

  if (closed) {
    button.disabled = true;
    el.textContent =
      'JORNADA CERRADA. Ya no se aceptan participaciones.';
    return;
  }

  // Si la jornada está abierta, permitir nuevamente el registro.
  if (button.textContent !== 'REGISTRANDO...') {
    button.disabled = false;
  }

  if (cfg.closeAt) {
    el.textContent = 'Cierre programado: ' +
      new Date(cfg.closeAt).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'medium',
        timeStyle: 'short'
      }) + ' (Ciudad de México).';
  } else if (el.textContent.startsWith('JORNADA CERRADA')) {
    el.textContent = '';
  }
}

const previousSyncConfigClosing=syncConfig;
syncConfig=async function(){await previousSyncConfigClosing();refreshClosingStatus()};
// El servidor es la autoridad definitiva; esta comprobación solo informa al usuario.
setInterval(refreshClosingStatus,15000);
