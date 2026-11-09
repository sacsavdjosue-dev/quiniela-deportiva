// PREMIO_ACUMULADO_VISIBILIDAD_V3
// La tarjeta no existe visualmente mientras la jornada no la tenga publicada.
(() => {
  'use strict';
  if (/^\/admin\/(configuracion|pagos)\/?$/.test(location.pathname)) return;
  const hero = document.querySelector('#user .hero');
  if (!hero || document.getElementById('publicPrizePool')) return;

  const style = document.createElement('style');
  style.id = 'prizePoolStyles';
  style.textContent = `
    #publicPrizePool[hidden]{display:none!important}
    #publicPrizePool{margin:8px;padding:14px 12px;border-radius:13px;
      background:linear-gradient(135deg,#0b2840 0%,#133c46 55%,#164533 100%);
      border:1px solid #8ac636;box-shadow:0 5px 20px #001c1e55;
      color:#f5f9fd;text-align:center}
    #publicPrizePool .pool-eyebrow{font-weight:900;font-size:13px;
      letter-spacing:1px;color:#d5f235}
    #publicPrizePool .pool-total{font-size:clamp(32px,8.5vw,48px);
      font-weight:950;line-height:1.18;color:#d5f235;
      letter-spacing:-1.1px;margin:5px 0 0;overflow-wrap:anywhere}
  `;
  document.head.appendChild(style);

  const box = document.createElement('section');
  box.id = 'publicPrizePool';
  box.hidden = true; // Sin parpadeos de la bolsa al cargar la pagina.
  box.setAttribute('aria-label','Premio acumulado');
  box.innerHTML = `
    <div class="pool-eyebrow">🏆 PREMIO ACUMULADO</div>
    <div class="pool-total" id="publicPrizePoolAmount" role="status" aria-live="polite">—</div>`;
  hero.insertAdjacentElement('afterend', box);

  const amount = document.getElementById('publicPrizePoolAmount');
  const formatter = new Intl.NumberFormat('es-MX',{maximumFractionDigits:0});
  function formatCents(raw) {
    const cents = BigInt(String(raw ?? '0'));
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    return sign+'$'+formatter.format(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');
  }

  let pending = false;
  async function refreshPool() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const response = await fetch('/api/prize-pool',{
        method:'GET',cache:'no-store',headers:{Accept:'application/json'}
      });
      if (!response.ok) throw new Error('No se pudo consultar la bolsa');
      const data = await response.json();
      if (data.visible === true && data.prizeCents !== undefined) {
        amount.textContent = formatCents(data.prizeCents);
        box.hidden = false;
      } else {
        box.hidden = true;
        amount.textContent = '—';
      }
    } catch (_err) {
      // No mostrar un importe antiguo si no se confirma la visibilidad actual.
      box.hidden = true;
      amount.textContent = '—';
    } finally { pending = false; }
  }
  refreshPool();
  setInterval(refreshPool,30000);
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden) refreshPool();
  });
})();
