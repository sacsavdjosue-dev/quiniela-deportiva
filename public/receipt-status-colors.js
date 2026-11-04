// COLORES_RECEPCION_V2
// Solo presentación visual; nunca altera datos, estados o validación de abonos.
(() => {
  'use strict';
  if (!/^\/admin\/pagos\/?$/.test(location.pathname)) return;

  const states = new Set(['pendiente', 'recibida', 'pagada', 'validada']);
  const labels = {
    pendiente: 'PENDIENTE', recibida: 'RECIBIDA',
    pagada: 'PAGADA', validada: 'VALIDADA'
  };
  const receptionSuffix = /\s*[·•]\s*Recepci[oó]n:\s*(pendiente|recibida|pagada|validada)\s*$/i;

  function setSelectColor(select) {
    const status = (select.value || '').toLowerCase();
    if (states.has(status)) select.dataset.qrReceptionStatus = status;
    else delete select.dataset.qrReceptionStatus;
    if (!select.dataset.qrReceptionListener) {
      select.dataset.qrReceptionListener = '1';
      select.addEventListener('change', () => setSelectColor(select));
    }
  }

  function enhanceCards() {
    document.querySelectorAll('#paymentAccounts > .payment-account').forEach(card => {
      if (card.querySelector('.qr-reception-badge')) return;
      const meta = card.querySelector(':scope > .hint');
      if (!meta) return;
      const original = meta.textContent || '';
      const match = receptionSuffix.exec(original);
      if (!match) return;
      const status = match[1].toLowerCase();
      meta.textContent = original.slice(0, match.index).trimEnd();

      const row = document.createElement('div');
      row.className = 'qr-reception-row';
      const heading = document.createElement('span');
      heading.className = 'qr-reception-caption';
      heading.textContent = 'RECEPCIÓN DEL FOLIO';
      const badge = document.createElement('span');
      badge.className = 'qr-reception-badge';
      badge.dataset.qrReceptionStatus = status;
      badge.textContent = labels[status];
      badge.setAttribute('aria-label', 'Estado de recepción: ' + labels[status]);
      row.append(heading, badge);
      card.insertBefore(row, meta);
    });
  }

  function enhance() {
    document.querySelectorAll(
      '#paymentControlPanel .payment-registration-state select, #paymentRegistrationState'
    ).forEach(setSelectColor);
    enhanceCards();
  }

  function addStyles() {
    if (document.getElementById('qr-reception-style-v2')) return;
    const style = document.createElement('style');
    style.id = 'qr-reception-style-v2';
    style.textContent = `
#paymentControlPanel .qr-reception-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:9px 0 6px}
#paymentControlPanel .qr-reception-caption{font-size:10px;font-weight:750;color:#d6e5ee;letter-spacing:.05em}
#paymentControlPanel .qr-reception-badge{display:inline-flex;align-items:center;justify-content:center;min-width:96px;padding:6px 12px;border-radius:99px;font-size:11px;font-weight:900;letter-spacing:.035em;line-height:1.3;border:2px solid transparent}
#paymentControlPanel select[data-qr-reception-status]{font-weight:800;border-width:2px;transition:background-color .12s ease,color .12s ease,border-color .12s ease}
#paymentControlPanel .qr-reception-badge[data-qr-reception-status="pendiente"],
#paymentControlPanel select[data-qr-reception-status="pendiente"]{background:#ffb45e!important;color:#402000!important;border-color:#e28a24!important}
#paymentControlPanel .qr-reception-badge[data-qr-reception-status="recibida"],
#paymentControlPanel select[data-qr-reception-status="recibida"]{background:#ffe784!important;color:#3a3200!important;border-color:#d2b536!important}
#paymentControlPanel .qr-reception-badge[data-qr-reception-status="pagada"],
#paymentControlPanel select[data-qr-reception-status="pagada"]{background:#bff2b9!important;color:#183c20!important;border-color:#8bc888!important}
#paymentControlPanel .qr-reception-badge[data-qr-reception-status="validada"],
#paymentControlPanel select[data-qr-reception-status="validada"]{background:#238a55!important;color:#fff!important;border-color:#58cf8c!important}
#paymentControlPanel select[data-qr-reception-status]:focus-visible{outline:3px solid white;outline-offset:2px}
`;
    document.head.append(style);
  }

  function init() {
    addStyles();
    enhance();
    const root = document.getElementById('adminContent') || document.body;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        enhance();
      });
    }).observe(root, {childList: true, subtree: true});
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
