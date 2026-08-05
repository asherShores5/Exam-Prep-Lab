#!/usr/bin/env python3
"""Extract + aggregate the MLA-C01 Udemy practice-test dumps into one exam bank.

Reads the raw text dumps in unsorted-data/udemy/MLA-C01/ (three source formats:
maarek*, schuler*, CloudForAll*) and emits a single LegacyQuestion[] JSON file
(quiz-app/public/exams/AWS-MLA-C01.json).

The Udemy "Results" page renders the "Correct answer"/"Correct selection" badge
ABOVE its option, so in the dumps the marker line PRECEDES the option it marks.

After running, add the index.json entry and run `npm run assign-ids` in quiz-app/.

    python scrape/mla_c01.py            # build the bank
    python scrape/mla_c01.py --selftest # run the parser self-check
"""
import argparse
import json
import re
import sys
from pathlib import Path

CORRECT_MARKERS = {"Correct answer", "Correct selection"}
# CloudForAll appends this flashcard-promo footer to the explanation; sometimes on its
# own lines, sometimes mid-line in the compact sub-format. "Keep practicing" reliably
# marks its start, so we truncate the explanation there rather than dropping lines.
PROMO = ("Keep practicing", "CloudForAll MLA-C01 Flashcards", "Free flashcards",
         "cloudforall.com.br")
# Same domain, two spellings across sources -> canonicalize so the app groups them.
DOMAIN_ALIASES = {
    "Data Preparation for Machine Learning": "Data Preparation for Machine Learning (ML)",
}
QUESTION_RE = re.compile(r"^Question\s+(\d+)")


def detect_format(name):
    n = name.lower()
    if n.startswith("maarek"):
        return "maarek"
    if n.startswith("schuler"):
        return "schuler"
    if n.startswith("cloudforall"):
        return "cloudforall"
    return None


def split_questions(text):
    """-> [(qnum, [lines])]. Preamble before 'Question 1' is dropped."""
    blocks, cur = [], None
    for ln in text.splitlines():
        m = QUESTION_RE.match(ln.strip())  # matches "Question 1Skipped"
        if m:
            if cur:
                blocks.append(cur)
            cur = (int(m.group(1)), [])
        elif cur is not None:
            cur[1].append(ln)
    if cur:
        blocks.append(cur)
    return blocks


def find_line(lines, target, end=None):
    end = len(lines) if end is None else end
    for i in range(end):
        if lines[i].strip() == target:
            return i
    return None


def extract_domain(lines):
    """Last 'Domain' line -> (domain_value, domain_index)."""
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "Domain":
            for j in range(i + 1, len(lines)):
                if lines[j].strip():
                    return lines[j].strip(), i
            return None, i
    return None, None


def prev_nonempty(lines, i):
    i -= 1
    while i >= 0 and not lines[i].strip():
        i -= 1
    return i


def strip_promo(text):
    """Truncate at the first promo marker (footer can be a whole line or mid-line)."""
    cut = min((i for i in (text.find(s) for s in PROMO) if i != -1), default=-1)
    return (text[:cut] if cut != -1 else text).strip()


def parse_explanation_format(lines, has_overall):
    """schuler / CloudForAll: each option is immediately followed by an 'Explanation' line."""
    domain, dom_idx = extract_domain(lines)
    end = dom_idx if dom_idx is not None else len(lines)
    overall_idx = find_line(lines, "Overall explanation", end)
    opt_end = overall_idx if overall_idx is not None else end
    region = lines[:opt_end]

    expl_idxs = [i for i, l in enumerate(region) if l.strip() == "Explanation"]
    if not expl_idxs:
        return None

    options = []
    for k, e in enumerate(expl_idxs):
        o = prev_nonempty(region, e)               # the option line
        marker = prev_nonempty(region, o)          # marker (if any) above it
        is_correct = marker >= 0 and region[marker].strip() in CORRECT_MARKERS
        # explanation text runs to the next option (or its marker), else region end
        if k + 1 < len(expl_idxs):
            no = prev_nonempty(region, expl_idxs[k + 1])
            stop = no
            pm = prev_nonempty(region, no)
            if pm >= 0 and region[pm].strip() in CORRECT_MARKERS:
                stop = pm
        else:
            stop = len(region)
        expl = "\n".join(x.strip() for x in region[e + 1:stop] if x.strip())
        options.append({"text": region[o].strip(), "correct": is_correct, "expl": expl})

    first_opt = prev_nonempty(region, expl_idxs[0])
    stem_lines = [l.strip() for l in region[:first_opt]
                  if l.strip() and l.strip() not in CORRECT_MARKERS]

    if has_overall and overall_idx is not None:
        overall = "\n\n".join(l.strip() for l in lines[overall_idx + 1:end] if l.strip())
        explanation = strip_promo(overall)
    else:
        explanation = "\n\n".join(o["expl"] for o in options if o["correct"] and o["expl"])

    return _build(stem_lines, options, explanation, domain)


def parse_maarek(lines):
    """maarek: options are blank-line-separated paragraphs; no per-option 'Explanation'."""
    domain, dom_idx = extract_domain(lines)
    end = dom_idx if dom_idx is not None else len(lines)
    overall_idx = find_line(lines, "Overall explanation", end)
    opt_end = overall_idx if overall_idx is not None else end

    # group the option region into paragraphs, carrying the "correct" flag from marker lines
    paras, buff, pending = [], [], False

    def flush():
        nonlocal buff, pending
        if buff:
            paras.append({"text": " ".join(x.strip() for x in buff).strip(),
                          "correct": pending})
            buff, pending = [], False

    for l in lines[:opt_end]:
        s = l.strip()
        if not s:
            flush()
        elif s in CORRECT_MARKERS:
            flush()
            pending = True
        else:
            buff.append(l)
    flush()
    if not paras:
        return None

    # ponytail: split stem/options at the first paragraph containing '?'. Known ceiling:
    # a scenario '?' before the real prompt mis-splits; validation flags odd option counts.
    qi = next((i for i, p in enumerate(paras) if "?" in p["text"]), 0)
    stem_lines = [p["text"] for p in paras[:qi + 1]]
    opts = [{"text": p["text"], "correct": p["correct"]} for p in paras[qi + 1:]]

    if overall_idx is not None:
        explanation = "\n\n".join(l.strip() for l in lines[overall_idx + 1:end] if l.strip())
    else:
        explanation = ""

    return _build(stem_lines, opts, explanation, domain)


def _build(stem_lines, options, explanation, domain):
    q = {
        "question": "\n\n".join(stem_lines).strip(),
        "options": [o["text"] for o in options],
        "correctAnswers": [i for i, o in enumerate(options) if o["correct"]],
        "explanation": explanation.strip(),
    }
    if domain:
        q["domain"] = DOMAIN_ALIASES.get(domain, domain)
    return q


def parse_file(path):
    fmt = detect_format(path.name)
    if fmt is None:
        print(f"skip (unknown format): {path.name}", file=sys.stderr)
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    out, warnings = [], []
    for qnum, lines in split_questions(text):
        try:
            q = parse_maarek(lines) if fmt == "maarek" else \
                parse_explanation_format(lines, has_overall=(fmt == "cloudforall"))
        except Exception as ex:  # noqa: BLE001 - one-off tool, surface & continue
            warnings.append(f"{path.name} Q{qnum}: parse error {ex!r}")
            continue
        if q is None:
            warnings.append(f"{path.name} Q{qnum}: no options found")
            continue
        n, c = len(q["options"]), len(q["correctAnswers"])
        want = 2 if re.search(r"select\s+(two|2)", q["question"], re.I) else \
               3 if re.search(r"select\s+(three|3)", q["question"], re.I) else None
        if not (2 <= n <= 8):
            warnings.append(f"{path.name} Q{qnum}: {n} options (suspicious)")
        if c == 0:
            warnings.append(f"{path.name} Q{qnum}: no correct answer marked")
        elif want and c != want:
            warnings.append(f"{path.name} Q{qnum}: expected {want} correct, got {c}")
        q["_src"] = f"{path.name}#{qnum}"
        out.append(q)
    for w in warnings:
        print("WARN:", w, file=sys.stderr)
    return out


def norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())


def build(indir, outfile):
    files = sorted(p for p in indir.iterdir() if p.is_file())
    allq, seen, dups = [], {}, 0
    for p in files:
        qs = parse_file(p)
        for q in qs:
            key = norm(q["question"])
            if key in seen:
                dups += 1
                continue
            seen[key] = True
            allq.append(q)
        print(f"  {p.name}: {len(qs)} questions", file=sys.stderr)

    for i, q in enumerate(allq, start=1):
        q.pop("_src", None)
        ordered = {"id": i, "question": q["question"], "options": q["options"],
                   "correctAnswers": q["correctAnswers"], "explanation": q["explanation"]}
        if "domain" in q:
            ordered["domain"] = q["domain"]
        allq[i - 1] = ordered

    outfile.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(allq, indent=2, ensure_ascii=False) + "\n"
    with open(outfile, "w", encoding="utf-8", newline="\r\n") as f:  # CRLF per repo convention
        f.write(text)
    print(f"\nWrote {len(allq)} questions to {outfile} (deduped {dups}).", file=sys.stderr)
    return allq


def selftest():
    # marker precedes the option it marks -> "Correct answer" here marks Option B
    maarek = ("Question 1Skipped\n\nA co needs X.\n\nWhich service fits?\n\n"
              "Option A\nCorrect answer\n\nOption B\n\nOption C\n\nOption D\n"
              "Overall explanation\n\nBecause B.\nDomain\nData Preparation\n")
    q = parse_maarek(maarek.splitlines()[2:])  # drop the "Question 1" line like split does
    assert q["options"] == ["Option A", "Option B", "Option C", "Option D"], q["options"]
    assert q["correctAnswers"] == [1], q
    assert q["domain"] == "Data Preparation"
    assert q["question"].endswith("Which service fits?")

    schuler = ("Opt A\nExplanation\n\nwrong A\nCorrect answer\n\nOpt B\nExplanation\n\n"
               "right B\nDomain\nML Model Development\n")
    q = parse_explanation_format(schuler.splitlines(), has_overall=False)
    assert q["options"] == ["Opt A", "Opt B"], q["options"]
    assert q["correctAnswers"] == [1], q
    assert q["explanation"] == "right B", q["explanation"]

    cfa = ("What fits? (Select TWO.)\nCorrect selection\nOpt A\nExplanation\ngood A\n"
           "Opt B\nExplanation\nbad B\nCorrect selection\nOpt C\nExplanation\ngood C\n"
           "Overall explanation\n\nUse A and C.\nKeep practicing junk\nDomain\nX\n")
    q = parse_explanation_format(cfa.splitlines(), has_overall=True)
    assert q["options"] == ["Opt A", "Opt B", "Opt C"], q["options"]
    assert q["correctAnswers"] == [0, 2], q
    assert q["explanation"] == "Use A and C.", q["explanation"]  # promo stripped
    print("selftest OK")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", type=Path,
                    default=root / "unsorted-data" / "udemy" / "MLA-C01")
    ap.add_argument("--out", type=Path,
                    default=root / "quiz-app" / "public" / "exams" / "AWS-MLA-C01.json")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
    else:
        build(a.indir, a.out)
