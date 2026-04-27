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

  if (warnings.length > 0) {
    console.warn(`[validateExam] ${examId}: ${skipped} question(s) skipped`, warnings);
  }

  return { valid, skipped, warnings };
}
