// QUINIFUT_CUENTAS_BANCARIAS_V13: editor de cuentas bancarias publicables.
// Se agrega despues del panel acordeon y no modifica formularios existentes.
(() => {
  'use strict';
  if (!/^\/admin\/configuracion\/?$/.test(location.pathname)) return;
  const priorAdminRender = adminRender;
  const MAX = 5;
  const empty = () => ({bank:'',holder:'',clabe:'',account:'',card:'',published:false});
  const css = document.createElement('style');
  css.id = 'bankAccountsAdminStylesV13';
  css.textContent = `
    #bankAccountsAdminV13 .qa-accordion-content{padding:13px}
    #bankAccountsAdminV13 .ba-hint{font-size:11px;line-height:1.5;color:#b8d1d8}
    #bankAccountsAdminV13 .ba-entry{border:1px solid #597887;border-radius:10px;background:#0d2939;padding:12px;margin:11px 0}
    #bankAccountsAdminV13 .ba-entry-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
    #bankAccountsAdminV13 .ba-entry-head strong{color:#d5f235;font-size:13px}
    #bankAccountsAdminV13 .ba-entry-head button{background:#5a3240;border:1px solid #ab646f;color:#fff;padding:7px;font-size:10px}
    #bankAccountsAdminV13 .ba-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0}
    #bankAccountsAdminV13 .ba-fields label{display:grid;gap:4px;font-size:11px;color:#b9d1d7}
    #bankAccountsAdminV13 .ba-fields label.wide{grid-column:1/-1}
    #bankAccountsAdminV13 .ba-fields input{width:100%;padding:9px;border:1px solid #839cab;border-radius:7px;background:#ecf4f7;color:#112b3b;font-size:12px;margin:0}
    #bankAccountsAdminV13 .ba-visible{display:flex;gap:10px;align-items:center;font-weight:800;font-size:12px;color:#f3f8f9}
    #bankAccountsAdminV13 .ba-visible input{width:20px;height:20px;accent-color:#98d532;flex:0 0 20px;margin:0}
    #bankAccountsAdminV13 .ba-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    #bankAccountsAdminV13 .ba-actions button{flex:1 1 155px;font-size:11px;padding:10px}
    #bankAccountsAdminV13 #bankAccountsSave{background:#d5f235;color:#102238}
    #bankAccountsAdminV13 #bankAccountsAdd{background:#254b5b;color:#fff;border:1px solid #5d8792}
    #bankAccountsAdminV13 #bankAccountsStatus{font-size:12px;line-height:1.5;margin:10px 0;color:#d5e8ed}
    #bankAccountsAdminV13 #bankAccountsStatus.ba-error{color:#ffd18f}
    @media(max-width:500px){#bankAccountsAdminV13 .ba-fields{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  function make(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  async function api(url, options={}) {
    const response = await fetch(url, {credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json',Accept:'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la información.');
    return data;
  }
  function mount() {
    if (!unlocked) return;
    const root = document.getElementById('configOnlyPanel');
    if (!root || root.querySelector('#bankAccountsAdminV13')) return;

    const section = make('details',undefined,'qa-accordion');
    section.id='bankAccountsAdminV13';
    section.dataset.section='bancos';
    const heading = make('summary',undefined,'qa-accordion-head');
    const icon = make('span','🏦','qa-accordion-icon');
    icon.setAttribute('aria-hidden','true');
    const group = make('span',undefined,'qa-accordion-label');
    group.append(make('strong','Cuentas de banco'),make('small','Capturar y publicar los datos para los participantes'));
    heading.append(icon,group,make('span','⌄','qa-accordion-chevron'));
    const content = make('div',undefined,'qa-accordion-content');
    content.append(make('p','Los participantes verán únicamente las cuentas que marques como públicas. Antes de publicar verifica que todos los datos sean correctos.','ba-hint'));
    const entries = make('div'); entries.id='bankAccountsEntries';
    const actions = make('div',undefined,'ba-actions');
    const add = make('button','＋ AGREGAR CUENTA');add.id='bankAccountsAdd';add.type='button';
    const save = make('button','GUARDAR CUENTAS');save.id='bankAccountsSave';save.type='button';
    save.disabled=true; add.disabled=true;
    actions.append(add,save);
    const status = make('p','Cargando cuentas…');status.id='bankAccountsStatus';status.setAttribute('role','status');
    content.append(entries,actions,status);
    section.append(heading,content);
    const anchor = root.querySelector('details.qa-accordion[data-section="general"]');
    if (anchor) anchor.after(section); else root.append(section);

    let accounts = [], version = null, busy = false;
    const setStatus = (text, error=false) => {
      status.textContent=text;status.classList.toggle('ba-error',error);
    };
    const collect = () => Array.from(entries.querySelectorAll('.ba-entry')).map(entry => {
      const read = key => entry.querySelector('[data-key="'+key+'"]')?.value || '';
      return {bank:read('bank'),holder:read('holder'),clabe:read('clabe'),
        account:read('account'),card:read('card'),published:entry.querySelector('[data-key="published"]')?.checked===true};
    });
    function render() {
      entries.replaceChildren();
      accounts.forEach((account,index) => {
        const card = make('div',undefined,'ba-entry');
        const top = make('div',undefined,'ba-entry-head');
        const remove = make('button','ELIMINAR');remove.type='button';
        remove.setAttribute('aria-label','Eliminar cuenta ' + (index+1));
        remove.addEventListener('click',() => {
          accounts = collect();accounts.splice(index,1);render();
          setStatus('Cuenta eliminada del formulario. Pulsa GUARDAR CUENTAS para aplicar.');
        });
        top.append(make('strong','Cuenta bancaria ' + (index+1)),remove);
        const fields = make('div',undefined,'ba-fields');
        const inputs=[
          ['bank','Banco',70,'text','wide'],
          ['holder','Titular / beneficiario',130,'text','wide'],
          ['clabe','CLABE interbancaria (18 dígitos)',18,'numeric',''],
          ['account','Número de cuenta (opcional)',20,'numeric',''],
          ['card','Número de tarjeta (opcional)',19,'numeric','']
        ];
        for(const [key,title,max,mode,extra] of inputs){
          const label=make('label',undefined,extra);
          label.append(make('span',title));
          const input=make('input');input.type='text';input.dataset.key=key;
          input.value=account[key]||'';input.maxLength=max;
          if(mode==='numeric')input.inputMode='numeric';
          if(key==='clabe') input.placeholder='18 dígitos';
          label.append(input);fields.append(label);
        }
        const visible=make('label',undefined,'ba-visible');
        const check=make('input');check.type='checkbox';check.dataset.key='published';
        check.checked=account.published===true;
        visible.append(check,make('span','Publicar esta cuenta a los participantes'));
        card.append(top,fields,visible);
        entries.append(card);
      });
      add.disabled=busy||accounts.length>=MAX;
      save.disabled=busy||version===null;
    }
    add.addEventListener('click',() => {
      accounts=collect();if(accounts.length>=MAX)return;
      accounts.push(empty());render();
      setStatus('Completa los datos y pulsa GUARDAR CUENTAS. Por defecto queda oculta.');
    });
    save.addEventListener('click',async() => {
      if(busy || version===null)return;
      accounts=collect();busy=true;render();
      setStatus('Guardando cuentas bancarias…');
      try {
        const data=await api('/api/admin/bank-accounts',{method:'PUT',
          body:JSON.stringify({accounts,expectedVersion:version})});
        if(!section.isConnected)return;
        version=Number(data.version);
        setStatus('Cuentas guardadas correctamente. Publicadas: '+accounts.filter(a=>a.published).length+' de '+accounts.length+'.');
      } catch(error) {
        if(section.isConnected)setStatus('No se guardó: '+error.message,true);
      } finally {
        busy=false;if(section.isConnected)render();
      }
    });

    api('/api/admin/bank-accounts').then(data => {
      if(!section.isConnected)return;
      version=Number(data.version);
      accounts=Array.isArray(data.accounts)?data.accounts:[];
      render();
      setStatus(accounts.length
        ?'Cuentas registradas: '+accounts.length+'. Solo las marcadas como públicas aparecen a los participantes.'
        :'Sin cuentas registradas. Pulsa AGREGAR CUENTA para comenzar.');
    }).catch(error => {
      if(section.isConnected)setStatus('Error al cargar cuentas: '+error.message,true);
    });
  }

  adminRender=function(...args){
    const result=priorAdminRender.apply(this,args);
    if(unlocked)mount();
    return result;
  };
  if(unlocked)mount();
})();
