// QUINIFUT_SIMULADOR_MAS_COMPACTO_V7
// Ajuste exclusivamente visual sobre V6. No modifica registros ni resultados.
(() => {
  'use strict';
  if (document.getElementById('compactSimStylesV7')) return;
  if (!document.getElementById('simPanel')) return;
  const style = document.createElement('style');
  style.id = 'compactSimStylesV7';
  style.textContent = `
    /* Mantener el diseño V6, reduciendo ancho y espacios. */
    #simPanel {max-width:580px;margin:8px auto;padding:8px 7px}
    #simPanel h2 {font-size:15px;margin:0 0 3px}
    #simPanel>p.muted {font-size:10px;line-height:1.25;margin:4px 0}
    #simPanel #simRoundInfo {font-size:10.5px;margin:4px 0 6px}
    #simPanel #compactSimTable {margin:4px 0 6px;border-radius:6px}
    #simPanel #compactSimTable .cs-head {min-height:25px;padding:4px 6px;gap:4px;font-size:10px}
    #simPanel #compactSimTable .cs-head small {font-size:8.5px;line-height:1.1}
    #simPanel #compactSimTable .cs-row {
      grid-template-columns:23px minmax(0,1fr) 23px minmax(0,1fr) 23px 23px;
      min-height:25px;
    }
    #simPanel #compactSimTable .cs-row.cs-wild {border-top-width:1px}
    #simPanel #compactSimTable .cs-team {
      padding:1px 3px;gap:2px;font-size:10px;line-height:1.05;
    }
    #simPanel #compactSimTable .cs-team img {width:14px;height:14px;flex-basis:14px}
    #simPanel #compactSimTable .cs-pick {min-height:25px;font-size:10px}
    #simPanel #compactSimTable .cs-pick.cs-suspend {font-size:9px}
    #simPanel #compactSimTable .cs-wild-marker {font-size:7px}
    #simPanel .controls {margin:5px 0;gap:5px}
    #simPanel .controls button {padding:6px 5px;font-size:10px}
    #simPanel #simulatedParticipantResults {margin-top:6px;padding-top:6px}
    #simPanel #simulatedParticipantResults h3 {font-size:13px;margin:3px 0}
    #simPanel #simulatedParticipantResults p.muted {font-size:10px;line-height:1.3;margin:5px 0}
    #simPanel #simulatedParticipantResults .leader-row {padding:4px 2px;gap:5px}
    #simPanel #simulatedParticipantResults .leader-row strong {font-size:11px}
    #simPanel #simulatedParticipantResults .leader-row small {font-size:9.5px;margin-top:1px;line-height:1.25}
    #simPanel #simulatedParticipantResults .leader-row .score {font-size:12px}
    #simPanel #simulatedParticipantResults>button {margin:6px 0;padding:7px}
    @media(max-width:520px) {
      #simPanel {max-width:100%;padding:7px 5px}
      #simPanel #compactSimTable .cs-row {
        grid-template-columns:21px minmax(0,1fr) 21px minmax(0,1fr) 21px 21px;
        min-height:24px;
      }
      #simPanel #compactSimTable .cs-team {font-size:9px;padding:1px 2px;gap:2px}
      #simPanel #compactSimTable .cs-team img {width:13px;height:13px;flex-basis:13px}
      #simPanel #compactSimTable .cs-pick {min-height:24px;font-size:9px}
      #simPanel #compactSimTable .cs-head {padding:4px 5px}
    }
    @media(max-width:355px) {
      #simPanel #compactSimTable .cs-row {
        grid-template-columns:20px minmax(0,1fr) 20px minmax(0,1fr) 20px 20px;
      }
      #simPanel #compactSimTable .cs-team {font-size:8.5px}
      #simPanel #compactSimTable .cs-team img {width:12px;height:12px;flex-basis:12px}
    }
  `;
  document.head.appendChild(style);
})();
