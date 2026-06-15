import type { LegacyQuestion } from '../types/index';

export interface ValidationResult {
  valid: LegacyQuestion[];
  skipped: number;
  warnings: string[];
}

export function validateExamQuestions(
  raw: unknown[],
  examId: string,
): ValidationResult {
  const valid: LegacyQuestion[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  raw.forEach((item, idx) => {
    if (item === null || typeof item !== 'object') {
      warnings.push(`${examId}[${idx}]: not an object — skipped.`);
      skipped++;
      return;
    }

    const obj = item as Record<string, unknown>;
    const missing: string[] = [];

    if (typeof obj.question !== 'string') missing.push('question');
    if (!Array.isArray(obj.options)) missing.push('options');
    if (!Array.isArray(obj.correctAnswers)) missing.push('correctAnswers');

    if (missing.length > 0) {
      warnings.push(`${examId}[${idx}]: missing required fields: ${missing.join(', ')} — skipped.`);
      skipped++;
      return;
    }

    valid.push(item as LegacyQuestion);
  });

  // Id integrity is additive: a missing/duplicate id is a data-integrity problem
  // (study state keys on (examId, id)), but we WARN rather than drop the question
  // so banks not yet processed by scripts/assign-ids.mjs still load.
  for (const issue of findIdIssues(valid, examId)) {
    warnings.push(issue);
  }

  if (warnings.length > 0) {
    console.warn(`[validateExam] ${examId}: ${skipped} question(s) skipped`, warnings);
  }

  return { valid, skipped, warnings };
}

/**
 * Report id-integrity problems for a set of already-shape-valid questions:
 * a missing/non-integer `id`, or an `id` duplicated within the file. Returns a
 * human-readable message per problem (empty array = clean). Used both as a
 * runtime warning source and as the strict CI guard in tests.
 */
export function findIdIssues(questions: LegacyQuestion[], examId: string): string[] {
  const issues: string[] = [];
  const seen = new Map<number, number>(); // id -> first index seen

  questions.forEach((q, idx) => {
    const id = q.id;
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      issues.push(`${examId}[${idx}]: missing or non-integer id (run scripts/assign-ids.mjs).`);
      return;
    }
    if (seen.has(id)) {
      issues.push(`${examId}[${idx}]: duplicate id ${id} (first seen at index ${seen.get(id)}).`);
      return;
    }
    seen.set(id, idx);
  });

  return issues;
}
