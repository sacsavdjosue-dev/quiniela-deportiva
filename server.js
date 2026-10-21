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
const getConfig=async()=> (await pool.query('SELECT json FROM config WHERE id=1')).rows[0].json;
app.get('/api/config',async(req,res,next)=>{try{res.json(await getConfig())}catch(e){next(e)}});
app.put('/api/config',requireAdmin,async(req,res,next)=>{try{const c=req.body;if(!c||![10,11].includes(c.matchCount)||!Array.isArray(c.teams)||c.teams.length!==c.matchCount||!Number.isInteger(Number(c.cost))||Number(c.cost)<1||Number(c.cost)>10000||typeof c.phone!=='string'||!/^[\d+\s()-]{0,25}$/.test(c.phone)||!['title','round','deadline'].every(k=>typeof c[k]==='string'&&c[k].length<=120)||!c.teams.every(t=>['home','away'].every(k=>typeof t[k]==='string'&&t[k].trim().length>0&&t[k].length<=80)&&['homeLogo','awayLogo'].every(k=>typeof t[k]==='string'&&(t[k]===''||/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t[k]))&&t[k].length<160000)))return res.status(400).json({error:'Configuración inválida'});await pool.query('UPDATE config SET json=$1 WHERE id=1',[JSON.stringify(c)]);res.json({ok:true})}catch(e){next(e)}});
function expand(selections){let rows=[''];for(const group of selections){const next=[];for(const prefix of rows)for(const pick of ['L','E','V'])if(group.includes(pick))next.push(prefix+pick);rows=next;if(rows.length>5000)throw Error('Se excede el límite de 5,000 combinaciones')}return rows}
app.post('/api/bets',async(req,res,next)=>{try{const c=await getConfig(),{name,selections,round}=req.body||{};if(typeof name!=='string'||!name.trim()||name.trim().length>80||round!==c.round||!Array.isArray(selections)||selections.length!==c.matchCount||!selections.every(p=>Array.isArray(p)&&p.length>=1&&p.length<=3&&new Set(p).size===p.length&&p.every(x=>['L','E','V'].includes(x))))return res.status(400).json({error:'Datos inválidos o jornada modificada; actualiza la página'});const rows=expand(selections),amount=rows.length*c.cost,folio='Q'+Date.now().toString(36).toUpperCase()+crypto.randomBytes(4).toString('hex').toUpperCase();await pool.query('INSERT INTO bets(folio,name,round,selections,combinations,count,amount) VALUES($1,$2,$3,$4,$5,$6,$7)',[folio,name.trim(),c.round,JSON.stringify(selections),JSON.stringify(rows),rows.length,amount]);res.status(201).json({folio,rows,amount,count:rows.length,status:'pendiente',phone:c.phone,title:c.title,round:c.round,cost:c.cost})}catch(e){if(e.message?.includes('5,000'))return res.status(400).json({error:e.message});next(e)}});
app.get('/api/admin/bets',requireAdmin,async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM bets ORDER BY id DESC LIMIT 2000');res.json(r.rows)}catch(e){next(e)}});
app.patch('/api/admin/bets/:folio',requireAdmin,async(req,res,next)=>{try{const {status}=req.body||{};if(!['pendiente','recibida','pagada','validada'].includes(status))return res.status(400).json({error:'Estado inválido'});const result=await pool.query('UPDATE bets SET status=$1, updated_at=now() WHERE folio=$2',[status,req.params.folio]);if(!result.rowCount)return res.status(404).json({error:'Folio no encontrado'});res.json({ok:true})}catch(e){next(e)}});
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.use(express.static(path.join(process.cwd(),'public')));app.get('*',(req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Error interno del servidor'})});
app.listen(port,()=>console.log(`Quiniela central en puerto ${port}`));
