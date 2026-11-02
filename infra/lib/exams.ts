import { readFileSync } from "node:fs";
import * as path from "node:path";

/** The site's exam list. Adding an exam there makes it a known examId at the next synth. */
export const EXAM_INDEX_PATH = path.join(__dirname, "..", "..", "quiz-app", "public", "exams", "index.json");

/**
 * Exam ids the Activity API accepts, read at synth time so they're never hand-copied. The ids go
 * to the Lambda as a comma-joined env var, so an id may not contain a comma.
 */
export function loadKnownExamIds(indexPath: string): string[] {
  const where = `exam index ${path.basename(indexPath)} (${indexPath})`;
  const parsed: unknown = JSON.parse(readFileSync(indexPath, "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${where} must be a non-empty array`);
  const ids = parsed.map((entry, i) => {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || id === "" || id.includes(",")) throw new Error(`${where}: entry ${i} needs a string id without commas`);
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error(`${where} has duplicate ids`);
  return ids;
}
