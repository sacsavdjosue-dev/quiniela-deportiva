// PANEL_ADMIN_ACORDEON_V1
// Cajas desplegables para Configuracion y Pagos. No recrea los formularios:
// mueve los nodos existentes, conservando sus ID, validaciones y eventos.
(() => {
  'use strict';
  if (!/^\/admin\/(?:configuracion|pagos)\/?$/.test(location.pathname)) return;

  const scope = location.pathname.includes('/pagos') ? 'pagos' : 'configuracion';
  const storeKey = 'quiniela-panel-acordeon-v1:' + scope;
  const sectionState = (() => {
    try {
      const obj = JSON.parse(sessionStorage.getItem(storeKey) || '{}');
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch { return {}; }
  })();
  const saveState = () => { try { sessionStorage.setItem(storeKey, JSON.stringify(sectionState)); } catch {} };

  function section(parent, key, heading, summary, icon, nodes, initiallyOpen) {
    const items = nodes.filter(Boolean);
    if (!items.length) return null;
    const panel = document.createElement('details');
    panel.className = 'qa-accordion';
    panel.dataset.section = key;
    panel.open = Object.prototype.hasOwnProperty.call(sectionState, key)
      ? sectionState[key] === true : initiallyOpen;

    const trigger = document.createElement('summary');
    trigger.className = 'qa-accordion-head';
    const mark = document.createElement('span');
    mark.className = 'qa-accordion-icon';
    mark.textContent = icon;
    mark.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'qa-accordion-label';
    const title = document.createElement('strong');
    title.textContent = heading;
    const hint = document.createElement('small');
    hint.textContent = summary;
    label.append(title, hint);
    const chevron = document.createElement('span');
    chevron.className = 'qa-accordion-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    trigger.append(mark, label, chevron);

    const content = document.createElement('div');
    content.className = 'qa-accordion-content';
    for (const node of items) content.appendChild(node);
    panel.append(trigger, content);
    panel.addEventListener('toggle', () => {
      if (!panel.isConnected) return;
      sectionState[key] = panel.open;
      saveState();
    });
    parent.appendChild(panel);
    return panel;
  }

  function toolBar(parent) {
    const bar = document.createElement('div');
    bar.className = 'qa-accordion-toolbar';
    const hint = document.createElement('p');
    hint.textContent = 'Abre solamente las secciones que necesites.';
    const actions = document.createElement('div');
    actions.className = 'qa-accordion-tools';
    for (const [caption, open] of [['ABRIR TODO', true], ['OCULTAR TODO', false]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qa-accordion-action';
      button.textContent = caption;
      button.addEventListener('click', () => {
        parent.querySelectorAll('details.qa-accordion').forEach(box => {
          box.open = open;
          sectionState[box.dataset.section] = open;
        });
        saveState();
      });
      actions.appendChild(button);
    }
    bar.append(hint, actions);
    parent.appendChild(bar);
  }

  function buildConfig() {
    const root = document.getElementById('configOnlyPanel');
    if (!root || root.querySelector('details.qa-accordion')) return;
    const rounds = root.querySelector('#newRoundName')?.closest('section.admin-row');
    const closing = root.querySelector('#aCloseAt')?.closest('.admin-row');
    const results = root.querySelector('#resultsManagementPanel');
    const archive = root.querySelector('#roundArchiveSection');
    const special = new Set([rounds, closing, results, archive].filter(Boolean));
    const general = Array.from(root.childNodes).filter(node => !special.has(node) &&
      (node.nodeType !== Node.TEXT_NODE || node.textContent.trim()));
    const matchStart = general.findIndex(node => node.nodeType === Node.ELEMENT_NODE &&
      /^H[2-4]$/.test(node.tagName) && /encuentros|partidos/i.test(node.textContent));
    const baseFields = matchStart < 0 ? general : general.slice(0, matchStart);
    const matches = matchStart < 0 ? [] : general.slice(matchStart);
    root.replaceChildren();
    toolBar(root);
    section(root, 'jornadas', 'Administración de jornadas', 'Crear, activar y consultar jornadas', '🗓️', [rounds], true);
    section(root, 'general', 'Información general', 'Nombre, contacto, costo y parámetros', '⚙️', baseFields, false);
    section(root, 'partidos', 'Partidos y escudos', 'Equipos, encuentros y configuración visual', '⚽', matches, false);
    section(root, 'cierre', 'Cierre de jornada', 'Horario límite y cierre manual', '⏱️', [closing], false);
    section(root, 'resultados', 'Resultados y ganadores', 'Captura, clasificación y reporte PDF', '🏆', [results], false);
    section(root, 'respaldo', 'Respaldo y depuración', 'Exportar CSV y eliminar jornadas inactivas', '🗄️', [archive], false);
  }

  function buildPayments() {
    const root = document.getElementById('paymentsOnlyPanel');
    if (!root || root.querySelector('details.qa-accordion')) return;
    const finance = root.querySelector('#paymentControlPanel');
    const review = root.querySelector('#winnerPaymentReviewPanel');
    const registry = root.querySelector('#betRegistrySection');
    const special = new Set([finance, review, registry].filter(Boolean));
    const other = Array.from(root.childNodes).filter(node => !special.has(node) &&
      (node.nodeType !== Node.TEXT_NODE || node.textContent.trim()));
    // El filtro historico pertenece al registro central; conserva su ID y eventos.
    if (registry) {
      const heading = registry.querySelector('h2');
      const history = other.find(node => node.nodeType === Node.ELEMENT_NODE &&
        node.querySelector?.('#historyRound'));
      if (heading && history) heading.after(history);
    }
    const leftovers = other.filter(node => !registry?.contains(node));
    root.replaceChildren();
    toolBar(root);
    section(root, 'cobros', 'Control de pagos y abonos', 'Cuentas, saldos, validaciones y exportaciones', '💳', [finance], true);
    section(root, 'conciliacion', 'Conciliación de ganadores', 'Revisar primeros lugares y pagos confirmados', '🏆', [review], false);
    section(root, 'registro', 'Registro central de quinielas', 'Consultar folios, estados e historial', '📋', [registry, ...leftovers], false);
  }

  const oldRender = adminRender;
  adminRender = function (...args) {
    const result = oldRender.apply(this, args);
    if (typeof unlocked !== 'undefined' && unlocked) {
      if (scope === 'configuracion') buildConfig();
      else buildPayments();
    }
    return result;
  };

  const css = document.createElement('style');
  css.id = 'qa-accordion-styles-v1';
  css.textContent = `
#adminContent .qa-accordion-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0 16px}
#adminContent .qa-accordion-toolbar p{margin:0;color:#c8dce4;font-size:13px}
#adminContent .qa-accordion-tools{display:flex;gap:7px;flex-wrap:wrap}
#adminContent button.qa-accordion-action{background:transparent;border:1px solid #738c9b;border-radius:9px;color:#edf8f8;font-size:11px;padding:9px 12px;cursor:pointer;min-width:0}
#adminContent button.qa-accordion-action:hover{background:#1c4559}
#adminContent .qa-accordion{display:block;background:#102b3d;border:1px solid #496c7e;border-radius:12px;margin:12px 0;overflow:hidden;box-shadow:0 5px 16px #0002}
#adminContent .qa-accordion[open]{border-color:#85a99b;box-shadow:0 7px 19px #0003}
#adminContent .qa-accordion-head{display:flex;align-items:center;gap:11px;cursor:pointer;padding:15px 16px;list-style:none;background:#18374a;user-select:none}
#adminContent .qa-accordion-head::-webkit-details-marker{display:none}
#adminContent .qa-accordion-head::marker{content:''}
#adminContent .qa-accordion-head:hover{background:#244a59}
#adminContent .qa-accordion[open]>.qa-accordion-head{background:#224b48;border-bottom:1px solid #638b88}
#adminContent .qa-accordion-icon{display:flex;align-items:center;justify-content:center;width:37px;height:37px;flex:0 0 37px;font-size:20px;border-radius:9px;background:#315568}
#adminContent .qa-accordion-label{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
#adminContent .qa-accordion-label strong{font-size:15px;line-height:1.3;color:#f8ffff;overflow-wrap:anywhere}
#adminContent .qa-accordion-label small{font-size:11px;line-height:1.4;color:#c5dadd}
#adminContent .qa-accordion-chevron{display:block;font-size:23px;font-weight:bold;color:#d5f235;line-height:1;transition:transform .15s ease}
#adminContent .qa-accordion[open] .qa-accordion-chevron{transform:rotate(180deg)}
#adminContent .qa-accordion-content{padding:12px 15px 16px;min-width:0}
#adminContent .qa-accordion-content>.admin-row{margin:0!important;max-width:100%}
#adminContent .qa-accordion-content>#resultsManagementPanel,
#adminContent .qa-accordion-content>#roundArchiveSection,
#adminContent .qa-accordion-content>#paymentControlPanel,
#adminContent .qa-accordion-content>#winnerPaymentReviewPanel{border:0!important;background:transparent!important;padding:0!important;margin:0!important;box-shadow:none!important}
#adminContent .qa-accordion-content>h3:first-child,#adminContent .qa-accordion-content>.admin-row>h3:first-child,#adminContent .qa-accordion-content>.admin-row>h2:first-child{margin-top:3px}
#adminContent .qa-accordion-content input,#adminContent .qa-accordion-content select{max-width:100%}
#adminContent .qa-accordion-head:focus-visible,#adminContent button.qa-accordion-action:focus-visible{outline:3px solid #d5f235;outline-offset:-3px}
@media(max-width:520px){#adminContent .qa-accordion-head{padding:12px 10px;gap:8px}#adminContent .qa-accordion-icon{width:32px;height:32px;flex-basis:32px;font-size:17px}#adminContent .qa-accordion-content{padding:11px 9px}#adminContent .qa-accordion-label strong{font-size:13px}#adminContent .qa-accordion-toolbar{align-items:stretch}#adminContent .qa-accordion-tools{width:100%}#adminContent button.qa-accordion-action{flex:1}}
@media(prefers-reduced-motion:reduce){#adminContent .qa-accordion-chevron{transition:none}}
`;
  document.head.appendChild(css);

  // No fuerces otro render: si la interfaz ya esta preparada, organiza el DOM existente.
  if (typeof unlocked !== 'undefined' && unlocked) {
    if (scope === 'configuracion') buildConfig();
    else buildPayments();
  }
})();
