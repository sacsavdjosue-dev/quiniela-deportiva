// QUINIFUT_RESULTADOS_COMPACTOS_ROJOS_V8
// Solo cambia la presentación de Resultados y ganadores en /admin/configuracion.
// Conserva los <select data-result-index> de results.js, el guardado y la auditoria.
(() => {
  'use strict';
  if (!/^\/admin\/configuracion\/?$/.test(location.pathname)) return;
  if (document.getElementById('adminResultsCompactStylesV8')) return;

  const style = document.createElement('style');
  style.id = 'adminResultsCompactStylesV8';
  style.textContent = `
    #resultsManagementPanel #resultsMatchList.ar-compact-results {
      max-width:580px;margin:8px auto 12px;border:1px solid #637987;
      border-radius:7px;overflow:hidden;background:#f5f7fa;color:#142d3d;
    }
    #resultsManagementPanel .ar-compact-heading {
      display:flex;justify-content:space-between;align-items:center;gap:6px;
      padding:5px 7px;background:#173b4b;color:#fff;
      font-weight:800;font-size:10px;line-height:1.2;
    }
    #resultsManagementPanel .ar-compact-heading small {font-weight:500;font-size:9px;color:#c6dce2}
    #resultsManagementPanel #resultsMatchList .results-match.ar-result-row {
      display:grid;grid-template-columns:23px minmax(0,1fr) 23px minmax(0,1fr) 23px 23px;
      align-items:stretch;gap:0;padding:0;border-left:0;border-right:0;
      border-top:0;border-bottom:1px solid #cbd6dc;min-height:25px;
      background:#f5f7fa;color:#142d3d;
    }
    #resultsManagementPanel #resultsMatchList .ar-result-row:nth-child(even) {background:#e8eef1}
    #resultsManagementPanel #resultsMatchList .ar-result-row:last-child {border-bottom:0}
    #resultsManagementPanel #resultsMatchList .results-match.ar-result-row.results-wildcard {
      background:#dff1e7;border-top:1px solid #00a86b;padding-left:0;
    }
    #resultsManagementPanel .ar-team {
      min-width:0;display:flex;align-items:center;gap:3px;padding:1px 3px;
      font-size:10px;font-weight:750;line-height:1.08;overflow-wrap:anywhere;
    }
    #resultsManagementPanel .ar-team.ar-team-away {justify-content:flex-end;text-align:right}
    /* QUINIFUT_LOGOS_ADMIN_RESULTADOS_V11 */
    #resultsManagementPanel .ar-team img.ar-team-logo {
      display:block; width:15px; height:15px; flex:0 0 15px;
      object-fit:contain;object-position:center;
    }
    @media(max-width:520px){
      #resultsManagementPanel .ar-team img.ar-team-logo {width:13px;height:13px;flex-basis:13px}
    }
    @media(max-width:355px){
      #resultsManagementPanel .ar-team img.ar-team-logo {width:12px;height:12px;flex-basis:12px}
    }
    #resultsManagementPanel .ar-wild-badge {font-size:9px;color:#00754e;flex-shrink:0}
    #resultsManagementPanel .ar-result-button {
      display:flex;align-items:center;justify-content:center;
      width:100%;min-width:0;min-height:25px;padding:0;border:0;border-radius:0;
      background:#dce7eb;color:#173344;cursor:pointer;font-size:10px;font-weight:900;
    }
    #resultsManagementPanel .ar-result-button.ar-edge {background:#d0dce3}
    #resultsManagementPanel .ar-result-button.ar-suspend {background:#e7e9eb;color:#465760;font-size:9px}
    #resultsManagementPanel .ar-result-button[aria-pressed="true"] {
      background:#e52336;color:#fff;
    }
    #resultsManagementPanel .ar-result-button:focus-visible {outline:2px solid #102238;outline-offset:-2px;z-index:1}
    #resultsManagementPanel .ar-no-suspend {background:#dff1e7}
    #resultsManagementPanel #resultsMatchList select.ar-original-result {display:none!important}
    @media(max-width:520px) {
      #resultsManagementPanel #resultsMatchList.ar-compact-results {max-width:100%;margin:6px 0 10px}
      #resultsManagementPanel #resultsMatchList .results-match.ar-result-row {
        grid-template-columns:21px minmax(0,1fr) 21px minmax(0,1fr) 21px 21px;
        min-height:24px;
      }
      #resultsManagementPanel .ar-team {font-size:9px;padding:1px 2px;gap:2px}
      #resultsManagementPanel .ar-result-button {min-height:24px;font-size:9px}
      #resultsManagementPanel .ar-compact-heading {padding:4px 5px;font-size:9px}
      #resultsManagementPanel .ar-compact-heading small {font-size:8px}
    }
    @media(max-width:355px) {
      #resultsManagementPanel #resultsMatchList .results-match.ar-result-row {
        grid-template-columns:20px minmax(0,1fr) 20px minmax(0,1fr) 20px 20px;
      }
      #resultsManagementPanel .ar-team {font-size:8.5px}
    }
  `;
  document.head.appendChild(style);

  let attachedList = null;
  let observer = null;
  let decorating = false;
  const meanings = {
    L:'Ganó el equipo local', E:'Empate', V:'Ganó el equipo visitante', S:'Partido suspendido'
  };

  function node(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }

  function decorateRow(row) {
    if (row.dataset.compactResultsV8 === '1') return;
    const originalTitle = row.querySelector('.results-team');
    const select = row.querySelector('select[data-result-index]');
    if (!originalTitle || !select) return;
    const index = Number(select.dataset.resultIndex);
    const wildcard = row.classList.contains('results-wildcard');
    const label = originalTitle.textContent.replace(/^(?:⭐\s*COMODÍN|Partido\s+\d+)\s*·\s*/u,'');
    const separator = label.lastIndexOf(' vs ');
    // Se utiliza texto seguro para los nombres: no se interpreta HTML externo.
    const homeName = separator < 0 ? label : label.slice(0,separator);
    const awayName = separator < 0 ? 'Visitante' : label.slice(separator+4);
    const home = node('div','ar-team ar-team-home');
    if (wildcard) home.append(node('span','ar-wild-badge','★'));
    const homeLogo = originalTitle.querySelector('img[data-ar-team-side="home"]');
    if (homeLogo) home.append(homeLogo);
    home.append(node('span','',homeName));
    const away = node('div','ar-team ar-team-away');
    away.append(node('span','',awayName));
    const awayLogo = originalTitle.querySelector('img[data-ar-team-side="away"]');
    if (awayLogo) away.append(awayLogo);
    const group = [];
    function choice(code, extra='') {
      const button = node('button','ar-result-button '+extra,code);
      button.type='button';
      button.dataset.outcome=code;
      button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-label',`Partido ${index+1}: ${meanings[code]}`);
      button.title = meanings[code];
      button.addEventListener('click', () => {
        select.value = select.value === code ? '' : code;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      group.push(button);
      return button;
    }
    function sync() {
      group.forEach(b => b.setAttribute('aria-pressed',String(b.dataset.outcome === select.value)));
    }
    select.classList.add('ar-original-result');
    row.replaceChildren(
      choice('L','ar-edge'), home, choice('E'), away,
      choice('V','ar-edge'), wildcard ? node('span','ar-no-suspend') : choice('S','ar-suspend'),
      select
    );
    row.classList.add('ar-result-row');
    row.dataset.compactResultsV8 = '1';
    select.addEventListener('change',sync);
    sync();
  }

  function decorate() {
    if (decorating || !attachedList || !attachedList.isConnected) return;
    const rows = Array.from(attachedList.querySelectorAll(':scope > .results-match'));
    if (![10,11].includes(rows.length)) return;
    decorating = true;
    try {
      attachedList.classList.add('ar-compact-results');
      if (!attachedList.querySelector(':scope > .ar-compact-heading')) {
        const heading=node('div','ar-compact-heading');
        heading.append(node('span','', '⚽ RESULTADOS DE LOS PARTIDOS'));
        heading.append(node('small','', 'L · E · V · S = Suspendido'));
        attachedList.prepend(heading);
      }
      rows.forEach(decorateRow);
    } finally { decorating = false; }
  }

  function attach() {
    const list = document.getElementById('resultsMatchList');
    if (!list || list === attachedList) return;
    if (observer) observer.disconnect();
    attachedList = list;
    observer = new MutationObserver(decorate);
    observer.observe(list,{childList:true});
    decorate();
  }

  // El administrador puede reconstruir la pantalla al cambiar de sección.
  const priorRender=adminRender;
  adminRender=function(...args){
    const result=priorRender.apply(this,args);
    attach();
    return result;
  };
  attach();
})();
