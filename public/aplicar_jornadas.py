from pathlib import Path
import shutil
root=Path(__file__).resolve().parent
server=root/'server.js'
client=root/'public'/'central.js'
if not server.exists() or not client.exists():
    raise SystemExit('Coloca este script en la carpeta raiz del repositorio (junto a server.js y public/).')
s=server.read_text(encoding='utf-8'); c=client.read_text(encoding='utf-8')
if 'JORNADAS_V1' in s or 'JORNADAS_V1' in c:
    raise SystemExit('La actualizacion de jornadas ya parece estar instalada. No se aplico dos veces.')
def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise SystemExit(f'No se pudo encontrar el bloque {label} de manera unica (coincidencias: {count}). No se modificaron archivos.')
    return text.replace(old,new,1)

migration='''
// JORNADAS_V1: migracion conservadora; nunca borra registros existentes.
await pool.query(`CREATE TABLE IF NOT EXISTS rounds (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS round_id BIGINT REFERENCES rounds(id);
CREATE INDEX IF NOT EXISTS bets_round_id_idx ON bets(round_id);
CREATE UNIQUE INDEX IF NOT EXISTS only_one_active_round ON rounds(is_active) WHERE is_active = TRUE;`);
// Inicializar con la configuracion actual; asociar apuestas antiguas sin alterar sus datos.
const seedClient=await pool.connect();
try {
  await seedClient.query('BEGIN');
  await seedClient.query('SELECT pg_advisory_xact_lock(6729381)');
  const existing=await seedClient.query('SELECT id FROM rounds ORDER BY id LIMIT 1');
  if(!existing.rowCount){
    const initial=(await seedClient.query('SELECT json FROM config WHERE id=1')).rows[0].json;
    const inserted=await seedClient.query('INSERT INTO rounds(name,config,is_active) VALUES($1,$2,true) RETURNING id',[initial.round,JSON.stringify(initial)]);
    await seedClient.query('UPDATE bets SET round_id=$1 WHERE round_id IS NULL',[inserted.rows[0].id]);
  }
  await seedClient.query('COMMIT');
} catch(e){await seedClient.query('ROLLBACK');throw e} finally{seedClient.release()}
'''
s=replace_once(s,"app.use(helmet({contentSecurityPolicy:false}))",migration+"\napp.use(helmet({contentSecurityPolicy:false}))",'migracion')
s=replace_once(s,"await pool.query('UPDATE config SET json=$1 WHERE id=1',[JSON.stringify(c)]);res.json({ok:true})", """const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(6729381)');await client.query('UPDATE config SET json=$1 WHERE id=1',[JSON.stringify(c)]);await client.query('UPDATE rounds SET name=$1,config=$2 WHERE is_active=true',[c.round,JSON.stringify(c)]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}res.json({ok:true})""",'guardado config')
s=replace_once(s,"const rows=expand(selections),amount=rows.length*c.cost,folio=", "const rows=expand(selections),amount=rows.length*c.cost,activeRound=(await pool.query('SELECT id FROM rounds WHERE is_active=true')).rows[0];if(!activeRound)return res.status(503).json({error:'No hay jornada activa'});const folio=",'id jornada apuesta')
s=replace_once(s,"'INSERT INTO bets(folio,name,round,selections,combinations,count,amount) VALUES($1,$2,$3,$4,$5,$6,$7)',[folio,name.trim(),c.round,JSON.stringify(selections),JSON.stringify(rows),rows.length,amount]", "'INSERT INTO bets(folio,name,round,selections,combinations,count,amount,round_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[folio,name.trim(),c.round,JSON.stringify(selections),JSON.stringify(rows),rows.length,amount,activeRound.id]",'insert apuesta')
marker="app.get('/api/admin/bets',requireAdmin,"
routes='''// Administracion de jornadas: solo accesible a administrador autenticado.
app.get('/api/admin/rounds',requireAdmin,async(req,res,next)=>{try{
 const r=await pool.query(`SELECT r.id,r.name,r.is_active,r.created_at,
 (SELECT count(*)::int FROM bets b WHERE b.round_id=r.id) AS bets_count,
 (SELECT coalesce(sum(amount),0)::bigint FROM bets b WHERE b.round_id=r.id) AS amount_total
 FROM rounds r ORDER BY r.id DESC`);res.json(r.rows)
}catch(e){next(e)}});
app.post('/api/admin/rounds',requireAdmin,async(req,res,next)=>{try{
 const name=String(req.body?.name||'').trim();if(!name||name.length>120)return res.status(400).json({error:'Nombre de jornada invalido'});
 const active=await getConfig();const next={...active,round:name,closeAt:'',closed:true,deadline:'Cierre por definir'};
 const r=await pool.query('INSERT INTO rounds(name,config,is_active) VALUES($1,$2,false) RETURNING id,name,is_active',[name,JSON.stringify(next)]);
 res.status(201).json(r.rows[0]);
}catch(e){next(e)}});
app.post('/api/admin/rounds/:id/activate',requireAdmin,async(req,res,next)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'ID invalido'});
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(6729381)');
 const r=await client.query('SELECT config FROM rounds WHERE id=$1',[id]);if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Jornada no encontrada'})}
 await client.query('UPDATE rounds SET is_active=false WHERE is_active=true');
 await client.query('UPDATE rounds SET is_active=true WHERE id=$1',[id]);
 await client.query('UPDATE config SET json=$1 WHERE id=1',[JSON.stringify(r.rows[0].config)]);
 await client.query('COMMIT');res.json({ok:true});
 }catch(e){await client.query('ROLLBACK');next(e)}finally{client.release()}
});
'''
s=replace_once(s,marker,routes+marker,'rutas jornadas')
# frontend add panel after original adminRender has been wrapped by closing module
client_add='''
// JORNADAS_V1: selector administrativo de jornadas e historial.
let roundsList=[];
let selectedRoundId='';
const priorAdminRenderRounds=adminRender;
adminRender=function(){priorAdminRenderRounds();if(unlocked){
 const panel=document.getElementById('adminContent');
 const section=document.createElement('section');section.className='admin-row';
 section.innerHTML=`<h3>Administracion de jornadas</h3><p class="hint">Crea una jornada cerrada, activala y despues configura sus partidos y fecha de cierre. Las jornadas anteriores conservan sus quinielas.</p><label>Nombre de la nueva jornada</label><input id="newRoundName" maxlength="120" placeholder="Ejemplo: Jornada 2"><button class="secondary" type="button" onclick="createRound()">CREAR JORNADA</button><div id="roundsTable" style="margin-top:12px"></div><label>Historial del registro central</label><select id="historyRound" onchange="selectedRoundId=this.value;paintBets()" style="width:100%;padding:9px"><option value="">Todas las jornadas</option></select>`;
 panel.insertBefore(section,panel.firstChild);loadRounds();
}};
async function loadRounds(){try{
 roundsList=await request('/api/admin/rounds');
 const list=document.getElementById('roundsTable'),filter=document.getElementById('historyRound');if(!list||!filter)return;
 list.replaceChildren();filter.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Todas las jornadas';filter.append(all);
 for(const round of roundsList){
   const row=document.createElement('div');row.className='admin-row';
   const name=document.createElement('strong');name.textContent=round.name+(round.is_active?' · ACTIVA':'');
   const stats=document.createElement('p');stats.className='hint';stats.textContent=round.bets_count+' registros · $'+Number(round.amount_total).toLocaleString('es-MX')+' MXN registrados';
   row.append(name,stats);
   if(!round.is_active){const button=document.createElement('button');button.className='outline';button.type='button';button.textContent='ACTIVAR JORNADA';button.onclick=()=>activateRound(round.id,round.name);row.append(button)}
   list.append(row);
   const option=document.createElement('option');option.value=String(round.id);option.textContent=round.name+' (#'+round.id+')';filter.append(option);
 }
 filter.value=selectedRoundId; if(filter.value!==selectedRoundId){selectedRoundId='';filter.value=''}
 paintBets();
}catch(e){const el=document.getElementById('roundsTable');if(el)el.textContent='Error cargando jornadas: '+e.message}}
async function createRound(){const name=document.getElementById('newRoundName')?.value.trim();if(!name)return alert('Escribe el nombre de la jornada');
 if(!confirm('Crear la jornada "'+name+'"? Se creara cerrada y no sustituira la jornada activa.'))return;
 try{await request('/api/admin/rounds',{method:'POST',body:JSON.stringify({name})});document.getElementById('newRoundName').value='';await loadRounds();alert('Jornada creada. Actívala cuando estés listo para configurarla.')}catch(e){alert(e.message)}
}
async function activateRound(id,name){if(!confirm('¿Activar "'+name+'"? La jornada actual dejara de estar visible para los participantes. Las participaciones antiguas se conservaran.'))return;
 try{await request('/api/admin/rounds/'+id+'/activate',{method:'POST'});location.reload()}catch(e){alert(e.message)}
}
const priorPaintBetsRounds=paintBets;
paintBets=function(){priorPaintBetsRounds();const table=document.getElementById('betTable');if(!table||!selectedRoundId)return;
 // Filtrar tarjetas sin modificar los registros almacenados.
 const filtered=bets.filter(b=>String(b.round_id)===selectedRoundId &&
 (!document.getElementById('betStatus')?.value||b.status===document.getElementById('betStatus').value)&&
 (!document.getElementById('betSearch')?.value||(b.folio+' '+b.name).toLowerCase().includes(document.getElementById('betSearch').value.toLowerCase())));
 const summary=document.getElementById('betSummary');if(summary)summary.textContent=`${filtered.length} registros · ${filtered.reduce((n,b)=>n+b.count,0)} combinaciones · $${filtered.reduce((n,b)=>n+b.amount,0).toLocaleString('es-MX')} MXN (importe registrado)`;
 const cards=Array.from(table.children);const visible=new Set(filtered.map(b=>b.folio));for(const card of cards){const title=card.querySelector('b');if(title)card.hidden=!Array.from(visible).some(f=>title.textContent.startsWith(f+' · '))}
};
'''
c+='\n'+client_add
for path in (server,client): shutil.copy2(path,path.with_suffix(path.suffix+'.bak'))
server.write_text(s,encoding='utf-8');client.write_text(c,encoding='utf-8')
print('Actualizacion de jornadas aplicada. Respaldos .bak creados. Ejecuta: node --check server.js && node --check public/central.js')
