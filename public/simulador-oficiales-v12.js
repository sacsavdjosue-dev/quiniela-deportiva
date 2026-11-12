// QUINIFUT_SIMULADOR_OFICIALES_FIJOS_V12
// Combina resultados oficiales PUBLICADOS y simulaciones de partidos pendientes.
// No publica borradores ni altera marcadores/quinielas guardadas.
(() => {
  'use strict';
  if (location.pathname !== '/simulador.html') return;
  const panel = document.getElementById('simPanel');
  const list = document.getElementById('simMatches');
  if (!panel || !list || document.getElementById('simOfficialLegendV12')) return;
  const VALID = new Set(['L','E','V','S']);
  const state = { ready:false, loading:false, roundId:null, locked:[], lastSuccess:0 };
  const sourceSelects = () => [...list.querySelectorAll('select[data-i]')];
  const isFixed = index => VALID.has(state.locked[index]);
  const legend = document.createElement('div');
  legend.id = 'simOfficialLegendV12';
  legend.setAttribute('role','status');
  legend.setAttribute('aria-live','polite');
  legend.textContent = 'Consultando resultados oficiales publicados…';
  list.insertAdjacentElement('beforebegin',legend);

  const style = document.createElement('style');
  style.id = 'simOfficialLocksV12Style';
  style.textContent = `
    #simOfficialLegendV12 {margin:4px 0 6px;padding:5px 7px;border-radius:6px;
      background:#17384b;color:#e1eef1;font-size:10px;line-height:1.35}
    #simPanel #compactSimTable .cs-row.cs-official {box-shadow:inset 2px 0 #e52336}
    #simPanel #compactSimTable .cs-row.cs-official .cs-pick[aria-pressed="true"] {
      background:#e52336!important;color:white!important}
    #simPanel #compactSimTable .cs-row.cs-official .cs-pick:disabled {
      cursor:default;opacity:1}
    #simPanel #compactSimTable .cs-row.cs-official .cs-team {color:#102238}
    #simPanel #compactSimTable .cs-row.cs-official .cs-official-lock {
      color:#bd172b;font-size:9px;line-height:1;flex:0 0 auto}
    #simPanel #compactSimTable .cs-row:not(.cs-official) .cs-pick:disabled {
      cursor:wait;opacity:.65}
  `;
  document.head.appendChild(style);

  function notifyChange(select) {
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function syncView() {
    const selects = sourceSelects();
    if (![10,11].includes(selects.length)) return;
    const rows = [...(document.getElementById('compactSimTable')?.querySelectorAll('.cs-row') || [])];
    for (let i=0;i<selects.length;i++) {
      const select = selects[i];
      const fixed = isFixed(i);
      select.disabled = !state.ready || fixed;
      select.dataset.officialLocked = fixed ? '1' : '0';
      const row = rows[i];
      if (!row) continue;
      row.classList.toggle('cs-official', fixed);
      row.title = fixed ? 'Resultado oficial publicado, no editable' : 'Resultado pendiente: se puede simular';
      const left = row.querySelector('.cs-team');
      const oldIcon = left?.querySelector('.cs-official-lock');
      if (fixed && left && !oldIcon) {
        const lock = document.createElement('span');
        lock.className = 'cs-official-lock';
        lock.textContent = '🔒';
        lock.setAttribute('aria-label','Resultado oficial');
        left.append(lock);
      }
      if (!fixed) oldIcon?.remove();
      row.querySelectorAll('button.cs-pick').forEach(button => {
        button.disabled = !state.ready || fixed;
        button.setAttribute('aria-pressed',String(button.dataset.code === select.value));
        button.title = fixed ? 'Resultado oficial publicado, no modificable' : button.title;
      });
    }
  }
  function setBlocked(message) {
    state.ready = false;
    legend.textContent = message;
    syncView();
  }
  function applyPublicState(payload) {
    const selects = sourceSelects();
    if (![10,11].includes(selects.length) || payload.matchCount !== selects.length) {
      setBlocked('La jornada cambió; actualiza la página para continuar.');
      return;
    }
    if (state.roundId !== null && String(state.roundId) !== String(payload.roundId)) {
      // No mezclar partidos/escudos de una jornada anterior con otra.
      location.reload();
      return;
    }
    state.roundId = String(payload.roundId);
    const official = Array.isArray(payload.lockedOutcomes) ? payload.lockedOutcomes : [];
    const old = state.locked;
    state.locked = selects.map((_,i)=>VALID.has(official[i]) ? official[i] : null);
    state.ready = true;
    let changed = false;
    selects.forEach((select,i)=>{
      const fixed = state.locked[i];
      const wasFixed = VALID.has(old[i]);
      const target = fixed || (wasFixed ? '' : select.value);
      if (select.value !== target) {
        select.value = target;
        notifyChange(select);
        changed = true;
      }
    });
    syncView();
    const fixed = state.locked.filter(Boolean).length;
    legend.textContent = fixed
      ? `🔒 ${fixed} resultado(s) oficiales publicados (rojo, no editables). `+
        `Puedes simular los ${selects.length-fixed} encuentro(s) pendientes.`
      : 'Todavía no hay resultados oficiales publicados. Puedes simular los encuentros pendientes.';
    if (changed) {
      // Actualizar también la clasificación si aparecen/cambian resultados oficiales.
      // La lista pública de folios se recalcula al cambiar un selector fuente.
      document.dispatchEvent(new Event('sim:official-snapshot-updated'));
    }
    state.lastSuccess=Date.now();
  }
  async function refresh() {
    if (state.loading || document.hidden) return;
    if (![10,11].includes(sourceSelects().length)) return;
    state.loading=true;
    try {
      const response = await fetch('/api/participant/simulated-results/official', {
        method:'GET',cache:'no-store',headers:{Accept:'application/json'}
      });
      if (!response.ok) throw Error('No se pueden consultar resultados oficiales.');
      const data = await response.json();
      if (!data.roundId) throw Error('No existe jornada activa.');
      applyPublicState(data);
    } catch (_err) {
      // Fallar cerrado: bloquear controles si no se conoce el estado oficial.
      setBlocked('No se pudo comprobar la publicación oficial. Reintentando; simulación temporalmente bloqueada.');
    } finally {state.loading=false;}
  }
  function beforeResultsClick(event) {
    const button=event.target.closest?.('#compactSimTable .cs-pick');
    if (!button) return;
    const row=button.closest('.cs-row');
    const all=[...row?.parentElement?.querySelectorAll('.cs-row')||[]];
    const index=all.indexOf(row);
    if (!state.ready || index<0 || isFixed(index)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  panel.addEventListener('click',beforeResultsClick,true);
  // Los botones globales cambian SOLO los partidos que no estén publicados.
  // Se conserva la ejecución de los listeners existentes de resultados/clasificación.
  function setEditableOutcomes(random) {
    if (!state.ready) return;
    sourceSelects().forEach((select,i)=>{
      if (isFixed(i)) return;
      const code = random ? ['L','E','V'][Math.floor(Math.random()*3)] : '';
      if (select.value !== code) {
        select.value=code;
        notifyChange(select);
      }
    });
    syncView();
  }
  for (const [id,random] of [['randomSim',true],['clearSim',false]]) {
    const button=document.getElementById(id);
    if (button) button.onclick=()=>setEditableOutcomes(random);
  }
  // Evitar clics durante carga inicial o pérdida de conexión.
  for (const id of ['randomSim','clearSim']) {
    const button=document.getElementById(id);
    button?.addEventListener('click',event=>{
      if (!state.ready) {event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  const observer=new MutationObserver(()=>{
    syncView();
    if (!state.lastSuccess) refresh();
  });
  observer.observe(list,{childList:true});
  const panelObserver=new MutationObserver(()=>syncView());
  panelObserver.observe(panel,{childList:true});
  syncView();
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},15000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && Date.now()-state.lastSuccess>4000)refresh();
  });
  document.addEventListener('sim:official-conflict',()=>refresh());
})();
