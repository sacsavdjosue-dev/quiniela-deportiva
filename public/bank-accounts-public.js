// QUINIFUT_CUENTAS_BANCARIAS_V13: solo muestra cuentas publicadas.
(() => {
  'use strict';
  const list = document.getElementById('bankAccountList');
  const status = document.getElementById('bankStatus');
  const copyStatus = document.getElementById('copyStatus');
  if (!list || !status) return;
  const node = (tag, cls, content) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (content !== undefined) item.textContent = String(content);
    return item;
  };
  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
      copyStatus.textContent = 'Número copiado correctamente.';
    } catch (_) {
      copyStatus.textContent = 'Selecciona el número y cópialo manualmente.';
    }
  }
  function field(card, label, value, copyable) {
    if (!value) return;
    const line = node('div', 'bank-field');
    const description = node('div');
    description.append(node('small', '', label), node('strong', '', value));
    line.append(description);
    if (copyable) {
      const button = node('button', '', 'COPIAR');
      button.type = 'button';
      button.setAttribute('aria-label', 'Copiar ' + label);
      button.addEventListener('click', () => copyValue(value));
      line.append(button);
    }
    card.append(line);
  }
  async function load() {
    try {
      const response = await fetch('/api/bank-accounts', {cache:'no-store',headers:{Accept:'application/json'}});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'No se pudo consultar las cuentas');
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      list.replaceChildren();
      if (!accounts.length) {
        status.textContent = 'Todavía no hay cuentas bancarias publicadas. Consulta a la administración.';
        return;
      }
      status.textContent = 'Cuentas disponibles (' + accounts.length + ')';
      for (const account of accounts) {
        const card = node('section','bank-card');
        card.append(node('h2','',account.bank));
        field(card,'Titular / beneficiario',account.holder,false);
        field(card,'CLABE interbancaria',account.clabe,true);
        field(card,'Número de cuenta',account.account,true);
        field(card,'Número de tarjeta',account.card,true);
        list.append(card);
      }
    } catch (error) {
      status.textContent = 'Las cuentas no están disponibles en este momento. Intenta más tarde.';
    }
  }
  load();
})();
