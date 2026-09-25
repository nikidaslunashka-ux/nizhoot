const { getSheetsClient } = require('./sheetsLoader');
const schemas = {
  AccountsV2: ['id', 'username', 'name', 'password_hash', 'role', 'status', 'must_change_password', 'created_at', 'reviewed_at', 'reviewed_by', 'version', 'photo'],
  QuizAccessV2: ['quiz_set', 'owner_id', 'collaborators'],
  MediaUploadsV2: ['file_id', 'quiz_set', 'uploaded_by'],
  AppSettingsV2: ['key', 'label', 'url']
};

// Single-process writer: Sheets is not a transactional database. Run one instance.
class AccountStore {
  constructor() { this.tail = Promise.resolve(); this.ready = null; this.cache = new Map(); }
  exclusive(work) {
    const task = this.tail.then(work);
    this.tail = task.catch(() => {});
    return task;
  }
  async init() {
    if (!this.ready) this.ready = this.initialize().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async initialize() {
    this.client = getSheetsClient();
    this.spreadsheetId = process.env.AUTH_SPREADSHEET_ID;
    if (!this.client || !this.spreadsheetId) throw new Error('Penyimpanan akun belum dikonfigurasi. Hubungi pengelola.');
    const api = this.client.spreadsheets;
    const result = await api.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets.properties.title' });
    const names = result.data.sheets.map(sheet => sheet.properties.title);
    for (const [title, columns] of Object.entries(schemas)) {
      if (!names.includes(title)) {
        await api.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
        await api.values.update({ spreadsheetId: this.spreadsheetId, range: `${title}!A1`, valueInputOption: 'RAW', requestBody: { values: [columns] } });
      } else {
        const header = await api.values.get({ spreadsheetId: this.spreadsheetId, range: `${title}!1:1` });
        if (title === 'AccountsV2' && JSON.stringify(header.data.values?.[0]) === JSON.stringify(columns.slice(0, -1))) {
          await api.values.update({ spreadsheetId: this.spreadsheetId, range: `${title}!L1`, valueInputOption: 'RAW', requestBody: { values: [['photo']] } });
        } else if (JSON.stringify(header.data.values?.[0]) !== JSON.stringify(columns)) throw new Error(`Header ${title} tidak sesuai. Hubungi pengelola.`);
      }
    }
  }
  async all(table) {
    await this.init();
    let entry = this.cache.get(table);
    if (!entry || entry.expires < Date.now()) {
      entry = { expires: Date.now() + 5000 };
      entry.promise = this.client.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: `${table}!A2:L` }).then(result =>
        (result.data.values || []).map((row, i) => ({ ...Object.fromEntries(schemas[table].map((key, n) => [key, String(row[n] ?? '')])), _row: i + 2 }))
      ).catch(error => { if (this.cache.get(table) === entry) this.cache.delete(table); throw error; });
      this.cache.set(table, entry);
    }
    return structuredClone(await entry.promise);
  }
  async save(table, record) {
    await this.init();
    const args = { spreadsheetId: this.spreadsheetId, range: `${table}!A${record._row || 1}`, valueInputOption: 'RAW', requestBody: { values: [schemas[table].map(key => String(record[key] ?? ''))] } };
    this.cache.delete(table);
    try {
      if (record._row) await this.client.spreadsheets.values.update(args);
      else await this.client.spreadsheets.values.append({ ...args, range: `${table}!A:L`, insertDataOption: 'INSERT_ROWS' });
    } finally { this.cache.delete(table); }
  }
}
module.exports = { AccountStore };
