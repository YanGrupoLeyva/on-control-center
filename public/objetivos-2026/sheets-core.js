// Only public configuration belongs here. OAuth access tokens stay in memory.
export const COLUMNS = ['Objetivos', 'GROWTH', 'TALENT', 'FINANCIAL', 'PRODUCT', 'SOCIAL'];
export const cellKey = (company, week, column) => `${company}|${week}|${column}`;
const text = value => String(value ?? '');
const quoteTab = name => `'${name.replaceAll("'", "''")}'`;

export function parseSheet(rows, tabName, companies) {
  const values = {}, ranges = {}, seenCompanies = new Set();
  let company = null, columns = null;
  rows.forEach((row, index) => {
    const first = text(row[0]).trim();
    if (companies.includes(first)) {
      if (seenCompanies.has(first)) throw new Error(`Empresa repetida: ${first}`);
      seenCompanies.add(first); company = first; columns = null; return;
    }
    if (!company) return;
    if (first.toLowerCase() === 'semana') {
      columns = COLUMNS.map(name => row.findIndex(value => text(value).trim().toLowerCase() === name.toLowerCase()));
      if (columns.some(column => column < 1 || column > 6)) throw new Error(`Columnas no válidas en ${company}`);
      return;
    }
    if (!columns || !first) return;
    const week = Number(first.replace(/^S/i, ''));
    if (!Number.isInteger(week) || week < 42 || week > 53) return;
    COLUMNS.forEach((column, position) => {
      const key = cellKey(company, week, column);
      if (key in ranges) throw new Error(`Semana repetida: ${company} S${week}`);
      values[key] = text(row[columns[position]]);
      ranges[key] = `${quoteTab(tabName)}!${String.fromCharCode(65 + columns[position])}${index + 1}`;
    });
  });
  for (const company of companies) for (let week = 42; week <= 53; week++) {
    for (const column of COLUMNS) if (!(cellKey(company, week, column) in ranges)) {
      throw new Error(`Falta ${company} S${week}. Revisa las tablas antes de sincronizar.`);
    }
  }
  return { values, ranges };
}

export class SheetsClient {
  constructor(spreadsheetId, companies, fetchImpl = fetch) {
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    this.companies = companies; this.fetch = fetchImpl; this.token = '';
  }
  async request(path, options = {}) {
    if (!this.token) throw new Error('Conecta tu cuenta de Google para continuar.');
    const response = await this.fetch(this.base + path, {
      ...options, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'La sesión de Google ha caducado. Vuelve a conectar.' :
        response.status === 403 ? 'Google no permite acceder. Comprueba los permisos de la hoja y la API de Sheets.' :
        body.error?.message || 'No se pudo acceder a Google Sheets.');
      error.status = response.status; throw error;
    }
    return body;
  }
  async read() {
    const metadata = await this.request('?fields=sheets(properties(sheetId,title,gridProperties))');
    if (metadata.sheets?.length !== 1) throw new Error('Se esperaba la única pestaña de Objetivos 2026.');
    const tab = metadata.sheets[0].properties;
    const end = Math.min(tab.gridProperties.rowCount, 1000);
    const result = await this.request(`/values/${encodeURIComponent(`${quoteTab(tab.title)}!A1:G${end}`)}?valueRenderOption=UNFORMATTED_VALUE`);
    return parseSheet(result.values || [], tab.title, this.companies);
  }
  async write(key, value, expected) {
    // Re-resolve rows before every write: inserted rows must not redirect a write.
    const current = await this.read();
    if (current.values[key] !== expected && current.values[key] !== value) {
      return { conflict: true, remote: current.values[key] };
    }
    if (current.values[key] !== value) {
      const range = current.ranges[key];
      await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[value]] }),
      });
    }
    return { conflict: false };
  }
}
