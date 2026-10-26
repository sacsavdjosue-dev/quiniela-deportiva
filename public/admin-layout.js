// PANELES_ADMIN_SEPARADOS_V1: administración accesible en URLs privadas, sin botones en vista pública.
// URL de configuración: /admin/configuracion
// URL de pagos: /admin/pagos
// El acceso real a los datos sigue protegido por la autenticación del servidor.
(() => {
  'use strict';
  const route = location.pathname.match(/^\/admin\/(configuracion|pagos)\/?$/);
  if (!route) return;
  const currentView = route[1];
  const previousAdminRender = adminRender;

  function createNavLink(href, label, active) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (active) {
      a.className = 'selected';
      a.setAttribute('aria-current', 'page');
    }
    return a;
  }

  adminRender = function () {
    previousAdminRender();
    const panel = document.getElementById('adminContent');
    if (!panel) return;

    // Sin sesión sólo se visualiza el formulario de acceso.
    if (!unlocked) return;

    const rounds = panel.querySelector('section.admin-row');
    const closing = document.getElementById('aCloseAt')?.closest('.admin-row');
    const finance = document.getElementById('paymentControlPanel');
    const registryTitle = Array.from(panel.querySelectorAll('h2'))
      .find(h => h.textContent.trim() === 'Registro central de quinielas');

    // El registro central está al final del panel original. Agruparlo sin
    // alterar sus identificadores, eventos, filtros ni funciones.
    const registry = document.createElement('section');
    registry.id = 'betRegistrySection';
    registry.className = 'admin-row';
    if (registryTitle) {
      const first = registryTitle.previousElementSibling?.tagName === 'HR'
        ? registryTitle.previousElementSibling : registryTitle;
      let cursor = first;
      while (cursor) {
        const next = cursor.nextSibling;
        registry.appendChild(cursor);
        cursor = next;
      }
      // El cierre de sesión estará en la navegación de ambos paneles.
      registry.querySelector('button[onclick="logoutAdmin()"]')?.remove();
    }

    const configuration = document.createElement('section');
    configuration.id = 'configOnlyPanel';
    const payments = document.createElement('section');
    payments.id = 'paymentsOnlyPanel';

    // El filtro histórico pertenece a la administración de registros y pagos,
    // pero conservamos su ID porque loadRounds() y paintBets() lo necesitan.
    const historyFilter = rounds?.querySelector('#historyRound');
    let historyBlock = null;
    if (historyFilter && registryTitle) {
      historyBlock = document.createElement('div');
      historyBlock.className = 'admin-row';
      const historyLabel = historyFilter.previousElementSibling;
      if (historyLabel?.tagName === 'LABEL') historyBlock.appendChild(historyLabel);
      historyBlock.appendChild(historyFilter);
    }

    if (rounds) configuration.appendChild(rounds);
    if (closing) configuration.appendChild(closing);
    // Los campos originales de configuración conservan sus eventos.
    for (const child of Array.from(panel.childNodes)) {
      if (child !== finance) configuration.appendChild(child);
    }
    if (finance) payments.appendChild(finance);
    if (historyBlock) payments.appendChild(historyBlock);
    if (registryTitle) payments.appendChild(registry);

    const nav = document.createElement('nav');
    nav.id = 'privateAdminNav';
    nav.setAttribute('aria-label', 'Secciones de administración');
    nav.appendChild(createNavLink('/admin/configuracion', '⚙ CONFIGURACIÓN', currentView === 'configuracion'));
    nav.appendChild(createNavLink('/admin/pagos', '💳 PAGOS Y REGISTROS', currentView === 'pagos'));
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = 'CERRAR SESIÓN';
    logout.onclick = () => logoutAdmin();
    nav.appendChild(logout);

    panel.replaceChildren(nav, configuration, payments);
    configuration.hidden = currentView !== 'configuracion';
    payments.hidden = currentView !== 'pagos';

    const heading = document.querySelector('#admin .hero h1');
    const subtitle = document.querySelector('#admin .hero small');
    if (heading) heading.textContent = currentView === 'pagos'
      ? 'ADMINISTRACIÓN DE PAGOS' : 'CONFIGURACIÓN DE QUINIELAS';
    if (subtitle) subtitle.textContent = 'Acceso administrativo protegido';

    if (currentView === 'pagos' && !finance) {
      const warning = document.createElement('p');
      warning.className = 'hint warning';
      warning.textContent = 'No se encontró el módulo de pagos. Actualiza la página o revisa el despliegue.';
      payments.prepend(warning);
    }
  };

  // Si la sesión se cargó antes que los scripts de administración, reconstruir
  // el panel ahora que los tres módulos están presentes.
  if (unlocked && document.getElementById('aTitle')) adminRender();
})();
