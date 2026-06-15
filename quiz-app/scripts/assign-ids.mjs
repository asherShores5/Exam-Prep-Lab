#!/usr/bin/env node
/**
 * assign-ids.mjs — one-off + repeatable content-pipeline step.
 *
 * Assigns a stable integer `id` to every question in each public/exams/*.json
 * bank (see SPEC.md §5.1 / Appendix A.4):
 *   - `id` is unique WITHIN a file; the app-wide identity is the pair (examId, id).
 *     IDs are intentionally NOT globally unique across banks.
 *   - Questions that already have a numeric `id` are left untouched.
 *   - Questions lacking an `id` get the next unused integer, continuing from the
 *     current max in the file (1-based), in file order.
 *   - `id` is emitted as the first key of each question object.
 *   - Files are written back as 2-space JSON with CRLF line endings (the repo
 *     convention going forward).
 *
 * Idempotent: re-running never changes an existing id. Index file is skipped.
 *
 * Usage (from quiz-app/):  node scripts/assign-ids.mjs [--check]
 *   --check : report what WOULD change and exit non-zero if any file is out of
 *             date, without writing. Useful as a CI guard.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMS_DIR = join(__dirname, '..', 'public', 'exams');

const checkOnly = process.argv.includes('--check');

/**
 * Assign ids to a question array in place-ish (returns a new array of objects
 * with `id` first). Returns { questions, assigned } where `assigned` counts how
 * many ids were newly created.
 */
function assignIds(questions) {
  let maxId = 0;
  for (const q of questions) {
    if (typeof q.id === 'number' && Number.isInteger(q.id) && q.id > maxId) {
      maxId = q.id;
    }
  }
  let assigned = 0;
  const out = questions.map((q) => {
    let id = q.id;
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      id = ++maxId;
      assigned++;
    }
    // Re-emit with `id` first, preserving all other keys in their original order.
    const { id: _drop, ...rest } = q;
    return { id, ...rest };
  });
  return { questions: out, assigned };
}

function serialize(data) {
  return JSON.stringify(data, null, 2).replace(/\n/g, '\r\n');
}

const files = readdirSync(EXAMS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort();

let totalAssigned = 0;
let staleFiles = 0;

for (const file of files) {
  const path = join(EXAMS_DIR, file);
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    console.warn(`SKIP ${file}: not a JSON array`);
    continue;
  }

  const { questions, assigned } = assignIds(data);
  const next = serialize(questions);
  const changed = next !== raw;
  totalAssigned += assigned;

  if (changed) {
    staleFiles++;
    if (checkOnly) {
      console.log(`STALE ${file}: ${assigned} id(s) to assign${assigned === 0 ? ' (reformat only)' : ''}`);
    } else {
      writeFileSync(path, next, 'utf8');
      console.log(`WROTE ${file}: ${data.length} questions, ${assigned} new id(s)`);
    }
  } else {
    console.log(`OK    ${file}: ${data.length} questions, all ids present`);
  }
}

console.log(
  `\n${checkOnly ? 'Check' : 'Done'}: ${files.length} file(s), ${totalAssigned} id(s) ${checkOnly ? 'pending' : 'assigned'}, ${staleFiles} file(s) ${checkOnly ? 'stale' : 'written'}.`
);

if (checkOnly && staleFiles > 0) {
  process.exitCode = 1;
}
