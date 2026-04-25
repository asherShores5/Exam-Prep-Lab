"""
parse_sap.py
------------
Parses all SAP-C02 practice question .txt files from Udemy (Neal Davis & Stephane Maarek)
and produces a clean AWS-SAP-C02.json exam bank.

Handles:
  - Single correct answer  : "Correct answer" appears on its own line immediately
                             after the last incorrect option before the correct one
  - Multiple correct answers: "Correct selection" appears on its own line before
                              each correct option (Stephane format)
  - Multi-paragraph question text (scenario + sub-question)

Format observed in the raw files:
  - "Correct answer" / "Correct selection" is appended (no blank line) to the
    preceding option paragraph, so it appears as a line within that paragraph.
  - "Overall explanation" is similarly appended to the last option paragraph.
  - The question text ends at the last line ending with '?' before any options.

Usage:
    python parse_sap.py

Output:
    ../quiz-app/public/exams/AWS-SAP-C02.json
"""

import re
import json
import os
import glob

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
INPUT_GLOB  = os.path.join(SCRIPT_DIR, "../unsorted-data/udemy/SAP/*.txt")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "../quiz-app/public/exams/AWS-SAP-C02.json")

# ── Helpers ────────────────────────────────────────────────────────────────────

def strip_support_blurb(text: str) -> str:
    """Remove the 'For support … thank you.' boilerplate."""
    return re.sub(r'For support.*?thank you\.', '', text, flags=re.IGNORECASE | re.DOTALL).strip()


def parse_file(filepath: str) -> list[dict]:
    """
    Parse a single Udemy practice-test .txt file.

    The raw file uses blank lines between paragraphs, but "Correct answer",
    "Correct selection", and "Overall explanation" are appended (no blank line)
    to the preceding option line.  So we split each question block into
    individual lines and process them sequentially.

    Line-level structure within a question block:
      Line 0:  "Question NSkipped" / "Question NCorrect" etc.
      Lines 1+: question text (may span multiple lines/paragraphs)
               ends at the last line that ends with '?'
      Then:    option lines, interspersed with:
                 "Correct answer"    — next non-empty, non-marker line is correct
                 "Correct selection" — next non-empty, non-marker line is correct
               "Overall explanation" — signals start of explanation
      Then:    explanation lines until "Domain"
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        raw = f.read()

    # Split on "Question N" boundaries (no \b — preceded by newline)
    blocks = re.split(r'(?=Question\s+\d+)', raw)
    blocks = [b for b in blocks if re.match(r'Question\s+\d+', b.strip())]

    questions = []

    for block in blocks:
        # Flatten to individual non-empty lines
        lines = [l.strip() for l in block.split('\n') if l.strip()]

        if len(lines) < 4:
            continue

        # ── Find the question text / options boundary ──────────────────────────
        # The question text ends at the last line ending with '?' before any
        # "Correct answer" / "Correct selection" marker.
        # Find the index of the first marker line.
        first_marker_idx = None
        for idx, line in enumerate(lines):
            if line in ('Correct answer', 'Correct selection'):
                first_marker_idx = idx
                break

        if first_marker_idx is None:
            continue  # no correct-answer marker — skip

        # Among lines[1..first_marker_idx-1], find the last line that looks like
        # question text (ends with '?' or contains a "Select N" instruction).
        # Everything up to and including it is question text.
        # Everything after it (up to first_marker_idx) is pre-marker options.
        candidate = lines[1:first_marker_idx]
        last_q_line = -1
        for idx, line in enumerate(candidate):
            # A line is question text if it ends with '?' or contains a
            # "Select N" / "select two" style instruction (common in multi-answer Qs)
            if line.endswith('?') or re.search(r'\(Select\s+(TWO|THREE|FOUR|\d+)\.?\)', line, re.IGNORECASE):
                last_q_line = idx

        if last_q_line == -1:
            # No question-text marker found — treat first line as question text
            last_q_line = 0

        question_text    = ' '.join(candidate[:last_q_line + 1])
        pre_marker_opts  = candidate[last_q_line + 1:]

        # ── Collect options and correct-answer markers ─────────────────────────
        options      = []
        correct_idxs = []
        explanation  = ""
        next_correct = False

        # Add incorrect options that appeared before the first marker
        for opt in pre_marker_opts:
            options.append(opt)

        # Walk from first_marker_idx onward
        i = first_marker_idx
        while i < len(lines):
            line = lines[i]

            if line in ('Correct answer', 'Correct selection'):
                next_correct = True
                i += 1
                continue

            if line.startswith('Overall explanation'):
                # Collect explanation until "Domain" or end
                expl_parts = []
                after_label = line[len('Overall explanation'):].strip()
                if after_label:
                    expl_parts.append(after_label)
                i += 1
                while i < len(lines) and lines[i] != 'Domain':
                    expl_parts.append(lines[i])
                    i += 1
                explanation = strip_support_blurb(' '.join(expl_parts))
                break

            # Skip metadata / domain lines
            if line == 'Domain' or line.startswith('Question ID:'):
                i += 1
                continue

            # It's an option line
            if next_correct:
                correct_idxs.append(len(options))
                next_correct = False

            options.append(line)
            i += 1

        # ── Validate ───────────────────────────────────────────────────────────
        if len(options) < 2:
            continue

        if not correct_idxs:
            correct_idxs = [0]  # fallback

        questions.append({
            "question":       question_text,
            "options":        options,
            "correctAnswers": correct_idxs,
            "explanation":    explanation,
        })

    return questions


def deduplicate(questions: list[dict]) -> tuple[list[dict], int]:
    """Remove duplicate questions by exact question text."""
    seen  = {}
    dupes = 0
    for q in questions:
        key = q['question']
        if key in seen:
            dupes += 1
        else:
            seen[key] = q
    return list(seen.values()), dupes


def validate(questions: list[dict]) -> list[dict]:
    """
    Validate questions:
      - must have at least 4 options
      - correctAnswers must be valid indices into options
    Prints a report of anything removed.
    """
    valid   = []
    removed = []

    for q in questions:
        opts = q.get('options', [])
        ca   = q.get('correctAnswers', [])

        if len(opts) < 4:
            removed.append({'reason': f'Only {len(opts)} options', 'q': q['question'][:80]})
            continue

        if not ca or any(idx >= len(opts) for idx in ca):
            removed.append({'reason': 'Invalid correctAnswers indices', 'q': q['question'][:80]})
            continue

        valid.append(q)

    if removed:
        print(f"\n  ⚠  Removed {len(removed)} questions during validation:")
        for r in removed:
            print(f"     [{r['reason']}] {r['q']}")

    return valid


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    input_files = sorted(glob.glob(INPUT_GLOB))

    if not input_files:
        print(f"ERROR: No .txt files found matching:\n  {INPUT_GLOB}")
        return

    print(f"Found {len(input_files)} input file(s):")
    all_questions = []

    for fp in input_files:
        parsed = parse_file(fp)
        fname  = os.path.basename(fp)
        print(f"  {fname:45s}  →  {len(parsed):4d} questions parsed")
        all_questions.extend(parsed)

    print(f"\nTotal parsed (before dedup): {len(all_questions)}")

    unique, dup_count = deduplicate(all_questions)
    print(f"Duplicates removed:          {dup_count}")
    print(f"Unique questions:            {len(unique)}")

    validated = validate(unique)
    print(f"After validation:            {len(validated)}")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(validated, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Wrote {len(validated)} questions to:\n  {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    main()
