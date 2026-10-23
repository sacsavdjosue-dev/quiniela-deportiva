// CONTROL_PAGOS_V1: libro de abonos manuales, separado del estado de la quiniela.
// Todas las rutas quedan protegidas por la sesion administrativa existente.
const AMOUNT_MAX_CENTS=1000000000; // $10,000,000.00 MXN por abono
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paymentMethods=new Set(['transferencia','deposito']);
const centsFromValue=value=>{
  const string=String(value??'').trim();
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(string))return null;
  const [pesos,centavos='']=string.split('.');
  const amount=Number(pesos)*100+Number(centavos.padEnd(2,'0'));
  return Number.isSafeInteger(amount)&&amount>0&&amount<=AMOUNT_MAX_CENTS?amount:null;
};
const parseRound=value=>value===''||value===undefined?null:/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):NaN;
const csvField=value=>{
  let string=String(value??'');
  // Desactiva formulas al abrir el CSV en Excel.
  if(/^[\s\t\r\n]*[=+@-]/.test(string))string="'"+string;
  return '"'+string.replace(/"/g,'""')+'"';
};
const formatMoney=cents=>(Number(cents)/100).toFixed(2);
const safeDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

export async function installPayments(app,pool,requireAdmin){
  // Migracion idempotente. Nunca modifica o borra apuestas antiguas.
  await pool.query(`CREATE TABLE IF NOT EXISTS bet_payments (
    id BIGSERIAL PRIMARY KEY,
    bet_id BIGINT NOT NULL REFERENCES bets(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    method TEXT NOT NULL CHECK (method IN ('transferencia','deposito')),
    reference TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    paid_on DATE NOT NULL,
    state TEXT NOT NULL DEFAULT 'pendiente' CHECK (state IN ('pendiente','validado','anulado')),
    payment_key UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS bet_payments_bet_id_state_idx ON bet_payments(bet_id,state);`);

  const aggregates=`LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(p.amount_cents) FILTER (WHERE p.state='validado'),0)::bigint AS validated_cents,
             COALESCE(SUM(p.amount_cents) FILTER (WHERE p.state='pendiente'),0)::bigint AS reviewing_cents
      FROM bet_payments p WHERE p.bet_id=b.id
    ) pay ON TRUE`;

  app.get('/api/admin/payments/rounds-summary',requireAdmin,async(req,res,next)=>{
    try{
      const roundId=parseRound(req.query.roundId);
      if(Number.isNaN(roundId))return res.status(400).json({error:'Jornada inválida'});
      const result=await pool.query(`WITH accounts AS (
        SELECT b.amount::bigint*100 AS due_cents,
               pay.validated_cents,pay.reviewing_cents
        FROM bets b ${aggregates}
        WHERE ($1::bigint IS NULL OR b.round_id=$1)
      ) SELECT COUNT(*)::int AS registrations,
          COALESCE(SUM(due_cents),0)::bigint AS registered_cents,
          COALESCE(SUM(validated_cents),0)::bigint AS validated_cents,
          COALESCE(SUM(reviewing_cents),0)::bigint AS reviewing_cents,
          COALESCE(SUM(GREATEST(due_cents-validated_cents,0)),0)::bigint AS balance_cents
        FROM accounts`,[roundId]);
      res.set('Cache-Control','no-store');res.json(result.rows[0]);
    }catch(e){next(e)}
  });

  app.get('/api/admin/payments/accounts',requireAdmin,async(req,res,next)=>{
    try{
      const roundId=parseRound(req.query.roundId),q=String(req.query.q||'').trim().slice(0,100);
      const state=String(req.query.state||'');
      if(Number.isNaN(roundId)||!['','sin_abonos','por_validar','parcial','completo'].includes(state))
        return res.status(400).json({error:'Filtro inválido'});
      const result=await pool.query(`SELECT * FROM (
          SELECT b.folio,b.name,b.contact_phone,b.round,b.round_id,b.amount,b.status,b.created_at,
                 pay.validated_cents,pay.reviewing_cents,
                 GREATEST(b.amount::bigint*100-pay.validated_cents,0) AS balance_cents
          FROM bets b ${aggregates}
          WHERE ($1::bigint IS NULL OR b.round_id=$1)
            AND ($2::text='' OR b.folio ILIKE ('%'||$2||'%') OR b.name ILIKE ('%'||$2||'%')
                 OR COALESCE(b.contact_phone,'') LIKE ('%'||$2||'%'))
        ) a WHERE ($3::text=''
          OR ($3='sin_abonos' AND a.validated_cents=0 AND a.reviewing_cents=0)
          OR ($3='por_validar' AND a.reviewing_cents>0)
          OR ($3='parcial' AND a.validated_cents>0 AND a.balance_cents>0)
          OR ($3='completo' AND a.balance_cents=0))
        ORDER BY a.created_at DESC,a.folio DESC LIMIT 100`,[roundId,q,state]);
      res.set('Cache-Control','no-store');res.json({rows:result.rows,limit:100});
    }catch(e){next(e)}
  });

  app.get('/api/admin/payments/by-folio/:folio',requireAdmin,async(req,res,next)=>{
    try{
      const folio=String(req.params.folio||'');
      if(folio.length>80)return res.status(400).json({error:'Folio inválido'});
      const result=await pool.query(`SELECT p.id,p.amount_cents,p.method,p.reference,p.note,p.paid_on::text AS paid_on,
          p.state,p.created_at,p.validated_at,p.voided_at,p.void_reason
        FROM bet_payments p JOIN bets b ON b.id=p.bet_id
        WHERE b.folio=$1 ORDER BY p.id DESC LIMIT 250`,[folio]);
      res.set('Cache-Control','no-store');res.json(result.rows);
    }catch(e){next(e)}
  });

  app.post('/api/admin/payments',requireAdmin,async(req,res,next)=>{
    const {folio,amount,method,reference='',note='',paidOn,paymentKey}=req.body||{};
    const cents=centsFromValue(amount);
    if(typeof folio!=='string'||!folio||folio.length>80||cents===null||
       !paymentMethods.has(method)||typeof reference!=='string'||reference.length>80||
       typeof note!=='string'||note.length>300||!safeDate(paidOn)||
       typeof paymentKey!=='string'||!UUID.test(paymentKey))
      return res.status(400).json({error:'Revisa importe, fecha, método y referencia del abono.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Bloquear la quiniela serializa altas, validaciones y anulaciones concurrentes.
      const bet=await client.query('SELECT id,amount FROM bets WHERE folio=$1 FOR UPDATE',[folio]);
      if(!bet.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Folio no encontrado'})}
      const existing=await client.query('SELECT *,paid_on::text AS paid_on_text FROM bet_payments WHERE payment_key=$1',[paymentKey]);
      if(existing.rowCount){
        const prior=existing.rows[0];
        const identical=String(prior.bet_id)===String(bet.rows[0].id)&&
          Number(prior.amount_cents)===cents&&prior.method===method&&
          prior.reference===reference.trim()&&prior.note===note.trim()&&
          prior.paid_on_text===paidOn;
        await client.query('COMMIT');
        if(!identical)return res.status(409).json({error:'Identificador de abono reutilizado con datos distintos.'});
        return res.json({ok:true,id:prior.id,replayed:true});
      }
      const sums=await client.query(`SELECT COALESCE(SUM(amount_cents),0)::bigint AS reserved
        FROM bet_payments WHERE bet_id=$1 AND state IN ('pendiente','validado')`,[bet.rows[0].id]);
      if(Number(sums.rows[0].reserved)+cents>Number(bet.rows[0].amount)*100){
        await client.query('ROLLBACK');
        return res.status(409).json({error:'El abono excede el saldo disponible, incluyendo pagos pendientes de validar.'});
      }
      const ins=await client.query(`INSERT INTO bet_payments
        (bet_id,amount_cents,method,reference,note,paid_on,payment_key)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [bet.rows[0].id,cents,method,reference.trim(),note.trim(),paidOn,paymentKey]);
      await client.query('COMMIT');res.status(201).json({ok:true,id:ins.rows[0].id,replayed:false});
    }catch(e){await client.query('ROLLBACK');next(e)}finally{client.release()}
  });

  app.patch('/api/admin/payments/:id',requireAdmin,async(req,res,next)=>{
    const id=Number(req.params.id);
    const action=String(req.body?.action||'');
    const reason=String(req.body?.reason||'').trim();
    if(!Number.isSafeInteger(id)||id<1||!['validate','void'].includes(action)||
        (action==='void'&&(!reason||reason.length>250)))
      return res.status(400).json({error:'Acción o motivo de anulación inválido'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const locator=await client.query('SELECT bet_id FROM bet_payments WHERE id=$1',[id]);
      if(!locator.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Abono no encontrado'})}
      await client.query('SELECT id FROM bets WHERE id=$1 FOR UPDATE',[locator.rows[0].bet_id]);
      const current=await client.query('SELECT state FROM bet_payments WHERE id=$1 FOR UPDATE',[id]);
      const state=current.rows[0]?.state;
      if((action==='validate'&&state==='validado')||(action==='void'&&state==='anulado')){
        await client.query('COMMIT');return res.json({ok:true,replayed:true});
      }
      if(state==='anulado'||(action==='validate'&&state!=='pendiente')){
        await client.query('ROLLBACK');return res.status(409).json({error:'El estado del abono ya no permite esta acción.'});
      }
      if(action==='validate')await client.query(`UPDATE bet_payments
         SET state='validado',validated_at=now() WHERE id=$1`,[id]);
      else await client.query(`UPDATE bet_payments SET state='anulado',voided_at=now(),void_reason=$2
         WHERE id=$1`,[id,reason]);
      await client.query('COMMIT');res.json({ok:true,replayed:false});
    }catch(e){await client.query('ROLLBACK');next(e)}finally{client.release()}
  });

  app.get('/api/admin/payments/export.csv',requireAdmin,async(req,res,next)=>{
    try{
      const roundId=parseRound(req.query.roundId);
      if(Number.isNaN(roundId))return res.status(400).json({error:'Jornada inválida'});
      const q=await pool.query(`SELECT b.round,b.folio,b.name,b.contact_phone,b.amount AS bet_amount,
          p.amount_cents,p.method,p.reference,p.note,p.paid_on::text AS paid_on,p.state,
          p.created_at,p.validated_at,p.voided_at,p.void_reason
          FROM bet_payments p JOIN bets b ON b.id=p.bet_id
          WHERE ($1::bigint IS NULL OR b.round_id=$1) ORDER BY p.id DESC`,[roundId]);
      const header=['Jornada','Folio','Participante','Teléfono','Importe quiniela MXN','Abono MXN',
        'Método','Referencia','Nota','Fecha de pago','Estado','Fecha de registro UTC',
        'Validado UTC','Anulado UTC','Motivo de anulación'];
      const lines=[header,...q.rows.map(p=>[p.round,p.folio,p.name,p.contact_phone,p.bet_amount,
        formatMoney(p.amount_cents),p.method,p.reference,p.note,p.paid_on,p.state,
        p.created_at,p.validated_at,p.voided_at,p.void_reason])];
      res.set('Content-Type','text/csv; charset=utf-8');
      res.set('Content-Disposition','attachment; filename="quiniela-abonos.csv"');
      res.set('Cache-Control','no-store');
      res.send('\ufeff'+lines.map(line=>line.map(csvField).join(',')).join('\r\n'));
    }catch(e){next(e)}
  });
}
