// SIMULADOR_COMPACTO_QUINIFUT_V6
// Una tabla compacta L | LOCAL | E | VISITANTE | V | S.
// Las selecciones se comunican a los controles originales (ocultos) para
// reutilizar el calculo actual con los folios guardados en el servidor.
// No crea ni modifica apuestas, resultados oficiales o pagos.
(() => {
  'use strict';
  const list = document.getElementById('simMatches');
  const parent = document.getElementById('simPanel');
  if (!list || !parent || document.getElementById('compactSimTable')) return;

  const style = document.createElement('style');
  style.id = 'compactSimStylesV6';
  style.textContent = `
    #simPanel{padding:11px 10px}
    #simPanel h2{font-size:17px;margin:0 0 5px}
    #simPanel>p.muted{font-size:11px;line-height:1.35;margin:7px 0}
    #simPanel #simRoundInfo{margin:7px 0 10px;color:#d5f235;font-size:12px;font-weight:700}
    #simPanel #simMatches.compact-original-hidden>.match{display:none!important}
    #compactSimTable{border:1px solid #5a7888;border-radius:9px;overflow:hidden;
      background:#f5f7fa;color:#142d3d;margin:5px 0 10px}
    #compactSimTable .cs-head{background:#173b4b;color:#fff;display:flex;align-items:center;
      justify-content:space-between;gap:7px;padding:7px 9px;font-weight:800;font-size:11px}
    #compactSimTable .cs-head small{font-size:10px;font-weight:500;color:#b9d5da}
    #compactSimTable .cs-row{display:grid;grid-template-columns:27px minmax(0,1fr) 27px
      minmax(0,1fr) 27px 27px;align-items:stretch;min-height:32px;
      border-bottom:1px solid #cbd6dc;background:#f5f7fa}
    #compactSimTable .cs-row:nth-child(odd){background:#e8eef1}
    #compactSimTable .cs-row:last-child{border-bottom:0}
    #compactSimTable .cs-row.cs-wild{background:#dff1e7;border-top:2px solid #00a86b}
    #compactSimTable .cs-team{display:flex;align-items:center;min-width:0;gap:4px;padding:3px 5px;
      font-size:11px;line-height:1.12;font-weight:750;overflow:hidden}
    #compactSimTable .cs-team.right{justify-content:flex-end;text-align:right}
    #compactSimTable .cs-team>span{overflow-wrap:anywhere}
    #compactSimTable .cs-team img{width:18px;height:18px;flex:0 0 18px;object-fit:contain}
    #compactSimTable .cs-pick{border:0;border-radius:0;padding:0;min-width:0;min-height:32px;
      height:100%;width:100%;font-size:11px;font-weight:900;color:#173344;
      background:#d7e4e9;cursor:pointer}
    #compactSimTable .cs-pick.cs-side{background:#d0dce3}
    #compactSimTable .cs-pick.cs-suspend{font-size:10px;color:#5b6670;background:#e5e7e9}
    #compactSimTable .cs-pick[aria-pressed="true"]{background:#d5f235;color:#102238}
    #compactSimTable .cs-pick.cs-suspend[aria-pressed="true"]{background:#ffa63b;color:#122638}
    #compactSimTable .cs-pick:focus-visible{outline:3px solid #e68200;outline-offset:-3px;z-index:1}
    #compactSimTable .cs-no-suspend{background:#e8f4eb}
    #compactSimTable .cs-wild-marker{font-size:8px;font-weight:900;color:#00724d}
    #simPanel #simScore{display:none!important}
    #simPanel .controls{margin:8px 0;gap:7px}
    #simPanel .controls button{padding:8px 7px;font-size:11px}
    #simulatedParticipantResults{margin-top:10px;padding-top:8px;border-top:1px solid #4d6a7b}
    #simulatedParticipantResults h3{font-size:15px;margin:5px 0}
    #simulatedParticipantResults .leader-row{padding:7px 3px;gap:7px}
    #simulatedParticipantResults .leader-row strong{font-size:12px}
    #simulatedParticipantResults .leader-row small{font-size:10px;margin-top:2px}
    #simulatedParticipantResults .leader-row .score{font-size:13px;white-space:nowrap}
    @media(max-width:520px){
      #simPanel{padding:9px 6px}
      #compactSimTable .cs-row{grid-template-columns:24px minmax(0,1fr) 24px minmax(0,1fr) 24px 24px;min-height:29px}
      #compactSimTable .cs-pick{min-height:29px;font-size:10px}
      #compactSimTable .cs-team{font-size:10px;padding:2px 3px;gap:2px}
      #compactSimTable .cs-team img{width:15px;height:15px;flex-basis:15px}
      #compactSimTable .cs-head{padding:7px 6px}
    }
    @media(max-width:345px){
      #compactSimTable .cs-row{grid-template-columns:22px minmax(0,1fr) 22px minmax(0,1fr) 22px 22px}
      #compactSimTable .cs-team{font-size:9px}
    }
  `;
  document.head.append(style);

  const configPromise = fetch('/api/config', {
    headers: {Accept:'application/json'}, cache:'no-store'
  }).then(async response => {
    if (!response.ok) throw new Error('No se pudo consultar la jornada');
    return response.json();
  });

  let rendered = false;
  let building = false;
  let sourceSelects = [];
  let buttons = [];
  const codeLabels = {
    L:'Gana el equipo local', E:'Empate', V:'Gana el equipo visitante',
    S:'Partido suspendido'
  };
  const mk = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function teamCell(name, logo, right) {
    const cell = mk('div', 'cs-team' + (right ? ' right' : ''));
    const title = mk('span', '', String(name || (right ? 'Visitante' : 'Local')));
    const logoText = String(logo || '');
    let image = null;
    if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(logoText)) {
      image = mk('img'); image.src = logoText; image.alt = '';
      image.loading = 'lazy';
    }
    if (right) cell.append(title); else if (image) cell.append(image);
    if (!right) cell.append(title); else if (image) cell.append(image);
    return cell;
  }

  function sync() {
    buttons.forEach((group, i) => {
      const value = sourceSelects[i]?.value || '';
      group.forEach(button => {
        const selected = button.dataset.code === value;
        button.setAttribute('aria-pressed', String(selected));
      });
    });
  }

  function selectOutcome(index, choice) {
    const select = sourceSelects[index];
    if (!select) return;
    select.value = select.value === choice ? '' : choice;
    // Dispara tanto la lógica actual del simulador como la clasificación
    // de los folios realmente guardados; no se escribe en la base de datos.
    select.dispatchEvent(new Event('change', {bubbles:true}));
    sync();
  }

  async function build() {
    if (rendered || building) return;
    const existing = Array.from(list.querySelectorAll('select[data-i]'));
    if (![10,11].includes(existing.length)) return;
    building = true;
    try {
      const cfg = await configPromise;
      const count = Number(cfg.matchCount);
      if (count !== existing.length || !Array.isArray(cfg.teams) || cfg.teams.length < count) return;
      if (!list.contains(existing[0])) return;
      sourceSelects = existing;
      const table = mk('section');
      table.id = 'compactSimTable';
      table.setAttribute('aria-label', 'Simulación compacta de resultados');
      const heading = mk('div', 'cs-head');
      heading.append(mk('span', '', '⚽ RESULTADOS SIMULADOS'));
      heading.append(mk('small', '', 'L · E · V · S = Suspendido'));
      table.append(heading);
      cfg.teams.slice(0,count).forEach((game, i) => {
        const wildcard = i === count - 1;
        const row = mk('div', 'cs-row' + (wildcard ? ' cs-wild' : ''));
        const group = [];
        const action = (code, extra='') => {
          const button = mk('button', 'cs-pick ' + extra, code);
          button.type = 'button';
          button.dataset.code = code;
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', `Partido ${i+1}, ${game.home} contra ${game.away}: ${codeLabels[code]}`);
          button.title = codeLabels[code];
          button.addEventListener('click', () => selectOutcome(i, code));
          group.push(button);
          return button;
        };
        row.append(action('L', 'cs-side'));
        const left = teamCell(game.home, game.homeLogo, false);
        if (wildcard) left.prepend(mk('small','cs-wild-marker','⭐'));
        row.append(left);
        row.append(action('E'));
        row.append(teamCell(game.away, game.awayLogo, true));
        row.append(action('V', 'cs-side'));
        row.append(wildcard ? mk('span','cs-no-suspend') : action('S','cs-suspend'));
        table.append(row);
        buttons.push(group);
      });
      list.insertAdjacentElement('beforebegin', table);
      list.classList.add('compact-original-hidden');
      rendered = true;
      observer.disconnect();
      sync();
    } catch (error) {
      console.error('No se pudo cargar el simulador compacto:',error);
      // Si falla el complemento, el simulador original permanece disponible.
    } finally {building = false;}
  }

  const observer = new MutationObserver(build);
  observer.observe(list, {childList:true, subtree:true});
  build();

  // El simulador original conserva los controles de azar y limpieza.
  // Tras ejecutarse, sincronizamos la selección visual de la tabla compacta.
  ['randomSim','clearSim'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(sync, 0));
  });
})();
