// BOLSA_ACUMULADA_V1 - tarjeta publica, actualizacion automatica cada 30 s.
(() => {
  'use strict';
  if (/^\/admin\/(configuracion|pagos)\/?$/.test(location.pathname)) return;
  const panel = document.getElementById('user');
  const hero = panel?.querySelector('.hero');
  if (!hero || document.getElementById('publicPrizePool')) return;

  const style = document.createElement('style');
  style.id = 'prizePoolStyles';
  style.textContent = `
    #publicPrizePool{margin:8px;padding:13px 12px 11px;border-radius:13px;
      background:linear-gradient(135deg,#0b2840 0%,#133c46 55%,#164533 100%);
      border:1px solid #8ac636;box-shadow:0 5px 20px #001c1e55;color:#f5f9fd;text-align:center}
    #publicPrizePool .pool-eyebrow{font-weight:900;font-size:12px;letter-spacing:1px;color:#d5f235}
    #publicPrizePool .pool-total{font-size:clamp(29px,8.5vw,46px);font-weight:950;line-height:1.18;
      color:#d5f235;letter-spacing:-1.1px;margin:3px 0;overflow-wrap:anywhere}
    #publicPrizePool .pool-round{font-size:12px;color:#f5f7fa;font-weight:750;margin:3px 0}
    #publicPrizePool .pool-note{font-size:11px;line-height:1.45;color:#c7e2dd;margin:6px 0 0}
    #publicPrizePool .pool-meta{display:flex;justify-content:center;gap:5px 12px;flex-wrap:wrap;
      font-size:10px;color:#d3e4e9;border-top:1px solid #4f7979;margin-top:8px;padding-top:7px}
    #publicPrizePool .pool-meta strong{color:#fff}
    #publicPrizePool .pool-live{font-size:10px;color:#a9cec4;margin-top:7px}
    #publicPrizePool .pool-live.pool-error{color:#ffd28a}
  `;
  document.head.appendChild(style);

  const box = document.createElement('section');
  box.id = 'publicPrizePool';
  box.setAttribute('aria-label', 'Bolsa acumulada de premios de la jornada');
  box.innerHTML = `
    <div class="pool-eyebrow">🏆 BOLSA ACUMULADA DE PREMIOS</div>
    <div class="pool-total" id="publicPrizePoolAmount" role="status" aria-live="polite">—</div>
    <div class="pool-round" id="publicPrizePoolRound">Consultando jornada activa…</div>
    <p class="pool-note">Premio a repartir: <strong>70%</strong> de los pagos confirmados y validados.
    El <strong>30%</strong> restante se excluye de la bolsa.</p>
    <div class="pool-meta">
      <span>Pagos validados: <strong id="publicPrizePoolConfirmed">—</strong></span>
      <span>Retención (30%): <strong id="publicPrizePoolRetained">—</strong></span>
    </div>
    <div class="pool-live" id="publicPrizePoolFreshness">Actualización automática cada 30 s</div>
  `;
  hero.insertAdjacentElement('afterend', box);

  const el = id => document.getElementById(id);
  const formatter = new Intl.NumberFormat('es-MX', {maximumFractionDigits:0});
  function formatCents(raw) {
    const cents = BigInt(String(raw ?? '0'));
    const sign = cents < 0n ? '-' : '';
    const abs = cents < 0n ? -cents : cents;
    return sign + '$' + formatter.format(abs / 100n) + '.' + String(abs % 100n).padStart(2,'0');
  }
  let pending = false;
  let lastSuccess = 0;
  async function refreshPool() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const r = await fetch('/api/prize-pool', {
        method:'GET', cache:'no-store', headers:{'Accept':'application/json'}
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!data.roundId) {
        el('publicPrizePoolAmount').textContent = '—';
        el('publicPrizePoolRound').textContent = 'No hay jornada activa';
        el('publicPrizePoolConfirmed').textContent = '—';
        el('publicPrizePoolRetained').textContent = '—';
      } else {
        el('publicPrizePoolAmount').textContent = formatCents(data.prizeCents);
        el('publicPrizePoolRound').textContent = 'Jornada: ' + data.roundName;
        el('publicPrizePoolConfirmed').textContent = formatCents(data.confirmedCents);
        el('publicPrizePoolRetained').textContent = formatCents(data.retainedCents);
      }
      lastSuccess = Date.now();
      const stamp = new Date(data.updatedAt).toLocaleTimeString('es-MX',
        {timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'});
      el('publicPrizePoolFreshness').textContent = 'Actualizado: ' + stamp + ' · Cada 30 segundos';
      el('publicPrizePoolFreshness').classList.remove('pool-error');
    } catch (_err) {
      const text = lastSuccess
        ? 'No se pudo actualizar; se muestra la última bolsa consultada.'
        : 'Bolsa no disponible temporalmente. Reintentando…';
      el('publicPrizePoolFreshness').textContent = text;
      el('publicPrizePoolFreshness').classList.add('pool-error');
    } finally { pending = false; }
  }
  refreshPool();
  setInterval(refreshPool, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastSuccess > 10000) refreshPool();
  });
})();
