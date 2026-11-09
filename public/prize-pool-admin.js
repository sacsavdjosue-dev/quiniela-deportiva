// PREMIO_ACUMULADO_VISIBILIDAD_ADMIN_V3
// Interruptor independiente de Guardar cambios: se aplica al marcar/desmarcar.
(() => {
  'use strict';
  if (!/^\/admin\/configuracion\/?$/.test(location.pathname)) return;
  const previousAdminRender = adminRender;

  const css = document.createElement('style');
  css.textContent = `
    #prizePoolAdminSwitch{border:1px solid #597787;border-radius:10px;
      background:#0c2637;padding:12px;margin-top:16px;color:#e9f4f7}
    #prizePoolAdminSwitch .pp-title{margin:0 0 8px;color:#d5f235;font-size:14px;font-weight:900}
    #prizePoolAdminSwitch .pp-check{display:flex!important;align-items:center;
      gap:11px;font-size:13px;font-weight:800;color:#f3f9f9;cursor:pointer}
    #prizePoolAdminSwitch .pp-check input{width:21px;height:21px;
      flex:0 0 21px;accent-color:#98d532;margin:0}
    #prizePoolAdminSwitch .pp-message{font-size:12px;line-height:1.5;
      margin:9px 0 0;color:#b9d9dc}
    #prizePoolAdminSwitch .pp-message.pp-error{color:#ffd28a}
  `;
  document.head.append(css);

  async function api(url, options={}) {
    const response = await fetch(url,{credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','Accept':'application/json'},...options});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error||'No se pudo actualizar la configuración.');
    return data;
  }

  function mount() {
    if (!unlocked || document.getElementById('prizePoolAdminSwitch')) return;
    const root = document.querySelector('#configOnlyPanel details.qa-accordion[data-section="jornadas"] .qa-accordion-content');
    if (!root) return;
    const card = document.createElement('div');
    card.id = 'prizePoolAdminSwitch';
    card.innerHTML = `
      <p class="pp-title">🏆 Publicación del premio acumulado</p>
      <label class="pp-check"><input id="prizePoolVisibleCheckbox" type="checkbox" disabled>
        Mostrar premio acumulado a los participantes</label>
      <p class="pp-message" id="prizePoolAdminMessage" role="status">
        Consultando estado de la jornada activa…</p>`;
    root.appendChild(card);
    const checkbox = card.querySelector('input');
    const message = card.querySelector('#prizePoolAdminMessage');
    let savedState = false;

    const describe = data => (data.roundName || 'Jornada activa') + ': ' +
      (data.visible ? 'premio visible al público.' : 'premio oculto para el público.');
    api('/api/admin/prize-pool-visibility').then(data=>{
      if (!card.isConnected) return;
      savedState = data.visible === true;
      checkbox.checked = savedState;
      checkbox.disabled = !data.roundId;
      message.textContent = data.roundId ? describe(data) : 'No existe una jornada activa.';
    }).catch(err=>{
      if (card.isConnected) message.textContent = 'Error al consultar el estado: ' + err.message;
      message.classList.add('pp-error');
    });

    checkbox.addEventListener('change',async()=>{
      const desired = checkbox.checked;
      checkbox.disabled = true;
      message.classList.remove('pp-error');
      message.textContent = 'Guardando visibilidad…';
      try {
        const data = await api('/api/admin/prize-pool-visibility',{
          method:'PUT',body:JSON.stringify({visible:desired})
        });
        if (!card.isConnected) return;
        savedState = data.visible === true;
        checkbox.checked = savedState;
        message.textContent = describe(data) + ' Cambios guardados.';
      } catch (err) {
        if (!card.isConnected) return;
        checkbox.checked = savedState;
        message.textContent = 'No se guardó: ' + err.message;
        message.classList.add('pp-error');
      } finally {
        if (card.isConnected) checkbox.disabled = false;
      }
    });
  }

  adminRender = function (...args) {
    const result = previousAdminRender.apply(this,args);
    if (unlocked) mount();
    return result;
  };
  if (unlocked) mount();
})();
