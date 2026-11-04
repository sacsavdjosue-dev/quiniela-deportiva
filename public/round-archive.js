// RESPALDO_Y_DEPURACION_JORNADAS_V1
// Control administrativo: exportación CSV obligatoria y borrado irrevertible.
(() => {
'use strict';
if (!/^\/admin\/configuracion\/?$/.test(location.pathname)) return;
const el=id=>document.getElementById(id);
const text=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node};
let available=[],selected='',backupToken='',downloading=false,deleting=false;
const req=async(url,options={})=>{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json',...(options.headers||{})},...options});
  if(!response.ok){let data;try{data=await response.json()}catch{}throw Error(data?.error||'No se pudo consultar el servidor.');}
  return response;
};
const resetConfirmation=()=>{
  backupToken='';
  if(el('archiveSaved'))el('archiveSaved').checked=false;
  if(el('archiveTypedName'))el('archiveTypedName').value='';
  if(el('archivePassword'))el('archivePassword').value='';
  if(el('archiveBackupStatus'))el('archiveBackupStatus').textContent='Primero descarga el CSV completo de esta jornada.';
  updateButtons();
};
function updateButtons(){
  const r=available.find(x=>String(x.id)===selected);
  if(el('archiveExport'))el('archiveExport').disabled=downloading||deleting||!r;
  if(el('archiveDelete'))el('archiveDelete').disabled=deleting||downloading||!r||r.is_active||!backupToken||
    !el('archiveSaved').checked||el('archiveTypedName').value!==r.name||!el('archivePassword').value;
}
function showRound(){
  const r=available.find(x=>String(x.id)===selected);
  if(!r)return;
  el('archiveDescription').textContent=`${r.name} · ${r.bet_count} quiniela(s) · ${r.payment_count} abono(s) · `+
    `${r.audit_count} movimiento(s) en historial · resultados ${r.has_results?'guardados':'sin capturar'}`+
    (r.is_active?' · JORNADA ACTIVA (no se puede eliminar)':' · Jornada inactiva');
  el('archiveDeleteNote').textContent=r.is_active?
    'No puedes eliminar la jornada activa: primero debes activar otra jornada desde Configuración.':
    'La eliminación borrará la jornada, todas sus quinielas, abonos, resultados e historial. No se puede deshacer.';
  updateButtons();
}
async function loadArchiveRounds(){
  const selector=el('archiveRound');if(!selector)return;
  try{
    const rows=await (await req('/api/admin/archive/rounds')).json();
    if(!el('archiveRound'))return;
    available=rows;
    const previous=selected;
    selector.replaceChildren();
    rows.forEach(r=>selector.append(new Option(r.name+(r.is_active?' · ACTIVA':''),String(r.id))));
    if(!rows.length){selector.append(new Option('No hay jornadas',''));selected='';el('archiveDescription').textContent='No hay jornadas disponibles.';resetConfirmation();return;}
    selected=rows.some(r=>String(r.id)===previous)?previous:String(rows[0].id);
    selector.value=selected;showRound();
  }catch(err){el('archiveDescription').textContent='No se pudieron cargar las jornadas: '+err.message;}
}
async function downloadArchive(){
  const round=available.find(r=>String(r.id)===selected);if(!round||downloading||deleting)return;
  resetConfirmation();downloading=true;updateButtons();
  el('archiveBackupStatus').textContent='Preparando CSV completo y verificable…';
  try{
    const response=await req('/api/admin/archive/'+encodeURIComponent(round.id)+'/export.csv',{headers:{'Accept':'text/csv'}});
    const token=response.headers.get('X-Backup-Token');
    if(!token)throw Error('El servidor no entregó comprobante de respaldo.');
    const blob=await response.blob();
    if(!blob.size)throw Error('El CSV llegó vacío.');
    const filename=(response.headers.get('Content-Disposition')||'').match(/filename="([^"\\]+)"/)?.[1]
      || 'respaldo-jornada-'+round.id+'.csv';
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=href;a.download=filename;a.style.display='none';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),60000);
    if(String(round.id)!==selected){throw Error('Cambiaste de jornada durante la descarga. Exporta la jornada seleccionada nuevamente.');}
    backupToken=token;
    el('archiveBackupStatus').textContent='Descarga solicitada: '+filename+' ('+Math.ceil(blob.size/1024).toLocaleString('es-MX')+' KB). '+
      'Comprueba que el archivo se haya guardado y se pueda abrir antes de autorizar la eliminación. '+
      'Este respaldo vence para eliminar en 30 minutos o si los datos cambian.';
  }catch(err){el('archiveBackupStatus').textContent='Error al descargar el respaldo: '+err.message;}
  finally{downloading=false;updateButtons();}
}
async function deleteArchive(){
  const round=available.find(r=>String(r.id)===selected);
  if(!round||!backupToken||round.is_active||deleting||downloading)return;
  if(!confirm(`¿ELIMINAR DEFINITIVAMENTE ${round.name}?\n\nSe borrarán quinielas, pagos, resultados e historial de esta jornada.\nVerifica que el CSV esté guardado en tu dispositivo.`))return;
  deleting=true;updateButtons();
  el('archiveDeletionStatus').textContent='Verificando respaldo y eliminando la jornada de forma transaccional…';
  try{
    const data=await (await req('/api/admin/archive/'+encodeURIComponent(round.id),{
      method:'DELETE',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({backupToken,confirmedSaved:el('archiveSaved').checked,
        typedName:el('archiveTypedName').value,adminPassword:el('archivePassword').value})})).json();
    resetConfirmation();
    el('archiveDeletionStatus').textContent=`Jornada ${round.name} eliminada. `+
      `${data.counts.quinielas} quinielas, ${data.counts.abonos} abonos, `+
      `${data.counts.registros_resultados} registro(s) de resultados y `+
      `${data.counts.historial_resultados} movimiento(s) de historial borrados. Conserva el CSV respaldado.`;
    available=available.filter(r=>String(r.id)!==selected);
    selected='';
    await loadArchiveRounds();
  }catch(err){el('archiveDeletionStatus').textContent='No se borró la jornada: '+err.message;
    if(/cambi[oó] desde la exportaci[oó]n|venc/i.test(err.message))resetConfirmation();}
  finally{deleting=false;updateButtons();}
}
const prev=adminRender;
adminRender=function(...args){
  const result=prev.apply(this,args);
  if(!unlocked)return result;
  const parent=el('configOnlyPanel')||el('adminContent');
  if(!parent||el('roundArchiveSection'))return result;
  const sec=document.createElement('section');sec.className='admin-row';sec.id='roundArchiveSection';
  sec.innerHTML=`<h2>🗄️ Respaldo y depuración de jornadas</h2>
    <p class="hint">Descarga un único CSV con TODOS los campos de la jornada, las quinielas y sus combinaciones, los abonos, los resultados y el historial. El archivo incluye teléfonos y datos de pago: guárdalo en lugar seguro.</p>
    <label for="archiveRound">Jornada para respaldar o depurar</label><select id="archiveRound"></select>
    <p id="archiveDescription" class="hint">Consultando jornadas…</p>
    <button class="secondary" type="button" id="archiveExport">DESCARGAR RESPALDO CSV COMPLETO</button>
    <p id="archiveBackupStatus" class="hint" role="status">Primero descarga un respaldo completo.</p>
    <div id="archiveDanger">
      <h3>Eliminar jornada (irreversible)</h3>
      <p id="archiveDeleteNote" class="hint warning"></p>
      <label class="archive-check"><input type="checkbox" id="archiveSaved"> Confirmo que descargué, abrí y guardé el archivo CSV fuera de esta aplicación.</label>
      <label for="archiveTypedName">Escribe el nombre exacto de la jornada para confirmar</label>
      <input id="archiveTypedName" type="text" autocomplete="off" placeholder="Nombre exacto de la jornada" maxlength="120">
      <label for="archivePassword">Contraseña administrativa actual</label>
      <input id="archivePassword" type="password" autocomplete="current-password" placeholder="Contraseña de administrador">
      <button id="archiveDelete" class="outline" type="button" disabled>ELIMINAR JORNADA Y TODOS SUS REGISTROS</button>
      <p id="archiveDeletionStatus" class="hint" role="status"></p>
    </div>`;
  parent.append(sec);
  el('archiveRound').onchange=()=>{selected=el('archiveRound').value;resetConfirmation();showRound();};
  el('archiveExport').onclick=downloadArchive;
  el('archiveDelete').onclick=deleteArchive;
  ['archiveSaved','archiveTypedName','archivePassword'].forEach(id=>el(id).addEventListener('input',updateButtons));
  loadArchiveRounds();
  return result;
};
const style=document.createElement('style');style.textContent=`
#roundArchiveSection{border:1px solid #607e89;background:#123044;border-radius:10px;padding:14px;margin:15px 0}
#roundArchiveSection select,#roundArchiveSection input:not([type=checkbox]){width:100%;max-width:100%;margin:6px 0 12px}
#roundArchiveSection button{width:100%;margin:7px 0}
#roundArchiveSection label{display:block;margin-top:9px}
#roundArchiveSection .archive-check{display:flex;gap:8px;align-items:center;font-size:13px;line-height:1.4}
#roundArchiveSection .archive-check input{width:auto}
#archiveDanger{border-top:1px solid #647480;margin-top:16px;padding-top:9px}
#archiveDanger h3{color:#ffce9a;font-size:15px}
#roundArchiveSection #archiveDelete:not([disabled]){border:2px solid #e9a08d;color:#ffe1d9}
#roundArchiveSection #archiveDelete[disabled]{opacity:.45;cursor:not-allowed}
`;document.head.append(style);
if(unlocked&&el('aTitle'))adminRender();
})();
