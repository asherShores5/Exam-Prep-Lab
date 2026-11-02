import type { LegacyQuestion } from '../types/index';
import { StorageService } from './storage';

export interface TagAssignment {
  examId: string;
  questionKey: string;
  tags: string[];
}

function isTagAssignment(v: unknown): v is TagAssignment {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return typeof a.examId === 'string'
    && typeof a.questionKey === 'string'
    && Array.isArray(a.tags)
    && a.tags.every(t => typeof t === 'string');
}

function readStore(): TagAssignment[] {
  return StorageService.getQuestionTags().filter(isTagAssignment);
}

function writeStore(assignments: TagAssignment[]): void {
  StorageService.saveQuestionTags(assignments);
}

function findOrCreate(
  store: TagAssignment[],
  examId: string,
  questionKey: string,
): TagAssignment {
  let entry = store.find(a => a.examId === examId && a.questionKey === questionKey);
  if (!entry) {
    entry = { examId, questionKey, tags: [] };
    store.push(entry);
  }
  return entry;
}

export function getTags(examId: string, questionKey: string): string[] {
  const store = readStore();
  const entry = store.find(a => a.examId === examId && a.questionKey === questionKey);
  return entry?.tags ?? [];
}

export function addTag(examId: string, questionKey: string, tag: string): void {
  const store = readStore();
  const entry = findOrCreate(store, examId, questionKey);
  if (!entry.tags.includes(tag)) {
    entry.tags.push(tag);
    writeStore(store);
  }
}

export function removeTag(examId: string, questionKey: string, tag: string): void {
  const store = readStore();
  const entry = store.find(a => a.examId === examId && a.questionKey === questionKey);
  if (!entry) return;
  entry.tags = entry.tags.filter(t => t !== tag);
  if (entry.tags.length === 0) {
    const idx = store.indexOf(entry);
    store.splice(idx, 1);
  }
  writeStore(store);
}

export function getAllTagsForExam(examId: string): string[] {
  const store = readStore();
  const tags = new Set<string>();
  store.filter(a => a.examId === examId).forEach(a => a.tags.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

export function filterByTag(
  questions: LegacyQuestion[],
  examId: string,
  tag: string,
): LegacyQuestion[] {
  const store = readStore();
  const tagged = new Set(
    store
      .filter(a => a.examId === examId && a.tags.includes(tag))
      .map(a => a.questionKey),
  );
  return questions.filter(q => tagged.has(q.question));
}
