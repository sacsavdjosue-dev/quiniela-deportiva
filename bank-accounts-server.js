// QUINIFUT_CUENTAS_BANCARIAS_V13
// Catalogo global de cuentas bancarias. Solo las marcadas publicadas se
// entregan al visitante; administracion exige la sesion existente.

const MAX_ACCOUNTS = 5;
const normalizeDigits = value => String(value ?? '').replace(/\s+/g, '');
const requiredText = (value, max) => typeof value === 'string' &&
  value.trim().length > 0 && value.trim().length <= max;

export function validateBankAccounts(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_ACCOUNTS) {
    throw new Error('Puedes configurar como máximo cinco cuentas.');
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Datos inválidos en la cuenta ' + (index + 1) + '.');
    }
    const bank = String(entry.bank ?? '').trim();
    const holder = String(entry.holder ?? '').trim();
    const clabe = normalizeDigits(entry.clabe);
    const account = normalizeDigits(entry.account);
    const card = normalizeDigits(entry.card);
    if (!requiredText(entry.bank, 70) || !requiredText(entry.holder, 130)) {
      throw new Error('Indica banco y titular en la cuenta ' + (index + 1) + '.');
    }
    if (clabe && !/^\d{18}$/.test(clabe)) {
      throw new Error('La CLABE debe tener 18 dígitos en la cuenta ' + (index + 1) + '.');
    }
    if (account && !/^\d{6,20}$/.test(account)) {
      throw new Error('El número de cuenta debe tener de 6 a 20 dígitos en la cuenta ' + (index + 1) + '.');
    }
    if (card && !/^\d{15,19}$/.test(card)) {
      throw new Error('La tarjeta debe tener de 15 a 19 dígitos en la cuenta ' + (index + 1) + '.');
    }
    if (!clabe && !account && !card) {
      throw new Error('Agrega CLABE, número de cuenta o tarjeta en la cuenta ' + (index + 1) + '.');
    }
    if (typeof entry.published !== 'boolean') {
      throw new Error('Indica si la cuenta ' + (index + 1) + ' será pública.');
    }
    return {bank, holder, clabe, account, card, published: entry.published};
  });
}

export async function installBankAccounts(app, pool, requireAdmin) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public_bank_account_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`INSERT INTO public_bank_account_settings (id)
    VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const readSettings = async () => {
    const result = await pool.query(`SELECT accounts,version,updated_at
      FROM public_bank_account_settings WHERE id=1`);
    const row = result.rows[0];
    return {accounts: Array.isArray(row?.accounts) ? row.accounts : [],
      version: Number(row?.version || 0), updatedAt: row?.updated_at || null};
  };

  // Publico: nunca incluye cuentas en borrador ni campos administrativos.
  app.get('/api/bank-accounts', async (_req, res, next) => {
    try {
      const saved = await readSettings();
      const publicAccounts = saved.accounts.filter(a => a.published === true)
        .map(a => ({bank:a.bank,holder:a.holder,clabe:a.clabe,
          account:a.account,card:a.card}));
      res.set('Cache-Control', 'no-store');
      res.json({accounts: publicAccounts});
    } catch (error) { next(error); }
  });

  app.get('/api/admin/bank-accounts', requireAdmin, async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await readSettings());
    } catch (error) { next(error); }
  });

  app.put('/api/admin/bank-accounts', requireAdmin, async (req, res, next) => {
    const expectedVersion = req.body?.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return res.status(400).json({error:'Versión inválida; vuelve a cargar las cuentas.'});
    }
    let accounts;
    try { accounts = validateBankAccounts(req.body?.accounts); }
    catch (error) { return res.status(400).json({error:error.message}); }
    try {
      const result = await pool.query(`UPDATE public_bank_account_settings
        SET accounts=$1::jsonb, version=version+1, updated_at=now()
        WHERE id=1 AND version=$2 RETURNING version`,
        [JSON.stringify(accounts),expectedVersion]);
      if (!result.rowCount) {
        return res.status(409).json({error:'Otra sesión actualizó las cuentas. Recarga antes de guardar.'});
      }
      res.set('Cache-Control', 'no-store');
      res.json({ok:true,version:Number(result.rows[0].version)});
    } catch (error) { next(error); }
  });
}
