'use strict';

/* ==========================================================================
   DB — SQLite via the built-in node:sqlite module (Node >= 22.5).
   Holds the full (private) exit plan and its comments. The public mirror in
   data/exit-plan.json is written by index.js with secrets redacted.
   ========================================================================== */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'transparency.db');
const FULL_SEED = path.join(__dirname, 'seed', 'exit-plan.full.json');
const PUBLIC_SEED = path.join(__dirname, '..', 'data', 'exit-plan.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS exit_plan (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    title      TEXT    NOT NULL DEFAULT 'Exit Plan',
    content    TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
`);

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM exit_plan').get();
  if (n > 0) return;

  let title = 'Exit Plan';
  let content = '';

  try {
    if (fs.existsSync(FULL_SEED)) {
      const full = JSON.parse(fs.readFileSync(FULL_SEED, 'utf8'));
      title = full.title || title;
      content = String(full.content || '').trim();
    } else if (fs.existsSync(PUBLIC_SEED)) {
      const mirror = JSON.parse(fs.readFileSync(PUBLIC_SEED, 'utf8'));
      title = mirror.title || title;
      content = String(mirror.content || '').trim();
    }
  } catch (err) {
    console.error('[transparency] seed read failed:', err.message);
  }

  if (!content) {
    content = '# Exit Plan\n\nNo content yet. Edit this in the admin console.';
  }

  db.prepare(
    'INSERT INTO exit_plan (id, title, content, updated_at) VALUES (1, ?, ?, ?)'
  ).run(title, content, new Date().toISOString());
}

function rowToPlan(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

function getPlan() {
  const row = db.prepare('SELECT id, title, content, updated_at FROM exit_plan WHERE id = 1').get();
  return row ? rowToPlan(row) : null;
}

function updatePlan(patch) {
  const existing = getPlan();
  if (!existing) return null;
  const title = patch.title === undefined ? existing.title : patch.title;
  const content = patch.content === undefined ? existing.content : patch.content;
  db.prepare('UPDATE exit_plan SET title = ?, content = ?, updated_at = ? WHERE id = 1').run(
    title,
    content,
    new Date().toISOString()
  );
  return getPlan();
}

function listComments() {
  return db
    .prepare('SELECT id, content, created_at FROM comments ORDER BY created_at ASC')
    .all()
    .map((row) => ({ id: row.id, content: row.content, createdAt: row.created_at }));
}

function addComment(content) {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO comments (content, created_at) VALUES (?, ?)')
    .run(content, createdAt);
  return {
    id: Number(result.lastInsertRowid),
    content,
    createdAt,
  };
}

function deleteComment(id) {
  const result = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  seedIfEmpty,
  getPlan,
  updatePlan,
  listComments,
  addComment,
  deleteComment,
};
