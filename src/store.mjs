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
  "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS idempotency (user_id TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, payload_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,key))",
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
