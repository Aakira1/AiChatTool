import { randomUUID } from "node:crypto";
import { db } from "../client.js";

const insertStmt = db.prepare(`
  INSERT INTO terminology_mappings (id, ci_term, cia_term, notes)
  VALUES (?, ?, ?, ?)
`);

const listStmt = db.prepare(`
  SELECT id, ci_term, cia_term, notes, created_at
  FROM terminology_mappings
  ORDER BY created_at DESC
`);

const deleteStmt = db.prepare(`DELETE FROM terminology_mappings WHERE id = ?`);

const hideStmt = db.prepare(`
  INSERT OR IGNORE INTO terminology_hidden (ci_term) VALUES (?)
`);
const listHiddenStmt = db.prepare(`SELECT ci_term FROM terminology_hidden`);

function rowToMapping(row) {
  let notes = [];
  try {
    notes = row.notes ? JSON.parse(row.notes) : [];
  } catch {
    notes = [];
  }
  return {
    id: row.id,
    ciTerm: row.ci_term,
    ciaTerm: row.cia_term,
    notes,
    custom: true,
  };
}

export function addTerminologyMapping({ ciTerm, ciaTerm, notes = [] }) {
  const id = randomUUID();
  insertStmt.run(id, ciTerm, ciaTerm, JSON.stringify(notes));
  return rowToMapping({
    id,
    ci_term: ciTerm,
    cia_term: ciaTerm,
    notes: JSON.stringify(notes),
  });
}

export function listCustomTerminology() {
  return listStmt.all().map(rowToMapping);
}

export function deleteTerminologyMapping(id) {
  return deleteStmt.run(id).changes > 0;
}

export function hideBuiltinTerm(ciTerm) {
  hideStmt.run(ciTerm);
  return true;
}

export function listHiddenTerms() {
  return listHiddenStmt.all().map((row) => row.ci_term);
}
