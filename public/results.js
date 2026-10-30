// RESULTADOS_GANADORES_V1: configuracion de marcadores y clasificacion.
// Solo se instala dentro del panel de configuracion autenticado.
(() => {
'use strict';
if (!/^\/admin\/configuracion\/?$/.test(location.pathname)) return;

let resultsSelectedRoundId = '';
let resultsCurrent = null;
let resultsBusy = false;
const resultsEl = id => document.getElementById(id);
const resultsText = (tag, content, className='') => {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
};
const prettyOutcome = x => ({L:'Local', E:'Empate', V:'Visitante', S:'Suspendido'})[x] || 'Pendiente';

const previousAdminRenderResults = adminRender;
adminRender = function() {
  previousAdminRenderResults();
  if (!unlocked) return;
  const parent = resultsEl('configOnlyPanel') || resultsEl('adminContent');
  if (!parent || resultsEl('resultsManagementPanel')) return;
  const section = document.createElement('section');
  section.id = 'resultsManagementPanel';
  section.className = 'admin-row';
  section.innerHTML = `
    <h2>🏆 Resultados y ganadores</h2>
    <p class="hint">Captura resultados por jornada. L = local, E = empate, V = visitante.
      S = suspendido. El último partido es el comodín y solo puntúa si se suspende uno normal.</p>
    <label for="resultsRound">Seleccionar jornada</label>
    <select id="resultsRound" onchange="loadSelectedResultsRound(this.value)"></select>
    <p id="resultsLoadStatus" class="hint">Consultando jornadas…</p>
    <div id="resultsMatchList"></div>
    <div id="resultsManagementControls" hidden>
      <label for="resultsStatus">Estado de la clasificación</label>
      <select id="resultsStatus">
        <option value="borrador">PROVISIONAL / BORRADOR</option>
        <option value="final">FINAL (todos los partidos definidos)</option>
      </select>
      <label class="results-inline-check">
        <input id="resultsPublished" type="checkbox">
        Publicar la clasificación en la página de resultados
      </label>
      <p class="hint">Los resultados no publicados son privados del administrador. La clasificación no verifica si una quiniela está pagada.</p>
      <div class="results-actions">
        <button class="secondary" id="resultsSaveButton" type="button" onclick="saveRoundResults()">GUARDAR RESULTADOS</button>
        <button class="outline" type="button" onclick="loadResultsRanking()">VER CLASIFICACIÓN</button>
        <button class="outline" type="button" onclick="loadResultsAudit()">HISTORIAL DE CAMBIOS</button>
      </div>
      <p id="resultsSaveInfo" class="hint" role="status"></p>
      <div id="resultsRankings"></div>
      <div id="resultsAudit"></div>
    </div>`;
  const roundSection = parent.querySelector('section.admin-row');
  if (roundSection) roundSection.after(section); else parent.prepend(section);
  loadResultsRounds();
};

async function loadResultsRounds() {
  try {
    const rounds = await request('/api/admin/rounds');
    const selector = resultsEl('resultsRound');
    if (!selector) return;
    selector.replaceChildren();
    for (const round of rounds) {
      const option = new Option(round.name + (round.is_active ? ' · activa' : ''), String(round.id));
      selector.append(option);
    }
    if (!rounds.length) {
      resultsEl('resultsLoadStatus').textContent = 'Aún no hay jornadas.';
      return;
    }
    if (!rounds.some(r => String(r.id) === resultsSelectedRoundId)) {
      resultsSelectedRoundId = String((rounds.find(r => r.is_active) || rounds[0]).id);
    }
    selector.value = resultsSelectedRoundId;
    await loadSelectedResultsRound(resultsSelectedRoundId);
  } catch (e) {
    const hint = resultsEl('resultsLoadStatus');
    if (hint) hint.textContent = 'No se pudieron cargar las jornadas: ' + e.message;
  }
}

async function loadSelectedResultsRound(id) {
  resultsSelectedRoundId = String(id);
  resultsCurrent = null;
  const list = resultsEl('resultsMatchList');
  if (list) list.replaceChildren();
  const controls = resultsEl('resultsManagementControls');
  if (controls) controls.hidden = true;
  const hint = resultsEl('resultsLoadStatus');
  if (hint) hint.textContent = 'Cargando resultados…';
  try {
    const data = await request('/api/admin/results/' + encodeURIComponent(id));
    if (resultsSelectedRoundId !== String(id) || !resultsEl('resultsMatchList')) return;
    resultsCurrent = data;
    resultsEl('resultsStatus').value = data.status;
    resultsEl('resultsPublished').checked = data.published;
    resultsEl('resultsManagementControls').hidden = false;
    resultsEl('resultsLoadStatus').textContent = data.round.name + ' · Versión ' + data.version +
      (data.published ? ' · Publicada' : ' · No publicada');
    resultsEl('resultsSaveInfo').textContent = '';
    resultsEl('resultsRankings').replaceChildren();
    resultsEl('resultsAudit').replaceChildren();
    paintResultMatches(data);
  } catch (e) {
    if (resultsSelectedRoundId === String(id) && hint) hint.textContent = 'Error: ' + e.message;
  }
}

function paintResultMatches(data) {
  const list = resultsEl('resultsMatchList');
  list.replaceChildren();
  data.round.teams.forEach((match, index) => {
    const wildcard = index === data.round.matchCount - 1;
    const row = resultsText('div', '', 'results-match' + (wildcard ? ' results-wildcard' : ''));
    const title = resultsText('div', (wildcard ? '⭐ COMODÍN' : `Partido ${index + 1}`) +
      ' · ' + match.home + ' vs ' + match.away, 'results-team');
    const select = document.createElement('select');
    select.className = 'results-pick';
    select.dataset.resultIndex = String(index);
    const items = [['', 'Pendiente'], ['L', 'L · Local'], ['E', 'E · Empate'], ['V', 'V · Visitante']];
    if (!wildcard) items.push(['S', 'S · Suspendido']);
    for (const [value, label] of items) select.append(new Option(label, value));
    select.value = data.outcomes[index] || '';
    select.addEventListener('change', () => {
      const hint = resultsEl('resultsSaveInfo');
      if (hint) hint.textContent = 'Hay cambios sin guardar; guarda antes de consultar la clasificación.';
    });
    row.append(title, select);
    list.append(row);
  });
}

async function saveRoundResults() {
  if (resultsBusy || !resultsCurrent) return;
  const outcomes = Array.from(document.querySelectorAll('#resultsMatchList [data-result-index]'),
    element => element.value || null);
  const status = resultsEl('resultsStatus').value;
  const published = resultsEl('resultsPublished').checked;
  const normal = outcomes.slice(0, -1);
  const suspended = normal.filter(x => x === 'S').length;
  if (status === 'final' && (normal.includes(null) || suspended > 1 ||
      (suspended === 1 && !['L', 'E', 'V'].includes(outcomes[outcomes.length - 1])))) {
    alert('No puedes finalizar todavía: completa los encuentros, revisa los suspendidos y captura el comodín cuando corresponda.');
    return;
  }
  if (published && !confirm('¿Publicar la clasificación de esta jornada? Se mostrarán los nombres de los participantes y sus folios, pero no teléfonos ni pagos.')) return;
  resultsBusy = true;
  const button = resultsEl('resultsSaveButton');
  if (button) button.disabled = true;
  try {
    const result = await request('/api/admin/results/' + encodeURIComponent(resultsCurrent.round.id), {
      method: 'PUT',
      body: JSON.stringify({outcomes, status, published, expectedVersion: resultsCurrent.version})
    });
    resultsCurrent.version = result.version;
    resultsCurrent.status = status;
    resultsCurrent.published = published;
    resultsCurrent.outcomes = outcomes;
    resultsEl('resultsSaveInfo').textContent = 'Resultados guardados correctamente. Versión ' + result.version +
      (published ? ' · Clasificación pública habilitada.' : ' · Sin publicación pública.');
    resultsEl('resultsLoadStatus').textContent = resultsCurrent.round.name + ' · Versión ' + result.version +
      (published ? ' · Publicada' : ' · No publicada');
    await loadResultsRanking();
  } catch (e) {
    alert('No se pudieron guardar los resultados: ' + e.message);
  } finally {
    resultsBusy = false;
    if (button) button.disabled = false;
  }
}

function renderRankingResults(data) {
  const parent = resultsEl('resultsRankings');
  if (!parent) return;
  parent.replaceChildren();
  parent.append(resultsText('h3', data.status === 'final' ? 'Clasificación final' : 'Clasificación provisional'));
  parent.append(resultsText('p',
    `Encuentros puntuados: ${data.scoredMatches}/${data.expectedMatches} · Suspendidos: ${data.suspendedMatches} · Participaciones: ${data.rankings.length}.`,
    'hint'));
  if (data.requiresManualReview) {
    parent.append(resultsText('p', 'ATENCIÓN: más de un suspendido. Revisión manual obligatoria; no se puede finalizar la jornada.', 'hint warning'));
  }
  if (!data.scoredMatches) {
    parent.append(resultsText('p', 'Aún no hay resultados puntuables.', 'hint'));
    return;
  }
  if (!data.rankings.length) {
    parent.append(resultsText('p', 'Aún no hay quinielas registradas en esta jornada.', 'hint'));
    return;
  }
  if (data.status === 'final' && data.leaders.length) {
    parent.append(resultsText('p', '🏆 Primer lugar: ' +
      data.leaders.map(x => x.participant + ' (' + x.folio + ')').join(', '), 'results-winners'));
  }
  for (const entry of data.rankings) {
    const row = resultsText('div', '', 'results-ranking-entry');
    row.append(resultsText('strong', '#' + entry.rank + ' · ' + entry.participant));
    row.append(resultsText('p', 'Folio: ' + entry.folio + ' · Mejor resultado: ' + entry.bestScore +
      '/' + data.scoredMatches + ' · Combinaciones con ese puntaje: ' + entry.bestCombinationsCount, 'hint'));
    const detail = document.createElement('details');
    const summary = resultsText('summary', 'Ver mejores combinaciones');
    const pre = resultsText('pre', entry.bestCombinations.map(x => x.split('').join(' ')).join('\n'), 'results-combinations');
    detail.append(summary, pre);
    row.append(detail);
    parent.append(row);
  }
}

async function loadResultsRanking() {
  if (!resultsCurrent) return;
  const box = resultsEl('resultsRankings');
  if (box) box.replaceChildren(resultsText('p', 'Calculando clasificación…', 'hint'));
  try {
    const data = await request('/api/admin/results/' + encodeURIComponent(resultsCurrent.round.id) + '/ranking');
    if (resultsSelectedRoundId !== String(data.round.id)) return;
    renderRankingResults(data);
  } catch (e) {
    if (box) box.replaceChildren(resultsText('p', 'Error: ' + e.message, 'hint warning'));
  }
}

async function loadResultsAudit() {
  if (!resultsCurrent) return;
  const box = resultsEl('resultsAudit');
  if (!box) return;
  box.replaceChildren(resultsText('p', 'Consultando historial…', 'hint'));
  try {
    const entries = await request('/api/admin/results/' + encodeURIComponent(resultsCurrent.round.id) + '/history');
    box.replaceChildren(resultsText('h3', 'Historial de cambios'));
    if (!entries.length) box.append(resultsText('p', 'Aún no hay ediciones.', 'hint'));
    for (const entry of entries) {
      box.append(resultsText('p', 'Versión ' + entry.version + ' · ' + entry.status +
        (entry.published ? ' · pública' : ' · privada') + ' · ' +
        new Date(entry.changed_at).toLocaleString('es-MX', {timeZone:'America/Mexico_City'}), 'hint'));
    }
  } catch (e) { box.replaceChildren(resultsText('p', 'Error: ' + e.message, 'hint warning')); }
}

Object.assign(window, {loadSelectedResultsRound, saveRoundResults, loadResultsRanking, loadResultsAudit});

document.head.insertAdjacentHTML('beforeend', `<style>
#resultsManagementPanel{border:1px solid #577487;border-radius:10px;padding:12px;margin:15px 0;background:#102c3d}
#resultsManagementPanel select{width:100%;padding:10px;border-radius:8px;background:#edf4f5;color:#112b3b;border:1px solid #9bb6c2}
#resultsManagementPanel .results-match{display:grid;grid-template-columns:minmax(0,1fr) minmax(115px,145px);gap:8px;align-items:center;padding:7px 4px;border-bottom:1px solid #496070}
#resultsManagementPanel .results-team{font-size:12px;font-weight:700;overflow-wrap:anywhere}
#resultsManagementPanel .results-wildcard{background:#245044;border-left:3px solid #d5f235;padding-left:7px}
#resultsManagementPanel .results-actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}
#resultsManagementPanel .results-actions button{flex:1 1 180px}
#resultsManagementPanel .results-inline-check{display:flex;gap:9px;align-items:center;font-size:12px;line-height:1.4}
#resultsManagementPanel .results-inline-check input{width:auto}
#resultsManagementPanel [hidden]{display:none!important}
#resultsManagementPanel .results-ranking-entry{padding:9px 0;border-bottom:1px solid #42627c}
#resultsManagementPanel .results-ranking-entry p{margin:5px 0}
#resultsManagementPanel .results-winners{padding:10px;border-radius:8px;background:#254b37;color:#e6ffad;font-weight:700}
#resultsManagementPanel .results-combinations{white-space:pre-wrap;word-break:break-word;font-size:11px}
@media(max-width:380px){#resultsManagementPanel .results-match{grid-template-columns:minmax(0,1fr) 120px}}
</style>`);

if (unlocked && resultsEl('aTitle')) adminRender();
})();
