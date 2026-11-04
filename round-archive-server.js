// RESPALDO_Y_DEPURACION_JORNADAS_V1
// Respaldo CSV completo y borrado transaccional exclusivo del administrador.
// Sin ON DELETE CASCADE: cualquier referencia inesperada provoca rollback.
import crypto from 'node:crypto';
import {invalidateLiveRoundCache} from './participant-live-server.js';

const validId = value => /^[1-9]\d*$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const csv = val => {
  let value = String(val ?? '');
  if (/^[\s\t\r\n]*[=+@-]/.test(value)) value = "'" + value; // Anti formula CSV/Excel
  return '"' + value.replace(/"/g, '""') + '"';
};
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
const serial = snapshot => JSON.stringify(canonical(snapshot));
const digest = snapshot => crypto.createHash('sha256').update(serial(snapshot)).digest('hex');
const safeEq = (a,b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && crypto.timingSafeEqual(x,y);
};
const counts = snap => ({quinielas:snap.bets.length,abonos:snap.payments.length,
  registros_resultados:snap.results.length,historial_resultados:snap.audit.length});

async function snapshot(db,id) {
  const r=await db.query('SELECT to_jsonb(r) AS data FROM rounds r WHERE id=$1',[id]);
  if(!r.rowCount) return null;
  const bets=await db.query('SELECT to_jsonb(b) AS data FROM bets b WHERE b.round_id=$1 ORDER BY b.id',[id]);
  const payments=await db.query(`SELECT to_jsonb(p) AS data FROM bet_payments p
    JOIN bets b ON b.id=p.bet_id WHERE b.round_id=$1 ORDER BY p.id`,[id]);
  const results=await db.query('SELECT to_jsonb(x) AS data FROM round_results x WHERE x.round_id=$1',[id]);
  const audit=await db.query('SELECT to_jsonb(a) AS data FROM round_result_audit a WHERE a.round_id=$1 ORDER BY a.id',[id]);
  return {format:'quiniela-round-archive-v1',round:r.rows[0].data,
    bets:bets.rows.map(x=>x.data),payments:payments.rows.map(x=>x.data),
    results:results.rows.map(x=>x.data),audit:audit.rows.map(x=>x.data)};
}
function makeCsv(snap,hash) {
  // Un CSV tabular y autocontenido: una fila por elemento y todos los campos
  // originales en datos_completos_json, además de columnas legibles en Excel.
  const header=['tipo_registro','jornada_id','jornada','id_registro','folio','participante','telefono',
    'importe_quiniela_MXN','estado_quiniela','numero_combinaciones','secciones_pronosticos_json',
    'combinaciones_json','abono_MXN','estado_abono','metodo_abono','referencia_abono',
    'fecha_registro','version_resultados','resultados_json','datos_completos_json'];
  const rows=[];
  const id=snap.round.id,name=snap.round.name;
  const betsById=new Map(snap.bets.map(b=>[String(b.id),b]));
  const add=(kind,record)=>{
    const bet=kind==='QUINIELA'?record:kind==='ABONO'?betsById.get(String(record.bet_id)):null;
    const fields=[kind,id,name,record.id??record.round_id??'',bet?.folio??'',bet?.name??'',
      bet?.contact_phone??'',bet?.amount??'',bet?.status??'',bet?.count??'',
      bet?JSON.stringify(bet.selections??null):'',bet?JSON.stringify(bet.combinations??null):'',
      kind==='ABONO'?(Number(record.amount_cents)/100).toFixed(2):'',
      kind==='ABONO'?record.state??'':'',kind==='ABONO'?record.method??'':'',
      kind==='ABONO'?record.reference??'':'',record.created_at??record.changed_at??record.updated_at??'',
      kind==='RESULTADOS'?record.version:kind==='HISTORIAL'?record.version:'',
      kind==='RESULTADOS'?JSON.stringify(record.outcomes??null):'',JSON.stringify(record)];
    rows.push(fields.map(csv).join(','));
  };
  // Metadatos verificables del respaldo: fecha y SHA-256 aparecen en el CSV.
  const meta={format:snap.format,generated_at:new Date().toISOString(),fingerprint_sha256:hash,
    counts:counts(snap),note:'Respaldo confidencial; incluye datos personales y financieros.'};
  const metaFields=['RESPALDO',id,name,'','','','','','','','','','','','','','', '', '',JSON.stringify(meta)];
  rows.push(metaFields.map(csv).join(','));
  add('JORNADA',snap.round);
  snap.bets.forEach(x=>add('QUINIELA',x));
  snap.payments.forEach(x=>add('ABONO',x));
  snap.results.forEach(x=>add('RESULTADOS',x));
  snap.audit.forEach(x=>add('HISTORIAL',x));
  return '\ufeff'+[header.map(csv).join(','),...rows].join('\r\n')+'\r\n';
}
const tokenFor=(id,fp,issued,secret)=>{
  const payload=Buffer.from(JSON.stringify({id,fp,issued})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('hex');
  return payload+'.'+sig;
};
function readToken(raw,secret){
  if(typeof raw!=='string'||raw.length>1500||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(raw))return null;
  const [payload,sig]=raw.split('.');
  const actual=crypto.createHmac('sha256',secret).update(payload).digest('hex');
  if(!safeEq(sig,actual))return null;
  try{
    const x=JSON.parse(Buffer.from(payload,'base64url').toString());
    if(!validId(x.id)||!/^[a-f0-9]{64}$/.test(x.fp)||!Number.isSafeInteger(x.issued)||
      x.issued>Date.now()+60000||Date.now()-x.issued>30*60*1000)return null;
    return x;
  }catch{return null}
}

export async function installRoundArchive(app,pool,requireAdmin,secret,adminPassword){
  await pool.query(`CREATE TABLE IF NOT EXISTS round_deletion_log (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT NOT NULL,
    round_name TEXT NOT NULL,
    archive_sha256 TEXT NOT NULL,
    deleted_counts JSONB NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  app.get('/api/admin/archive/rounds',requireAdmin,async(req,res,next)=>{
    try{
      const q=await pool.query(`SELECT r.id,r.name,r.is_active,r.created_at,
        (SELECT count(*)::int FROM bets b WHERE b.round_id=r.id) AS bet_count,
        (SELECT count(*)::int FROM bet_payments p JOIN bets b ON p.bet_id=b.id WHERE b.round_id=r.id) AS payment_count,
        (SELECT count(*)::int FROM round_result_audit a WHERE a.round_id=r.id) AS audit_count,
        EXISTS(SELECT 1 FROM round_results x WHERE x.round_id=r.id) AS has_results
        FROM rounds r ORDER BY r.is_active DESC,r.id DESC LIMIT 500`);
      res.set('Cache-Control','no-store');res.json(q.rows);
    }catch(e){next(e)}
  });

  app.get('/api/admin/archive/:id/export.csv',requireAdmin,async(req,res,next)=>{
    const id=validId(req.params.id);
    if(!id)return res.status(400).json({error:'Jornada inválida.'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const snap=await snapshot(db,id);
      await db.query('COMMIT');
      if(!snap)return res.status(404).json({error:'Jornada no encontrada.'});
      const hash=digest(snap), token=tokenFor(id,hash,Date.now(),secret);
      const safeName=String(snap.round.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,48)||'jornada';
      res.set('Content-Type','text/csv; charset=utf-8');
      res.set('Content-Disposition',`attachment; filename="respaldo-jornada-${id}-${safeName}.csv"`);
      res.set('X-Backup-Token',token);
      res.set('Cache-Control','no-store');
      res.send(makeCsv(snap,hash));
    }catch(e){try{await db.query('ROLLBACK')}catch{}next(e)}
    finally{db.release()}
  });

  app.delete('/api/admin/archive/:id',requireAdmin,async(req,res,next)=>{
    const id=validId(req.params.id), b=req.body||{};
    const token=readToken(b.backupToken,secret);
    if(!id||!token||Number(token.id)!==id||b.confirmedSaved!==true||
      typeof b.typedName!=='string'||b.typedName.length>120||
      !safeEq(b.adminPassword,adminPassword))
      return res.status(400).json({error:'Debes exportar el CSV, confirmar que lo guardaste, escribir el nombre exacto y validar tu contraseña administrativa.'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(6729381)');
      const round=await db.query('SELECT id,name,is_active FROM rounds WHERE id=$1 FOR UPDATE',[id]);
      if(!round.rowCount){await db.query('ROLLBACK');return res.status(404).json({error:'La jornada ya no existe.'})}
      if(round.rows[0].is_active){await db.query('ROLLBACK');return res.status(409).json({error:'No se puede eliminar la jornada activa. Activa otra jornada primero.'})}
      if(b.typedName!==round.rows[0].name){await db.query('ROLLBACK');return res.status(400).json({error:'El nombre de confirmación no coincide con la jornada.'})}
      // Impedir que se modifiquen quinielas/pagos/resultados durante la comprobación.
      await db.query('SELECT id FROM bets WHERE round_id=$1 ORDER BY id FOR UPDATE',[id]);
      await db.query(`SELECT p.id FROM bet_payments p JOIN bets b ON b.id=p.bet_id
        WHERE b.round_id=$1 ORDER BY p.id FOR UPDATE OF p`,[id]);
      await db.query('SELECT round_id FROM round_results WHERE round_id=$1 FOR UPDATE',[id]);
      await db.query('SELECT id FROM round_result_audit WHERE round_id=$1 ORDER BY id FOR UPDATE',[id]);
      const snap=await snapshot(db,id);
      if(digest(snap)!==token.fp){await db.query('ROLLBACK');return res.status(409).json({error:'La jornada cambió desde la exportación. Descarga un CSV nuevo antes de eliminar.'})}
      const c=counts(snap);
      await db.query(`DELETE FROM bet_payments WHERE bet_id IN
        (SELECT id FROM bets WHERE round_id=$1)`,[id]);
      await db.query('DELETE FROM round_result_audit WHERE round_id=$1',[id]);
      await db.query('DELETE FROM round_results WHERE round_id=$1',[id]);
      await db.query('DELETE FROM bets WHERE round_id=$1',[id]);
      const deleted=await db.query('DELETE FROM rounds WHERE id=$1 AND is_active=false RETURNING id',[id]);
      if(deleted.rowCount!==1)throw new Error('No se confirmó la eliminación de la jornada.');
      await db.query(`INSERT INTO round_deletion_log(round_id,round_name,archive_sha256,deleted_counts)
        VALUES($1,$2,$3,$4)`,[id,round.rows[0].name,token.fp,JSON.stringify(c)]);
      await db.query('COMMIT');
      invalidateLiveRoundCache(id);
      res.set('Cache-Control','no-store');
      res.json({ok:true,deletedRound:id,counts:c});
    }catch(e){
      try{await db.query('ROLLBACK')}catch{}
      if(e.code==='23503')return res.status(409).json({error:'Existen referencias adicionales a esta jornada. No se borró nada; revisa las dependencias antes de continuar.'});
      next(e);
    }finally{db.release()}
  });
}
