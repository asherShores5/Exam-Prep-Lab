/**
 * learner.ts — the Learner identity for this browser (SPEC §9.1, GLOSSARY "Learner").
 *
 * A Learner is `{ learnerId, name }` stored under `epl_learner` via StorageService.
 * The id is a random UUID created once; renaming keeps it.
 *
 * Failure policy: storage problems must never stop studying. Reads that fail or
 * return the wrong shape mean "no Learner"; writes that fail still return the
 * Learner so the caller can carry on in memory.
 */

import { StorageService } from './storage';

export interface Learner {
  learnerId: string;
  name: string;
}

export const LEARNER_NAME_MAX = 40;

// Same set the API rejects (infra/src/activity/validate.ts): C0/C1 controls plus U+2028/U+2029.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/**
 * Turn control characters into spaces, collapse runs of whitespace, trim, and return the name
 * if it is 1-40 characters, else null. Anything this returns, the API accepts.
 */
export function normalizeLearnerName(raw: string): string | null {
  const name = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...name].length;
  return chars >= 1 && chars <= LEARNER_NAME_MAX ? name : null;
}

/** The message to show for an invalid name, or null if the name is fine. */
export function learnerNameError(raw: string): string | null {
  return normalizeLearnerName(raw) === null ? `Please enter a name (1-${LEARNER_NAME_MAX} characters).` : null;
}

function isLearner(value: unknown): value is Learner {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.learnerId === 'string' &&
    v.learnerId.length > 0 &&
    typeof v.name === 'string' &&
    normalizeLearnerName(v.name) !== null
  );
}

function save(learner: Learner): void {
  try {
    StorageService.saveLearnerRaw(learner);
  } catch (err) {
    console.warn('[learner] Could not save Learner:', err);
  }
}

function requireName(raw: string): string {
  const name = normalizeLearnerName(raw);
  if (name === null) {
    throw new Error(`Name must be 1-${LEARNER_NAME_MAX} characters.`);
  }
  return name;
}

/** The saved Learner, or null if none (or unreadable). */
export function getLearner(): Learner | null {
  try {
    const raw = StorageService.getLearnerRaw();
    return isLearner(raw) ? { learnerId: raw.learnerId, name: normalizeLearnerName(raw.name)! } : null;
  } catch {
    return null;
  }
}

/** Create and save a new Learner. Throws if the name is invalid. */
export function createLearner(rawName: string): Learner {
  const learner: Learner = { learnerId: crypto.randomUUID(), name: requireName(rawName) };
  save(learner);
  return learner;
}

/**
 * Change the saved Learner's name, keeping the id. Creates a Learner if none
 * exists. Throws if the name is invalid.
 */
export function renameLearner(rawName: string): Learner {
  const name = requireName(rawName);
  const existing = getLearner();
  if (!existing) return createLearner(name);
  const learner: Learner = { learnerId: existing.learnerId, name };
  save(learner);
  return learner;
}
