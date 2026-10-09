import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet, SheetsClient, COLUMNS, cellKey } from '../public/objetivos-2026/sheets-core.js';

const companies = ['LINMANIA', 'ROCKSTAR'];
function fixture() {
  return companies.flatMap(company => [[company], ['Semana', ...COLUMNS],
    ...Array.from({ length: 12 }, (_, i) => [42 + i, `Objetivo ${company}`, '', '', '', '', '']), []]);
}
const key = cellKey('ROCKSTAR', 42, 'SOCIAL');

test('maps tables, blank cells and reordered columns to exact original cells', () => {
  const rows = fixture();
  [rows[16][2], rows[16][6]] = [rows[16][6], rows[16][2]];
  rows[17][2] = 'Texto con ñ\ny dos líneas';
  const parsed = parseSheet(rows, "Hoja 'uno'", companies);
  assert.equal(Object.keys(parsed.values).length, 144);
  assert.equal(parsed.values[key], 'Texto con ñ\ny dos líneas');
  assert.equal(parsed.ranges[key], "'Hoja ''uno'''!C18");
  assert.equal(parsed.values[cellKey('LINMANIA', 53, 'PRODUCT')], '');
});

test('rejects missing companies and duplicated weeks before writes', () => {
  assert.throws(() => parseSheet(fixture().slice(0, 15), 'Hoja 1', companies), /Falta ROCKSTAR/);
  const rows = fixture(); rows[3][0] = 42;
  assert.throws(() => parseSheet(rows, 'Hoja 1', companies), /Semana repetida/);
});

function mockClient(rows, remoteValue = '') {
  const calls = [];
  const client = new SheetsClient('exact-id', companies, async (url, options) => {
    calls.push({ url, options });
    const response = options.method === 'PUT' ? { updatedCells: 1 } : url.includes('/values/') ? { values: rows } :
      { sheets: [{ properties: { title: 'Hoja 1', gridProperties: { rowCount: 1000 } } }] };
    return { ok: true, json: async () => response };
  });
  client.token = 'test-token';
  return { client, calls };
}

test('writes only the edited cell as RAW, including empty text and formula-like text', async () => {
  for (const [existing, value] of [['', '=1+1'], ['borrar', '']]) {
    const rows = fixture(); rows[17][6] = existing;
    const { client, calls } = mockClient(rows);
    assert.deepEqual(await client.write(key, value, existing), { conflict: false });
    const writes = calls.filter(call => call.options.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0].options.body).values, [[value]]);
    assert.equal(JSON.parse(writes[0].options.body).range, "'Hoja 1'!G18");
    assert.match(writes[0].url, /valueInputOption=RAW/);
  }
});

test('does not overwrite a cell changed in Sheets or repeat a completed write', async () => {
  const rows = fixture(); rows[17][6] = 'Edición de otra persona';
  const { client, calls } = mockClient(rows);
  assert.deepEqual(await client.write(key, 'Mi edición', ''), { conflict: true, remote: 'Edición de otra persona' });
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 0);
  assert.deepEqual(await client.write(key, 'Edición de otra persona', ''), { conflict: false });
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 0);
});

test('re-resolves row positions after an inserted row', async () => {
  const rows = fixture(); rows.unshift([]);
  const { client, calls } = mockClient(rows);
  await client.write(key, 'Nuevo', '');
  const write = calls.find(call => call.options.method === 'PUT');
  assert.equal(JSON.parse(write.options.body).range, "'Hoja 1'!G19");
});

test('rejects unauthenticated writes and does not read or write the API', async () => {
  const { client, calls } = mockClient(fixture()); client.token = '';
  await assert.rejects(client.write(key, 'Nuevo', ''), /Conecta tu cuenta/);
  assert.equal(calls.length, 0);
});
