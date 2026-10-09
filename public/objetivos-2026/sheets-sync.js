import { sheetsConfig } from './sheets-config.js';
import { SheetsClient, cellKey } from './sheets-core.js';

// Until OAuth is configured, the published local workflow remains unchanged.
if (sheetsConfig.clientId) start();

function start() {
  const scope = 'https://www.googleapis.com/auth/spreadsheets';
  const client = new SheetsClient(sheetsConfig.spreadsheetId, companies);
  const pending = new Map();
  let baseline = {}, ready = false, flushing = false, refreshing = false, timer, tokenClient, conflict = false;
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const connect = document.createElement('button');
  connect.className = 'primary'; connect.textContent = 'Conectar con Google';
  const refresh = document.createElement('button'); refresh.textContent = 'Actualizar desde Sheets';
  const retry = document.createElement('button'); retry.textContent = 'Reintentar guardado';
  const status = document.createElement('span'); status.className = 'sub'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const link = document.createElement('a'); link.textContent = 'Abrir hoja';
  link.href = 'https://docs.google.com/spreadsheets/d/19aMmwC54gPx7Bzsw4Gh9Kf4XvdlfLIaC_EiUYpBAEO4/edit?usp=drivesdk';
  link.target = '_blank'; link.rel = 'noopener';
  bar.append(connect, refresh, retry, link, status);
  document.querySelector('main').prepend(bar);
  document.querySelector('.notice').textContent = 'Google Sheets es la fuente compartida. Conecta tu cuenta para editar. Los cambios en Sheets se consultan cada 30 segundos mientras esta página esté abierta. El estado de guardado indica si tus cambios han llegado a la hoja.';
  // Bulk local imports and suggested plans have no shared-write semantics.
  $('seed').hidden = true; $('import').hidden = true;
  function updateControls() {
    document.querySelectorAll('#cards textarea').forEach(element => { element.readOnly = !ready; });
    refresh.disabled = !client.token || flushing || refreshing || (pending.size > 0 && !conflict);
    refresh.textContent = conflict ? 'Cargar versión de Sheets' : 'Actualizar desde Sheets';
    retry.hidden = pending.size === 0 || conflict;
    connect.textContent = ready ? 'Cambiar / renovar cuenta Google' : 'Conectar con Google';
  }
  const originalRender = render;
  render = function () { originalRender(); updateControls(); };
  const originalSaveMatrix = saveMatrix;
  saveMatrix = function () { originalSaveMatrix(); };
  $('cards').addEventListener('input', event => {
    const element = event.target;
    if (!element.matches('textarea[data-company]') || !ready) return;
    const key = cellKey(element.dataset.company, Number(element.dataset.week), element.dataset.col);
    const previous = pending.get(key);
    pending.set(key, { value: element.value, expected: previous ? previous.expected : baseline[key] });
    status.textContent = 'Cambios pendientes de guardar en Sheets…';
    updateControls(); clearTimeout(timer); timer = setTimeout(flush, 800);
  });
  async function flush() {
    if (flushing || refreshing || !ready || !pending.size) return;
    flushing = true; updateControls();
    try {
      while (pending.size) {
        const [key, change] = pending.entries().next().value;
        const result = await client.write(key, change.value, change.expected);
        if (result.conflict) {
          ready = false; conflict = true;
          status.textContent = `Otra persona ha cambiado ${key.replaceAll('|', ' · ')}. Tu texto sigue en pantalla. Exporta el CSV para conservarlo antes de cargar la versión de Sheets.`;
          // Keep every unsent change, never silently overwrite the remote cell.
          break;
        }
        baseline[key] = change.value;
        if (pending.get(key) === change) pending.delete(key);
        else pending.get(key).expected = change.value;
      }
      if (!pending.size) status.textContent = 'Guardado en Sheets · ' + new Date().toLocaleTimeString('es-ES');
    } catch (error) {
      if (error.status === 401) { client.token = ''; ready = false; }
      status.textContent = error.message + ' Tus cambios siguen en pantalla y aún no están guardados en Sheets.';
    } finally { flushing = false; updateControls(); }
  }
  async function load(discard = false) {
    if (refreshing || flushing || (pending.size && !discard)) return;
    refreshing = true;
    try {
      const result = await client.read();
      // An input may arrive while the network read is in flight.
      if (!discard && (pending.size || document.activeElement?.matches('#cards textarea'))) return;
      if (discard) { pending.clear(); conflict = false; }
      if (!Object.keys(baseline).length && Object.keys(matrixData).length) {
        localStorage.setItem(matrixKey + '-before-sheets', JSON.stringify(matrixData));
      }
      baseline = result.values; matrixData = { ...baseline };
      originalSaveMatrix();
      render();
      ready = true; status.textContent = 'Sincronizado · ' + new Date().toLocaleTimeString('es-ES');
    } catch (error) {
      if (error.status === 401) { client.token = ''; ready = false; }
      status.textContent = error.message;
    } finally {
      refreshing = false; updateControls();
      if (ready && pending.size && !conflict) { clearTimeout(timer); timer = setTimeout(flush, 800); }
    }
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
  script.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: sheetsConfig.clientId, scope,
      error_callback: () => { status.textContent = 'La conexión se ha cancelado. Puedes volver a intentarlo.'; },
      callback: async response => {
        if (response.error || !google.accounts.oauth2.hasGrantedAllScopes(response, scope)) {
          status.textContent = 'No se han concedido permisos para Google Sheets.'; return;
        }
        client.token = response.access_token;
        if (pending.size && !conflict) { ready = true; await flush(); }
        else if (conflict) { updateControls(); return; }
        else await load();
        updateControls();
      },
    });
    connect.disabled = false;
  };
  script.onerror = () => { status.textContent = 'No se pudo cargar la conexión de Google. Recarga la página.'; };
  document.head.append(script);
  connect.disabled = true;
  connect.onclick = () => tokenClient.requestAccessToken({ prompt: 'select_account' });
  refresh.onclick = () => {
    if (conflict && !confirm('Se descartarán los cambios pendientes de este navegador y se cargará la versión de Sheets. Exporta primero el CSV si quieres conservarlos. ¿Continuar?')) return;
    load(conflict);
  };
  retry.onclick = flush;
  setInterval(() => { if (ready && !document.hidden && !pending.size && !document.activeElement?.matches('#cards textarea')) load(); }, 30000);
  window.addEventListener('beforeunload', event => { if (pending.size) { event.preventDefault(); event.returnValue = ''; } });
  status.textContent = 'Conecta con Google para consultar y editar la hoja compartida.';
  updateControls();
}
