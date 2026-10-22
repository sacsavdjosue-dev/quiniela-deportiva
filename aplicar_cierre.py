from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
server=root/'server.js'; client=root/'public'/'central.js'
if not server.exists() or not client.exists():
    sys.exit('Ejecuta el script en la carpeta del repositorio (donde está server.js).')
s=server.read_text(encoding='utf-8')
c=client.read_text(encoding='utf-8')
if 'const validCloseAt=' not in s:
    needle='const getConfig=async()=>'
    assert needle in s, 'No se encontró getConfig en server.js'
    s=s.replace(needle,"""// El cierre se evalúa SIEMPRE con la hora del servidor, no la del navegador.
const validCloseAt=v=>v===''||(typeof v==='string'&&/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(v)&&Number.isFinite(Date.parse(v)));
const isClosed=c=>Boolean(c.closed===true||(c.closeAt&&Number.isFinite(Date.parse(c.closeAt))&&Date.now()>=Date.parse(c.closeAt)));
"""+needle)
    old="app.get('/api/config',async(req,res,next)=>{try{res.json(await getConfig())}catch(e){next(e)}});"
    assert old in s, 'No se encontró endpoint GET /api/config'
    s=s.replace(old,"app.get('/api/config',async(req,res,next)=>{try{const c=await getConfig();res.set('Cache-Control','no-store');res.json({...c,isClosed:isClosed(c),serverNow:new Date().toISOString()})}catch(e){next(e)}});")
    old='const c=req.body;if(!c||'
    assert old in s, 'No se encontró validación PUT /api/config'
    s=s.replace(old,"const c=req.body;if(!c||!validCloseAt(c.closeAt??'')||(c.closed!==undefined&&typeof c.closed!=='boolean')||",1)
    old='const c=await getConfig(),{name,selections,round}=req.body||{};'
    assert old in s, 'No se encontró POST /api/bets'
    s=s.replace(old,old+"if(isClosed(c))return res.status(403).json({error:'La jornada está cerrada. Ya no se aceptan quinielas.'});",1)
if 'function renderClosingControls()' not in c:
    c+='''
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
  if(closeAt&&!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(closeAt))return alert('Usa fecha con zona horaria: 2026-10-25T16:00:00-06:00');
  if(closeAt&&!Number.isFinite(Date.parse(closeAt)))return alert('Fecha de cierre inválida');
  cfg.closeAt=closeAt;cfg.closed=!!document.getElementById('aClosed')?.checked;
  await previousSaveAdminClosing();
};
function refreshClosingStatus(){
  const el=document.getElementById('sendStatus');
  const button=document.querySelector('#user button.primary');
  if(!el||!button||!centralReady)return;
  const closed=cfg.closed===true||Boolean(cfg.closeAt&&Date.now()>=Date.parse(cfg.closeAt));
  if(closed){button.disabled=true;el.textContent='JORNADA CERRADA. Ya no se aceptan participaciones.';}
  else if(cfg.closeAt){el.textContent='Cierre programado: '+new Date(cfg.closeAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'})+' (Ciudad de México).';}
}
const previousSyncConfigClosing=syncConfig;
syncConfig=async function(){await previousSyncConfigClosing();refreshClosingStatus()};
// El servidor es la autoridad definitiva; esta comprobación solo informa al usuario.
setInterval(refreshClosingStatus,15000);
'''
server.write_text(s,encoding='utf-8');client.write_text(c,encoding='utf-8')
print('Actualizados server.js y public/central.js. Revisa cambios antes de publicar.')
