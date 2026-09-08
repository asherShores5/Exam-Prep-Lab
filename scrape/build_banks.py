#!/usr/bin/env python3
"""Convert the Udemy practice-test dumps into LegacyQuestion[] exam banks.

Generalizes scrape/mla_c01.py to the four newly-uploaded exams. Each exam's raw
dumps live under unsorted-data/udemy/<DIR>/ and use one of two source layouts,
selected per file by its filename prefix:

  * "paragraph"   (davis*, maarek*): options are blank-line-separated paragraphs;
                  no per-option "Explanation"; the whole rationale is under
                  "Overall explanation"; a trailing "Domain" tags the question.
  * "explanation" (kane*): each option is immediately followed by an "Explanation"
                  line; single-line options, no blank separators; ends with a "Domain".
  * "explanation_para" (krausen*, zora*): same "Explanation"-after-each-option layout,
                  but options are blank-line-separated paragraphs and MAY be multi-line
                  HCL code blocks; the question ends with "Overall explanation" then a
                  "Domain" or "Resources" marker.

In every layout the Udemy "Results" page renders the "Correct answer" / "Correct
selection" badge ABOVE its option, so in the dumps the marker line PRECEDES the
option it marks. Multi-answer questions use "Correct selection" (one per correct
option).

    python scrape/build_banks.py                 # build all four banks
    python scrape/build_banks.py --exam DVA-C02  # build one
    python scrape/build_banks.py --selftest      # parser self-check

After running, ensure the index.json entries exist and run `npm run assign-ids`
(idempotent) in quiz-app/ -- this script already emits sequential ids, but the
check keeps CI honest.
"""
import argparse
import json
import re
import sys
from pathlib import Path

CORRECT_MARKERS = {"Correct answer", "Correct selection"}
# Standalone section headers that terminate a question's option/explanation region
# in the "explanation" layout. "Domain" also carries the (optional) domain value.
SECTION_MARKERS = {"Domain", "Resources"}
QUESTION_RE = re.compile(r"^Question\s+(\d+)")

ROOT = Path(__file__).resolve().parent.parent
UDEMY = ROOT / "unsorted-data" / "udemy"
EXAMS_DIR = ROOT / "quiz-app" / "public" / "exams"

# Per-exam build registry. `prefixes` maps a source-file name prefix to its layout.
EXAMS = {
    "AIB-C01": {
        "indir": UDEMY / "AIB-C01",
        "out": EXAMS_DIR / "AWS-AIB-C01.json",
        "prefixes": {"kane": "explanation"},
    },
    "DVA-C02": {
        "indir": UDEMY / "DVA-C02",
        "out": EXAMS_DIR / "AWS-DVA-C02.json",
        "prefixes": {"davis": "paragraph", "maarek": "paragraph"},
    },
    "SOA-C03": {
        "indir": UDEMY / "SOA-C03",
        "out": EXAMS_DIR / "AWS-SOA-C03.json",
        "prefixes": {"davis": "paragraph", "maarek": "paragraph"},
    },
    "Terraform-Associate-004": {
        "indir": UDEMY / "Terraform-Associate-004",
        "out": EXAMS_DIR / "Terraform-Associate-004.json",
        "prefixes": {"krausen": "explanation_para", "zora": "explanation_para"},
    },
}


def detect_format(name, prefixes):
    n = name.lower()
    for prefix, fmt in prefixes.items():
        if n.startswith(prefix):
            return fmt
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


def find_section_end(lines):
    """First standalone Domain/Resources line -> index (region terminator), else len."""
    for i, l in enumerate(lines):
        if l.strip() in SECTION_MARKERS:
            return i
    return len(lines)


def extract_domain(lines):
    """Last standalone 'Domain' line -> the following non-empty value, else None."""
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "Domain":
            for j in range(i + 1, len(lines)):
                if lines[j].strip():
                    return lines[j].strip()
            return None
    return None


def prev_nonempty(lines, i):
    i -= 1
    while i >= 0 and not lines[i].strip():
        i -= 1
    return i


def group_paras(lines):
    """Blank-line-separated paragraphs; each keeps its internal newlines (preserves
    multi-line HCL/JSON code blocks). Returns a list of paragraph strings."""
    paras, buff = [], []
    for l in lines:
        if l.strip():
            buff.append(l.rstrip())
        elif buff:
            paras.append("\n".join(buff))
            buff = []
    if buff:
        paras.append("\n".join(buff))
    return [p for p in paras if p.strip()]


def parse_explanation_format(lines):
    """kane / krausen / zora: each option is immediately followed by 'Explanation'."""
    section_end = find_section_end(lines)
    overall_idx = find_line(lines, "Overall explanation", section_end)
    opt_end = overall_idx if overall_idx is not None else section_end
    region = lines[:opt_end]

    expl_idxs = [i for i, l in enumerate(region) if l.strip() == "Explanation"]
    if not expl_idxs:
        return None

    options = []
    for e in expl_idxs:
        o = prev_nonempty(region, e)               # the option line
        marker = prev_nonempty(region, o)          # marker (if any) above it
        is_correct = marker >= 0 and region[marker].strip() in CORRECT_MARKERS
        options.append({"text": region[o].strip(), "correct": is_correct})

    first_opt = prev_nonempty(region, expl_idxs[0])
    stem_lines = [l.strip() for l in region[:first_opt]
                  if l.strip() and l.strip() not in CORRECT_MARKERS]

    if overall_idx is not None:
        explanation = "\n\n".join(l.strip() for l in lines[overall_idx + 1:section_end]
                                  if l.strip())
    else:
        explanation = ""

    return _build(stem_lines, options, explanation, extract_domain(lines))


def parse_explanation_para(lines):
    """krausen / zora: options are blank-line-separated paragraphs (possibly multi-line
    HCL code) each terminated by an 'Explanation' line. The 'Correct answer'/'Correct
    selection' badge is a standalone line somewhere in the option's segment; blank-line
    placement around it is inconsistent, so correctness is detected by scanning the
    whole segment for a marker line rather than by relative position."""
    section_end = find_section_end(lines)
    overall_idx = find_line(lines, "Overall explanation", section_end)
    opt_end = overall_idx if overall_idx is not None else section_end
    region = lines[:opt_end]

    expl_idxs = [i for i, l in enumerate(region) if l.strip() == "Explanation"]
    if not expl_idxs:
        # Some zora questions use the paragraph layout (no per-option "Explanation").
        return parse_paragraph_format(lines)

    options, stem_paras, lo = [], [], 0
    for k, e in enumerate(expl_idxs):
        seg = region[lo:e]
        correct = any(l.strip() in CORRECT_MARKERS for l in seg)
        paras = group_paras([l for l in seg if l.strip() not in CORRECT_MARKERS])
        if not paras:
            lo = e + 1
            continue
        if k == 0:
            # stem = all but the last paragraph; option = the last paragraph
            stem_paras = paras[:-1]
            opt_paras = paras[-1:]
        else:
            # first paragraph is the previous option's explanation; the rest is this
            # option (a multi-paragraph tail keeps multi-line code intact)
            opt_paras = paras[1:] if len(paras) > 1 else paras
        options.append({"text": "\n\n".join(opt_paras).strip("\n"), "correct": correct})
        lo = e + 1

    explanation = ""
    if overall_idx is not None:
        explanation = "\n\n".join(l.strip() for l in lines[overall_idx + 1:section_end]
                                  if l.strip())

    return _build(stem_paras, options, explanation, extract_domain(lines))


def parse_paragraph_format(lines):
    """davis / maarek: options are blank-line-separated paragraphs; no per-option
    'Explanation'. Rationale is under 'Overall explanation'."""
    # Domain (if any) terminates the explanation; else it runs to the block end.
    dom_idx = None
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "Domain":
            dom_idx = i
            break
    end = dom_idx if dom_idx is not None else len(lines)
    overall_idx = find_line(lines, "Overall explanation", end)
    opt_end = overall_idx if overall_idx is not None else end

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

    # split stem/options at the first paragraph containing '?'. Known ceiling: a
    # scenario '?' before the real prompt mis-splits; validation flags odd counts.
    qi = next((i for i, p in enumerate(paras) if "?" in p["text"]), 0)
    stem_lines = [p["text"] for p in paras[:qi + 1]]
    opts = [{"text": p["text"], "correct": p["correct"]} for p in paras[qi + 1:]]

    if overall_idx is not None:
        explanation = "\n\n".join(l.strip() for l in lines[overall_idx + 1:end] if l.strip())
    else:
        explanation = ""

    return _build(stem_lines, opts, explanation, extract_domain(lines))


def _build(stem_lines, options, explanation, domain):
    q = {
        "question": "\n\n".join(stem_lines).strip(),
        "options": [o["text"] for o in options],
        "correctAnswers": [i for i, o in enumerate(options) if o["correct"]],
        "explanation": explanation.strip(),
    }
    if domain:
        q["domain"] = domain
    return q


def parse_file(path, prefixes):
    fmt = detect_format(path.name, prefixes)
    if fmt is None:
        print(f"skip (unknown format): {path.name}", file=sys.stderr)
        return [], []
    text = path.read_text(encoding="utf-8", errors="replace")
    out, warnings = [], []
    for qnum, lines in split_questions(text):
        try:
            if fmt == "paragraph":
                q = parse_paragraph_format(lines)
            elif fmt == "explanation_para":
                q = parse_explanation_para(lines)
            else:
                q = parse_explanation_format(lines)
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
    return out, warnings


def norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())


def build(indir, outfile, prefixes):
    files = sorted(p for p in indir.iterdir() if p.is_file())
    allq, seen, dups, all_warn, dropped = [], {}, 0, [], 0
    for p in files:
        qs, warnings = parse_file(p, prefixes)
        all_warn.extend(warnings)
        kept = 0
        for q in qs:
            n, c = len(q["options"]), len(q["correctAnswers"])
            # Structural sanity: drop unusable questions (code/JSON-answer items whose
            # multi-line answers explode into pseudo-options, or items with no marked
            # correct answer) rather than ship them. Rare; reported below.
            if not (2 <= n <= 8) or c == 0:
                dropped += 1
                continue
            key = norm(q["question"])
            if not key or key in seen:
                dups += 1
                continue
            seen[key] = True
            allq.append(q)
            kept += 1
        print(f"  {p.name}: {len(qs)} parsed, {kept} kept", file=sys.stderr)

    for i, q in enumerate(allq, start=1):
        q.pop("_src", None)
        ordered = {"id": i, "question": q["question"], "options": q["options"],
                   "correctAnswers": q["correctAnswers"], "explanation": q["explanation"]}
        if "domain" in q:
            ordered["domain"] = q["domain"]
        allq[i - 1] = ordered

    outfile.parent.mkdir(parents=True, exist_ok=True)
    # Match scripts/assign-ids.mjs exactly: 2-space JSON, CRLF, no trailing newline.
    text = json.dumps(allq, indent=2, ensure_ascii=False).replace("\n", "\r\n")
    outfile.write_bytes(text.encode("utf-8"))

    print(f"\n{outfile.name}: wrote {len(allq)} questions "
          f"(deduped {dups}, dropped {dropped} invalid, {len(all_warn)} parse warnings).",
          file=sys.stderr)
    for w in all_warn[:15]:
        print("  WARN:", w, file=sys.stderr)
    if len(all_warn) > 15:
        print(f"  ... {len(all_warn) - 15} more warnings", file=sys.stderr)
    return allq


def selftest():
    # marker precedes the option it marks -> "Correct answer" here marks Option B
    para = ("A co needs X.\n\nWhich service fits?\n\n"
            "Option A\nCorrect answer\n\nOption B\n\nOption C\n\nOption D\n"
            "Overall explanation\n\nBecause B.\nDomain\nData Preparation\n")
    q = parse_paragraph_format(para.splitlines())
    assert q["options"] == ["Option A", "Option B", "Option C", "Option D"], q["options"]
    assert q["correctAnswers"] == [1], q
    assert q["domain"] == "Data Preparation", q
    assert q["question"].endswith("Which service fits?")
    assert q["explanation"] == "Because B.", q["explanation"]

    # explanation layout, single-answer, terminated by Domain (kane-style)
    kane = ("Which approach?\nCorrect answer\nOpt A\nExplanation\ngood A\n"
            "Opt B\nExplanation\nbad B\nOverall explanation\n\nUse A.\n"
            "Domain\nContent Domain 4\n")
    q = parse_explanation_format(kane.splitlines())
    assert q["options"] == ["Opt A", "Opt B"], q["options"]
    assert q["correctAnswers"] == [0], q
    assert q["explanation"] == "Use A.", q["explanation"]
    assert q["domain"] == "Content Domain 4", q

    # explanation layout, multi-answer, terminated by Resources (terraform-style)
    tf = ("Which TWO?\nCorrect selection\nOpt A\nExplanation\ngood A\n"
          "Opt B\nExplanation\nbad B\nCorrect selection\nOpt C\nExplanation\ngood C\n"
          "Overall explanation\n\nA and C.\nResources\nhttps://example.com\n")
    q = parse_explanation_format(tf.splitlines())
    assert q["options"] == ["Opt A", "Opt B", "Opt C"], q["options"]
    assert q["correctAnswers"] == [0, 2], q
    assert q["explanation"] == "A and C.", q["explanation"]  # Resources URL excluded
    assert "domain" not in q, q

    # explanation_para layout: multi-line HCL code-block options, marker adjacent to
    # the stem (no blank before), single-answer, terminated by Resources+Domain.
    tf_code = (
        "Which variable type fits?\n"
        "Correct answer\n"
        "\n"
        "    variable \"image\" {\n"
        "      type = map(string)\n"
        "    }\n"
        "\n"
        "Explanation\n"
        "\n"
        "map(string) is ideal for key-value lookups.\n"
        "\n"
        "    variable \"image\" {\n"
        "      type = list(string)\n"
        "    }\n"
        "\n"
        "Explanation\n"
        "\n"
        "A list only stores ordered values.\n"
        "Overall explanation\n"
        "\n"
        "Use map(string).\n"
        "Resources\n"
        "Domain\n"
        "Objective 4 - Terraform Configuration\n"
    )
    q = parse_explanation_para(tf_code.splitlines())
    assert q["options"] == [
        '    variable "image" {\n      type = map(string)\n    }',
        '    variable "image" {\n      type = list(string)\n    }',
    ], q["options"]
    assert q["correctAnswers"] == [0], q
    assert q["question"] == "Which variable type fits?", q["question"]
    assert q["explanation"] == "Use map(string).", q["explanation"]
    assert q["domain"] == "Objective 4 - Terraform Configuration", q

    # explanation_para, multi-answer via "Correct selection" on two options
    tf_multi = (
        "Which TWO are true?\n"
        "Correct selection\n\nAlpha\nExplanation\n\nbecause alpha\n\n"
        "Beta\nExplanation\n\nnot beta\n\n"
        "Correct selection\n\nGamma\nExplanation\n\nbecause gamma\n"
        "Overall explanation\n\nAlpha and Gamma.\nResources\n"
    )
    q = parse_explanation_para(tf_multi.splitlines())
    assert q["options"] == ["Alpha", "Beta", "Gamma"], q["options"]
    assert q["correctAnswers"] == [0, 2], q
    assert q["question"] == "Which TWO are true?", q["question"]
    print("selftest OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--exam", choices=list(EXAMS), help="build a single exam (default: all)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
    else:
        targets = [a.exam] if a.exam else list(EXAMS)
        for name in targets:
            cfg = EXAMS[name]
            print(f"=== {name} ===", file=sys.stderr)
            build(cfg["indir"], cfg["out"], cfg["prefixes"])
