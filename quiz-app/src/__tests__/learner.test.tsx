/**
 * Learner sign-up tests (SPEC §9.1, GLOSSARY "Learner").
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  getLearner,
  createLearner,
  renameLearner,
  normalizeLearnerName,
  learnerNameError,
  LEARNER_NAME_MAX,
} from '../services/learner';
import { StorageService, STORAGE_KEYS } from '../services/storage';
import { LearnerGate } from '../components/learner/LearnerGate';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { ToastProvider } from '../components/ui/toast';
import App from '../App';

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } as Storage;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('learner service', () => {
  it('has no Learner on first visit', () => {
    expect(getLearner()).toBeNull();
  });

  it('creates a Learner with a random id and trimmed name, stored under epl_learner', () => {
    const learner = createLearner('  Ada  ');
    expect(learner.name).toBe('Ada');
    expect(learner.learnerId).toMatch(UUID_RE);
    expect(getLearner()).toEqual(learner);
    expect(JSON.parse(localStorage.getItem('epl_learner')!)).toEqual(learner);
  });

  it('gives each new Learner a different id', () => {
    const a = createLearner('Ada');
    localStorage.clear();
    const b = createLearner('Ada');
    expect(a.learnerId).not.toBe(b.learnerId);
  });

  it('rename keeps the id', () => {
    const original = createLearner('Ada');
    const renamed = renameLearner(' Grace ');
    expect(renamed).toEqual({ learnerId: original.learnerId, name: 'Grace' });
    expect(getLearner()).toEqual(renamed);
  });

  it('rejects names that are empty or longer than 40 chars after trimming', () => {
    expect(LEARNER_NAME_MAX).toBe(40);
    expect(normalizeLearnerName('   ')).toBeNull();
    expect(normalizeLearnerName('a'.repeat(41))).toBeNull();
    expect(normalizeLearnerName(`  ${'a'.repeat(40)}  `)).toBe('a'.repeat(40));
    expect(() => createLearner('')).toThrow();
    createLearner('Ada');
    expect(() => renameLearner('a'.repeat(41))).toThrow();
    expect(getLearner()?.name).toBe('Ada');
  });

  it('strips control characters and collapses whitespace, so the API accepts any name it returns', () => {
    expect(normalizeLearnerName('Pat\n\tSmith')).toBe('Pat Smith');
    expect(normalizeLearnerName('  Ada   \u0000 Lovelace\u2028 ')).toBe('Ada Lovelace');
    expect(normalizeLearnerName('Gr\u0085ace')).toBe('Gr ace');
    expect(normalizeLearnerName('\u0007\u001b')).toBeNull();
    expect(createLearner('Pat\r\nSmith').name).toBe('Pat Smith');
  });

  it('cleans a name saved before names were normalized', () => {
    localStorage.setItem('epl_learner', JSON.stringify({ learnerId: 'abc', name: 'Pat\tSmith' }));
    expect(getLearner()).toEqual({ learnerId: 'abc', name: 'Pat Smith' });
  });

  it('gives one message for an invalid name, and none for a valid one', () => {
    expect(learnerNameError('  ')).toBe('Please enter a name (1-40 characters).');
    expect(learnerNameError('a'.repeat(41))).toBe('Please enter a name (1-40 characters).');
    expect(learnerNameError(' Ada ')).toBeNull();
  });

  it('treats stored data of the wrong shape as no Learner', () => {
    localStorage.setItem('epl_learner', JSON.stringify({ name: 42 }));
    expect(getLearner()).toBeNull();
    localStorage.setItem('epl_learner', '"just a string"');
    expect(getLearner()).toBeNull();
  });

  it('still returns a Learner when storage writes fail', () => {
    vi.stubGlobal('localStorage', {
      ...createLocalStorageMock(),
      setItem: () => { throw new Error('blocked'); },
    });
    const learner = createLearner('Ada');
    expect(learner.name).toBe('Ada');
  });

  it('survives Clear local data so the id never changes', () => {
    const learner = createLearner('Ada');
    StorageService.clearAllData();
    expect(getLearner()).toEqual(learner);
    expect(STORAGE_KEYS.LEARNER).toBe('epl_learner');
  });
});

describe('LearnerGate', () => {
  it('asks for a name before showing its children, then shows them', () => {
    render(<LearnerGate><p>tabs here</p></LearnerGate>);
    expect(screen.queryByText('tabs here')).toBeNull();
    const input = screen.getByLabelText(/what's your name/i);
    const submit = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(submit);
    expect(screen.queryByText('tabs here')).toBeNull();

    fireEvent.change(input, { target: { value: ' Ada ' } });
    fireEvent.click(submit);
    expect(screen.getByText('tabs here')).toBeInTheDocument();
    expect(getLearner()?.name).toBe('Ada');
  });

  it('skips the name screen for a returning Learner', () => {
    createLearner('Ada');
    render(<LearnerGate><p>tabs here</p></LearnerGate>);
    expect(screen.getByText('tabs here')).toBeInTheDocument();
    expect(screen.queryByLabelText(/what's your name/i)).toBeNull();
  });

  it('lets the site work when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      ...createLocalStorageMock(),
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    render(<LearnerGate><p>tabs here</p></LearnerGate>);
    fireEvent.change(screen.getByLabelText(/what's your name/i), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('tabs here')).toBeInTheDocument();
  });
});

describe('Settings name field', () => {
  it('changes the Learner name and keeps the id', () => {
    const original = createLearner('Ada');
    render(<SettingsPanel />);
    const input = screen.getByLabelText(/your name/i) as HTMLInputElement;
    expect(input.value).toBe('Ada');
    fireEvent.change(input, { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save name/i }));
    expect(getLearner()).toEqual({ learnerId: original.learnerId, name: 'Grace' });
  });

  it('refuses an invalid name', () => {
    createLearner('Ada');
    render(<SettingsPanel />);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save name/i }));
    expect(getLearner()?.name).toBe('Ada');
  });
});

describe('App gate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    }));
  });

  function renderApp() {
    return render(<ToastProvider><App /></ToastProvider>);
  }

  it('shows the name screen instead of the app for a new Learner', () => {
    renderApp();
    expect(screen.getByLabelText(/what's your name/i)).toBeInTheDocument();
    expect(screen.queryByText(/select an exam/i)).toBeNull();
  });

  it('shows the app for a returning Learner', () => {
    createLearner('Ada');
    renderApp();
    expect(screen.getByText(/select an exam/i)).toBeInTheDocument();
  });
});
