import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
const port=Number(process.env.PORT||3000);
const password=process.env.ADMIN_PASSWORD,secret=process.env.SESSION_SECRET;
if(!password||password.length<12||!secret||secret.length<32||!process.env.DATABASE_URL){console.error('Configure ADMIN_PASSWORD (12+), SESSION_SECRET (32+) y DATABASE_URL.');process.exit(1)}
const dbUrl = new URL(process.env.DATABASE_URL);

console.log('DIAGNÓSTICO POSTGRESQL:', {
  usuario: dbUrl.username,
  puerto: dbUrl.port,
  sessionPooler: dbUrl.hostname.endsWith('.pooler.supabase.com'),
  passwordConfigurada: dbUrl.password.length > 0
});
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: fs.readFileSync(
      '/etc/secrets/supabase-ca.crt',
      'utf8'
    ),
    rejectUnauthorized: true
  },
  max: 5
});
const teams=[['Necaxa','Juárez'],['Atlante','San Luis'],['León','Toluca'],['Monterrey','Chivas'],['Pumas','Tigres'],['Atlas','Puebla'],['América','Pachuca'],['Querétaro','Cruz Azul'],['Tijuana','Santos'],['Barcelona','Real Madrid'],['Sevilla','Osasuna']].map(t=>({home:t[0],away:t[1],homeLogo:'',awayLogo:''}));
await pool.query(`CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), json JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS bets (id BIGSERIAL PRIMARY KEY, folio TEXT NOT NULL UNIQUE, name TEXT NOT NULL, round TEXT NOT NULL, selections JSONB NOT NULL, combinations JSONB NOT NULL, count INTEGER NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','recibida','pagada','validada')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS bets_status_created ON bets(status,created_at);`);
await pool.query('INSERT INTO config(id,json) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[JSON.stringify({title:'QUINIELA DEPORTIVA',round:'Jornada 1',deadline:'Cierre por definir',phone:'',cost:20,matchCount:11,teams})]);

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

app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'3mb'}));app.use('/api',rateLimit({windowMs:60000,limit:90,standardHeaders:'draft-7',legacyHeaders:false}));
const sign=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(p=>p.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2))}
function admin(req){const token=cookies(req).qsid||'';const [expiry,signature]=token.split('.');return /^\d+$/.test(expiry||'')&&Number(expiry)>Date.now()&&typeof signature==='string'&&equal(signature,sign(expiry))}
function requireAdmin(req,res,next){if(!admin(req))return res.status(401).json({error:'Acceso no autorizado'});next()}
const loginLimiter=rateLimit({windowMs:15*60000,limit:8,standardHeaders:'draft-7',legacyHeaders:false});
app.post('/api/admin/login',loginLimiter,(req,res)=>{if(!equal(req.body?.password,password))return res.status(401).json({error:'Contraseña incorrecta'});const exp=String(Date.now()+8*3600000);res.cookie('qsid',`${exp}.${sign(exp)}`,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600000,path:'/'});res.json({ok:true})});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{res.clearCookie('qsid',{path:'/'});res.json({ok:true})});
app.get('/api/admin/session',(req,res)=>res.json({authenticated:!!admin(req)}));
// El cierre se evalúa SIEMPRE con la hora del servidor, no la del navegador.
const validCloseAt=v=>v===''||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v)));
const isClosed=c=>Boolean(c.closed===true||(c.closeAt&&Number.isFinite(Date.parse(c.closeAt))&&Date.now()>=Date.parse(c.closeAt)));
const getConfig=async()=> (await pool.query('SELECT json FROM config WHERE id=1')).rows[0].json;
app.get('/api/config',async(req,res,next)=>{try{const c=await getConfig();res.set('Cache-Control','no-store');res.json({...c,isClosed:isClosed(c),serverNow:new Date().toISOString()})}catch(e){next(e)}});
app.put('/api/config',requireAdmin,async(req,res,next)=>{try{const c=req.body;if(!c||!validCloseAt(c.closeAt??'')||(c.closed!==undefined&&typeof c.closed!=='boolean')||![10,11].includes(c.matchCount)||!Array.isArray(c.teams)||c.teams.length!==c.matchCount||!Number.isInteger(Number(c.cost))||Number(c.cost)<1||Number(c.cost)>10000||typeof c.phone!=='string'||!/^[\d+\s()-]{0,25}$/.test(c.phone)||!['title','round','deadline'].every(k=>typeof c[k]==='string'&&c[k].length<=120)||!c.teams.every(t=>['home','away'].every(k=>typeof t[k]==='string'&&t[k].trim().length>0&&t[k].length<=80)&&['homeLogo','awayLogo'].every(k=>typeof t[k]==='string'&&(t[k]===''||/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t[k]))&&t[k].length<160000)))return res.status(400).json({error:'Configuración inválida'});const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(6729381)');await client.query('UPDATE config SET json=$1 WHERE id=1',[JSON.stringify(c)]);await client.query('UPDATE rounds SET name=$1,config=$2 WHERE is_active=true',[c.round,JSON.stringify(c)]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}res.json({ok:true})}catch(e){next(e)}});
function expand(selections){let rows=[''];for(const group of selections){const next=[];for(const prefix of rows)for(const pick of ['L','E','V'])if(group.includes(pick))next.push(prefix+pick);rows=next;if(rows.length>5000)throw Error('Se excede el límite de 5,000 combinaciones')}return rows}
app.post('/api/bets',async(req,res,next)=>{try{const c=await getConfig(),{name,selections,round}=req.body||{};if(isClosed(c))return res.status(403).json({error:'La jornada está cerrada. Ya no se aceptan quinielas.'});if(typeof name!=='string'||!name.trim()||name.trim().length>80||round!==c.round||!Array.isArray(selections)||selections.length!==c.matchCount||!selections.every(p=>Array.isArray(p)&&p.length>=1&&p.length<=3&&new Set(p).size===p.length&&p.every(x=>['L','E','V'].includes(x))))return res.status(400).json({error:'Datos inválidos o jornada modificada; actualiza la página'});const rows=expand(selections),amount=rows.length*c.cost,activeRound=(await pool.query('SELECT id FROM rounds WHERE is_active=true')).rows[0];if(!activeRound)return res.status(503).json({error:'No hay jornada activa'});const folio='Q'+Date.now().toString(36).toUpperCase()+crypto.randomBytes(4).toString('hex').toUpperCase();await pool.query('INSERT INTO bets(folio,name,round,selections,combinations,count,amount,round_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[folio,name.trim(),c.round,JSON.stringify(selections),JSON.stringify(rows),rows.length,amount,activeRound.id]);res.status(201).json({folio,rows,amount,count:rows.length,status:'pendiente',phone:c.phone,title:c.title,round:c.round,cost:c.cost})}catch(e){if(e.message?.includes('5,000'))return res.status(400).json({error:e.message});next(e)}});
// Administracion de jornadas: solo accesible a administrador autenticado.
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
app.get('/api/admin/bets',requireAdmin,async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM bets ORDER BY id DESC LIMIT 2000');res.json(r.rows)}catch(e){next(e)}});
app.patch('/api/admin/bets/:folio',requireAdmin,async(req,res,next)=>{try{const {status}=req.body||{};if(!['pendiente','recibida','pagada','validada'].includes(status))return res.status(400).json({error:'Estado inválido'});const result=await pool.query('UPDATE bets SET status=$1, updated_at=now() WHERE folio=$2',[status,req.params.folio]);if(!result.rowCount)return res.status(404).json({error:'Folio no encontrado'});res.json({ok:true})}catch(e){next(e)}});
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.use(express.static(path.join(process.cwd(),'public')));app.get('*',(req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Error interno del servidor'})});
app.listen(port,()=>console.log(`Quiniela central en puerto ${port}`));
