import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';

export const newId = () => randomUUID();
export const now = () => new Date().toISOString();
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
export function verifyPassword(password, encoded) {
  if (!encoded || !encoded.includes(':')) return false;
  const [salt, hash] = encoded.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = t => createHash('sha256').update(t).digest('hex');

const ddl = [
  "PRAGMA foreign_keys = ON",
  "PRAGMA journal_mode = WAL",
  "PRAGMA busy_timeout = 5000",
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','faculty','librarian')), passhash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, isbn TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS copies (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), barcode TEXT UNIQUE NOT NULL, shelf TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS holds (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('queued','ready','fulfilled','cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS one_open_hold_per_patron_book ON holds(book_id,user_id) WHERE status IN ('queued','ready')",
  "CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL REFERENCES copies(id), user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('active','returned')), checked_out_at TEXT NOT NULL, due_at TEXT NOT NULL, returned_at TEXT, renewal_count INTEGER NOT NULL DEFAULT 0)",
  "CREATE UNIQUE INDEX IF NOT EXISTS one_active_loan_per_copy ON loans(copy_id) WHERE status='active'",
  "CREATE TABLE IF NOT EXISTS suggestions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, author TEXT NOT NULL, isbn TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','ordered')), created_at TEXT NOT NULL, reviewed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, push_status TEXT NOT NULL DEFAULT 'pending', push_attempts INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_holds_queue ON holds(book_id,status,created_at,id)",
  "CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id,status)",
  "CREATE INDEX IF NOT EXISTS idx_copies_book ON copies(book_id)",
  "CREATE INDEX IF NOT EXISTS idx_loans_active_copy ON loans(copy_id) WHERE status='active'",
  "CREATE INDEX IF NOT EXISTS idx_holds_by_book_status ON holds(book_id,status)",
  "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS catalogue_revision (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)",
  "INSERT OR IGNORE INTO catalogue_revision(id,version) VALUES(1,0)",
  "CREATE TRIGGER IF NOT EXISTS revision_books_insert AFTER INSERT ON books BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_books_update AFTER UPDATE ON books BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_books_delete AFTER DELETE ON books BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_copies_insert AFTER INSERT ON copies BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_copies_update AFTER UPDATE ON copies BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_copies_delete AFTER DELETE ON copies BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_holds_insert AFTER INSERT ON holds BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_holds_update AFTER UPDATE ON holds BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_holds_delete AFTER DELETE ON holds BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_loans_insert AFTER INSERT ON loans BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_loans_update AFTER UPDATE ON loans BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TRIGGER IF NOT EXISTS revision_loans_delete AFTER DELETE ON loans BEGIN UPDATE catalogue_revision SET version=version+1 WHERE id=1; END",
  "CREATE TABLE IF NOT EXISTS idempotency (user_id TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, payload_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,key))",
  "CREATE TABLE IF NOT EXISTS audit_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, receipt_hash TEXT NOT NULL, idempotency_key TEXT, occurred_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(occurred_at DESC)",
  "CREATE TABLE IF NOT EXISTS oidc_flows (flow_hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL UNIQUE, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS oidc_bindings (user_id TEXT PRIMARY KEY REFERENCES users(id), issuer TEXT NOT NULL, subject TEXT NOT NULL, linked_by TEXT NOT NULL REFERENCES users(id), linked_at TEXT NOT NULL, UNIQUE(issuer,subject))",
  "CREATE TABLE IF NOT EXISTS koha_patron_mappings (user_id TEXT PRIMARY KEY REFERENCES users(id), koha_patron_id INTEGER NOT NULL UNIQUE, verified_by TEXT NOT NULL REFERENCES users(id), verified_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS koha_hold_attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), patron_id INTEGER NOT NULL, biblio_id INTEGER NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','uncertain','succeeded','rejected')), receipt_json TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,request_key))",
  "CREATE INDEX IF NOT EXISTS idx_koha_attempt_status ON koha_hold_attempts(state,created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_koha_pending_user_biblio ON koha_hold_attempts(user_id,biblio_id) WHERE state IN ('reserved','uncertain')",
  "CREATE TABLE IF NOT EXISTS koha_loan_attempts (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), patron_id INTEGER NOT NULL, item_id INTEGER, checkout_id INTEGER, kind TEXT NOT NULL CHECK(kind IN ('issue','renew')), request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','uncertain','succeeded','rejected')), receipt_json TEXT, error_code TEXT, previous_renewals INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(actor_id,request_key))",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_koha_loan_pending_checkout ON koha_loan_attempts(checkout_id) WHERE kind='renew' AND state IN ('reserved','uncertain')",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_koha_loan_pending_item ON koha_loan_attempts(item_id) WHERE kind='issue' AND state IN ('reserved','uncertain')",
  "CREATE TABLE IF NOT EXISTS koha_return_tickets (id TEXT PRIMARY KEY, checkout_id INTEGER NOT NULL, patron_id INTEGER NOT NULL, item_id INTEGER NOT NULL, staff_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('awaiting_koha','verified')), receipt_json TEXT, created_at TEXT NOT NULL, verified_at TEXT, verified_by TEXT REFERENCES users(id), UNIQUE(staff_id,request_key))",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_koha_open_return ON koha_return_tickets(checkout_id) WHERE state='awaiting_koha'",
  "CREATE INDEX IF NOT EXISTS idx_koha_return_status ON koha_return_tickets(state,created_at)",
  "CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(title,author,isbn,subject,content='books',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2')",
  "CREATE TRIGGER IF NOT EXISTS books_fts_ai AFTER INSERT ON books BEGIN INSERT INTO books_fts(rowid,title,author,isbn,subject) VALUES(new.rowid,new.title,new.author,new.isbn,new.subject); END",
  "CREATE TRIGGER IF NOT EXISTS books_fts_ad AFTER DELETE ON books BEGIN INSERT INTO books_fts(books_fts,rowid,title,author,isbn,subject) VALUES('delete',old.rowid,old.title,old.author,old.isbn,old.subject); END",
  "CREATE TRIGGER IF NOT EXISTS books_fts_au AFTER UPDATE ON books BEGIN INSERT INTO books_fts(books_fts,rowid,title,author,isbn,subject) VALUES('delete',old.rowid,old.title,old.author,old.isbn,old.subject); INSERT INTO books_fts(rowid,title,author,isbn,subject) VALUES(new.rowid,new.title,new.author,new.isbn,new.subject); END"
];

export function openStore(path = './data/lumen.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  for (const sql of ddl) db.exec(sql);
  if (!db.prepare("SELECT 1 FROM metadata WHERE key='catalog_fts_v1'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec("INSERT INTO books_fts(books_fts) VALUES('rebuild')");
      db.prepare("INSERT INTO metadata(key,value) VALUES('catalog_fts_v1','built')").run();
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
  }
  const store = {
    db,
    get(sql, ...params) { return db.prepare(sql).get(...params); },
    all(sql, ...params) { return db.prepare(sql).all(...params); },
    run(sql, ...params) { return db.prepare(sql).run(...params); },
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() { db.close(); }
  };
  return store;
}

function addAccount(s, { email, name, role, password }) {
  const id = newId();
  s.run("INSERT INTO users(id,email,name,role,passhash,created_at) VALUES(?,?,?,?,?,?)",
    id, email.toLowerCase(), name, role, hashPassword(password), now());
  return id;
}

export function bootstrap(s, env = process.env) {
  // A demo DB must never be reused on an internet-facing production service.
  const isDemo = s.get("SELECT value FROM metadata WHERE key='demo_dataset'")?.value === '1' ||
    !!s.get("SELECT 1 FROM users WHERE email IN ('student@lumen.local','faculty@lumen.local','librarian@lumen.local') LIMIT 1");
  if (env.NODE_ENV === 'production' && (isDemo || env.LUMEN_DEMO === '1')) {
    throw new Error('REFUSING PRODUCTION START: demonstration dataset or LUMEN_DEMO enabled');
  }
  if (s.get("SELECT count(*) as n FROM users").n > 0) return;
  if (env.NODE_ENV === 'production') {
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
      throw new Error('Production first-start requires ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars)');
    }
    s.tx(() => addAccount(s, { email: env.ADMIN_EMAIL, name: 'Bibliotecario', role: 'librarian', password: env.ADMIN_PASSWORD }));
    return;
  }
  if (env.LUMEN_DEMO !== '1') {
    if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12) {
      s.tx(() => addAccount(s, { email: env.ADMIN_EMAIL, name: 'Bibliotecario', role: 'librarian', password: env.ADMIN_PASSWORD }));
    }
    return;
  }
  s.tx(() => {
    s.run("INSERT OR REPLACE INTO metadata(key,value) VALUES('demo_dataset','1')");
    addAccount(s, { email: 'student@lumen.local', name: 'Alex Studente', role: 'student', password: 'Demo1234!' });
    addAccount(s, { email: 'faculty@lumen.local', name: 'Giulia Docente', role: 'faculty', password: 'Demo1234!' });
    addAccount(s, { email: 'librarian@lumen.local', name: 'Sara Bibliotecaria', role: 'librarian', password: 'Demo1234!' });
    const examples = [
      ['Design dei servizi', 'Ezio Manzini', '9788808189777', 'Design', 'Strumenti per progettare servizi e sistemi.'],
      ['La biblioteca digitale', 'Anna Maria Tammaro', '9788870756938', 'Biblioteconomia', 'Introduzione ai servizi bibliotecari digitali.'],
      ['Clean Architecture', 'Robert C. Martin', '9780134494166', 'Informatica', 'Pratiche di progettazione software.'],
      ['Designing Data-Intensive Applications', 'Martin Kleppmann', '9781449373320', 'Informatica', 'Sistemi distribuiti e dati.'],
      ['The Design of Everyday Things', 'Don Norman', '9780465050659', 'Design', 'Usabilita e interazione umana.'],
      ['Information Architecture', 'Louis Rosenfeld', '9781491911686', 'UX', 'Progettazione di sistemi informativi.'],
      ['Introduzione alla biblioteconomia', 'Giovanni Solimine', '9788843099697', 'Biblioteconomia', 'Sistemi e servizi informativi.']
    ];
    for (const [title, author, isbn, subject, description] of examples) {
      const id = newId();
      s.run("INSERT INTO books(id,title,author,isbn,subject,description,created_at) VALUES(?,?,?,?,?,?,?)",
        id,title,author,isbn,subject,description,now());
      for (let n=1; n<=2; n++) {
        s.run("INSERT INTO copies(id,book_id,barcode,shelf) VALUES(?,?,?,?)",newId(),id,'DEMO-'+isbn.slice(-6)+'-'+n,'A-'+n);
      }
    }
  });
}
