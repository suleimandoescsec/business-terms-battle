from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "study-data.js"

PAPER_TITLES = {
    "01": "Paper 1: Investigating Small Businesses",
    "02": "Paper 2: Investigating Large Businesses",
}

RESOURCE_TITLES = {
    "IGCSE_Business_Key_Terms_Quiz.pdf": "Key Terms Quiz PDF",
}

NOTE_PREFIXES = (
    "Answer in",
    "Express as",
    "Compare to",
    "Ignore the",
    "Carry forward",
    "Units per",
    "Mark-up",
    "+ = profit",
    "lower = better",
)

MCQ_QUESTION_RE = re.compile(
    r"\((?P<part>[ivx]+)\)\s+(?P<prompt>.*?)\s*\(1\)\s*A\s+(?P<A>.*?)\s+B\s+(?P<B>.*?)\s+C\s+(?P<C>.*?)\s+D\s+(?P<D>.*?)(?=\s+\((?:[ivx]+)\)|\s+\([b-z]\)|\s+At the start|\s+\d+\s+Pearson|\Z)",
    re.S | re.I,
)
NEW_STYLE_BLOCK_RE = re.compile(
    r"Question\s+Number\s+(?P<prompt>.*?)\s+Answer\s+(?:Additional guidance\s+)?Mark\s+(?P<body>.*?)(?=(?:\s+Question\s+Number\s+)|\Z)",
    re.S | re.I,
)
LEGACY_ANSWER_RE = re.compile(
    r"\d+\([a-z]\)\s*\((?P<part>[ivx]+)\)\s+AO\d\s+1\s+mark\s+(?P<letter>[A-D])\s+(?P<text>.*?)(?=\(\d+\)|Question\s+number|Question\s+Number|$)",
    re.S | re.I,
)


def clean_ws(value: str) -> str:
    value = re.sub(r"\*[A-Z0-9]+\*.*$", "", value)
    value = re.sub(r"Turn over\s+\d+$", "", value, flags=re.I)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\b([BCDEFGHJKLMNOPQRSTUVWXYZ])\s([a-z]{2,})\b", r"\1\2", value)
    return value


def clean_option_text(value: str) -> str:
    value = clean_ws(value)
    value = re.sub(
        r"\b((?:Tks|MYR|USD|£|%|rupees|units|workers|employees|items|days|weeks|months|years))\s+[A-Z].*$",
        r"\1",
        value,
    )
    return clean_ws(value)


def normalize_pdf_name(name: str) -> str:
    return re.sub(r" \(\d+\)(?=\.pdf$)", "", name)


def read_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def prefer_path(existing: Path, candidate: Path) -> Path:
    existing_rank = (" (" in existing.name, len(existing.name), existing.name)
    candidate_rank = (" (" in candidate.name, len(candidate.name), candidate.name)
    return candidate if candidate_rank < existing_rank else existing


def dedupe_pdf_paths(paths: Iterable[Path]) -> dict[str, Path]:
    deduped: dict[str, Path] = {}
    for path in paths:
        normalized = normalize_pdf_name(path.name)
        if normalized in deduped:
            deduped[normalized] = prefer_path(deduped[normalized], path)
        else:
            deduped[normalized] = path
    return deduped


def is_note_line(line: str) -> bool:
    return line.startswith(NOTE_PREFIXES)


def parse_formula_cards(text: str) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    section = "Formulae"
    started = False
    lines = [clean_ws(line) for line in text.splitlines()]
    index = 0

    while index < len(lines):
        line = lines[index]
        if not line:
            index += 1
            continue
        if line.startswith("★ EXAM TIPS"):
            break
        if line.startswith("■"):
            section = re.sub(r"^■\s*\d+\s*·\s*", "", line)
            started = True
            index += 1
            continue
        if not started:
            index += 1
            continue

        name = line
        index += 1
        formula_parts: list[str] = []
        while index < len(lines):
            current = lines[index]
            if not current:
                index += 1
                continue
            if current.startswith("■") or current.startswith("★ EXAM TIPS") or is_note_line(current):
                break
            formula_parts.append(current)
            index += 1

        note_parts: list[str] = []
        while index < len(lines):
            current = lines[index]
            if not current:
                index += 1
                continue
            if current.startswith("■") or current.startswith("★ EXAM TIPS"):
                break
            if note_parts and not is_note_line(current):
                break
            if is_note_line(current) or note_parts:
                note_parts.append(current)
                index += 1
                continue
            break

        if formula_parts:
            cards.append(
                {
                    "section": section,
                    "name": name,
                    "formula": clean_ws(" ".join(formula_parts)),
                    "notes": clean_ws(" ".join(note_parts)),
                }
            )

    return cards


def parse_formula_exam_tips(text: str) -> list[str]:
    match = re.search(r"★ EXAM TIPS:\s*(.*?)(?:Edexcel / Pearson GCSE Business|$)", text, re.S)
    if not match:
        return []

    raw = clean_ws(match.group(1))
    tips = [clean_ws(chunk) for chunk in re.split(r"\(\d+\)", raw) if clean_ws(chunk)]
    return tips


def parse_new_style_mark_scheme_items(text: str, source_label: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []

    for match in NEW_STYLE_BLOCK_RE.finditer(text):
        prompt = clean_ws(match.group("prompt"))
        body = match.group("body")
        question_match = re.search(r"(\d+\s*\([a-z]\)(?:\s*\([ivx]+\))?)", body, re.I)
        question_id = clean_ws(question_match.group(1)) if question_match else source_label
        marks_match = re.search(r"(\d+)\s*marks?", body, re.I)
        marks = int(marks_match.group(1)) if marks_match else 1
        body_clean = clean_ws(body)
        prompt_lower = prompt.lower()

        if "the only correct answer is" in body_lower(body_clean):
            answer_match = re.search(
                r"The only correct answer is\s+([A-D])\s+[–-]\s+(.*?)(?=\s+[A-D]\s+[–-]\s+this is not correct|\s*\(\d+\)|$)",
                body,
                re.S | re.I,
            )
            if answer_match:
                items.append(
                    {
                        "type": "mcq",
                        "source": source_label,
                        "question_id": question_id,
                        "prompt": prompt,
                        "marks": marks,
                        "answer_letter": answer_match.group(1).upper(),
                        "answer_text": clean_ws(answer_match.group(2)),
                    }
                )
            continue

        if prompt_lower.startswith("define the term"):
            items.append(
                {
                    "type": "definition",
                    "source": source_label,
                    "question_id": question_id,
                    "prompt": prompt,
                    "marks": marks,
                    "mark_scheme": extract_mark_scheme_summary(body),
                }
            )
            continue

        if prompt_lower.startswith("calculate"):
            answer_text = ""
            answer_match = re.findall(r"=\s*([A-Za-z£$0-9.,% -]+)\s*\(\d+\)", body)
            if answer_match:
                answer_text = clean_ws(answer_match[-1])
            working_lines = [
                clean_ws(line)
                for line in body.splitlines()
                if clean_ws(line) and any(token in line for token in ("=", "x", "×", "÷", "+", "-", "/"))
            ]
            items.append(
                {
                    "type": "calculation",
                    "source": source_label,
                    "question_id": question_id,
                    "prompt": prompt,
                    "marks": marks,
                    "working": clean_ws(" ".join(working_lines)),
                    "answer_text": answer_text,
                    "mark_scheme": extract_mark_scheme_summary(body),
                }
            )
            continue

        if marks <= 3 and prompt_lower.startswith(("state", "explain", "give", "identify")):
            items.append(
                {
                    "type": "short_answer",
                    "source": source_label,
                    "question_id": question_id,
                    "prompt": prompt,
                    "marks": marks,
                    "mark_scheme": extract_mark_scheme_summary(body),
                }
            )

    return items


def body_lower(text: str) -> str:
    return text.lower().replace("–", "-")


def extract_mark_scheme_summary(body: str) -> str:
    body = clean_ws(body)
    # Remove leading question identifiers and AO markers (e.g., "1 (b) AO1 - 1 mark")
    body = re.sub(r"^\d+\s*\([a-z]\)(?:\s*\([ivx]+\))?\s*AO\d+\s*-\s*\d+\s*marks?\s*", "", body, flags=re.I)
    # Remove leading "Award X marks for..." or "Mark scheme" fluff
    body = re.sub(r"^(?:Award\s+\d+\s+marks?\s+for.*?|Mark\s+scheme)\.?\s*", "", body, flags=re.I)
    
    # Restore spacing for readability in UI
    body = body.replace("•", "\n• ")
    body = re.sub(r"\s+(AO[1-4]\s*(?:=|-|–)?\s*\d+\s*marks?)", r"\n\n\1\n", body, flags=re.I)
    body = re.sub(r"\s+(Level\s+\d+\s+\d+-\d+\s*(?:marks?)?)", r"\n\n\1\n", body, flags=re.I)
    body = re.sub(r"\s+(Indicative content)", r"\n\n\1\n", body, flags=re.I)
    
    return body.strip()


def parse_question_paper_mcqs(text: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for match in MCQ_QUESTION_RE.finditer(text):
        items.append(
            {
                "prompt": clean_ws(match.group("prompt")),
                "options": [
                    clean_option_text(match.group("A")),
                    clean_option_text(match.group("B")),
                    clean_option_text(match.group("C")),
                    clean_option_text(match.group("D")),
                ],
            }
        )
    return items


def parse_legacy_mcq_items(question_text: str, mark_scheme_text: str, source_label: str) -> list[dict[str, object]]:
    questions = parse_question_paper_mcqs(question_text)
    answers = []
    for match in LEGACY_ANSWER_RE.finditer(mark_scheme_text):
        answers.append(
            {
                "answer_letter": match.group("letter").upper(),
                "answer_text": clean_ws(match.group("text")),
            }
        )

    items: list[dict[str, object]] = []
    for question, answer in zip(questions, answers):
        answer_index = ord(answer["answer_letter"]) - ord("A")
        items.append(
            {
                "type": "mcq",
                "source": source_label,
                "question_id": source_label,
                "prompt": question["prompt"],
                "options": question["options"],
                "marks": 1,
                "answer_letter": answer["answer_letter"],
                "answer_text": answer["answer_text"],
                "correct_option": question["options"][answer_index],
            }
        )
    return items


def parse_filename_metadata(normalized_name: str) -> dict[str, str]:
    if normalized_name.startswith("Edexcel_Year11_Business_Formulas"):
        return {
            "kind": "resource",
            "title": "Year 11 Formula Sheet",
            "category": "Formula Sheet",
        }

    if normalized_name in RESOURCE_TITLES:
        return {
            "kind": "resource",
            "title": RESOURCE_TITLES[normalized_name],
            "category": "Worksheet",
        }

    match = re.match(r"4BS1_(?P<paper>\d{2})(?P<region>R?)_(?P<session>SAM|\d{4})_(?P<asset>MS|QU)\.pdf", normalized_name)
    if not match:
        return {
            "kind": "resource",
            "title": normalized_name.removesuffix(".pdf"),
            "category": "PDF",
        }

    paper = match.group("paper")
    region = match.group("region")
    session = match.group("session")
    asset = match.group("asset")
    paper_code = f"4BS1/{paper}"
    title = f"{paper_code} · {format_session_label(session)}"
    if region == "R":
        title = f"{title} · Regional"

    return {
        "kind": "paper",
        "group_id": f"4BS1_{paper}{region}_{session}",
        "title": title,
        "subtitle": PAPER_TITLES.get(paper, paper_code),
        "asset_label": "Mark Scheme" if asset == "MS" else "Question Paper",
        "session": session,
        "paper_code": paper_code,
    }


def format_session_label(session: str) -> str:
    if session == "SAM":
        return "Sample Assessment"

    month_code = session[:2]
    year_code = session[2:]
    month = {"01": "January", "05": "May", "06": "June", "10": "October", "11": "November"}.get(month_code, month_code)
    return f"{month} 20{year_code}"


def build_paper_collections(deduped_paths: dict[str, Path]) -> list[dict[str, object]]:
    collections: dict[str, dict[str, object]] = {}
    resource_items: list[dict[str, object]] = []

    for normalized_name, path in sorted(deduped_paths.items()):
        metadata = parse_filename_metadata(normalized_name)
        url = path.name
        if metadata["kind"] == "paper":
            group = collections.setdefault(
                metadata["group_id"],
                {
                    "id": metadata["group_id"],
                    "title": metadata["title"],
                    "subtitle": metadata["subtitle"],
                    "paper_code": metadata["paper_code"],
                    "session": metadata["session"],
                    "assets": [],
                },
            )
            group["assets"].append({"label": metadata["asset_label"], "url": url})
        else:
            resource_items.append(
                {
                    "title": metadata["title"],
                    "subtitle": metadata["category"],
                    "assets": [{"label": "Open PDF", "url": url}],
                }
            )

    ordered_papers = sorted(
        collections.values(),
        key=lambda item: session_sort_key(str(item["session"])),
        reverse=True,
    )
    return ordered_papers + resource_items


def session_sort_key(session: str) -> tuple[int, int]:
    if session == "SAM":
        return (0, 0)
    try:
        return (int(session[2:]), int(session[:2]))
    except ValueError:
        return (0, 0)


def merge_new_style_mcqs(mark_scheme_items: list[dict[str, object]], question_items: list[dict[str, object]]) -> list[dict[str, object]]:
    merged: list[dict[str, object]] = []
    question_index = 0

    for item in mark_scheme_items:
        if item["type"] != "mcq":
            merged.append(item)
            continue
        if question_index >= len(question_items):
            continue
        question = question_items[question_index]
        question_index += 1
        answer_letter = str(item["answer_letter"])
        answer_index = ord(answer_letter) - ord("A")
        merged.append(
            {
                **item,
                "prompt": question["prompt"],
                "options": question["options"],
                "correct_option": question["options"][answer_index],
            }
        )

    return merged


def build_paper_drills(deduped_paths: dict[str, Path]) -> list[dict[str, object]]:
    groups: dict[str, dict[str, Path]] = {}
    for normalized_name, path in deduped_paths.items():
        if normalized_name.startswith("4BS1_") and normalized_name.endswith(".pdf"):
            group_key = normalized_name.rsplit("_", 1)[0]
            groups.setdefault(group_key, {})[normalized_name.rsplit("_", 1)[1].removesuffix(".pdf")] = path

    drill_items: list[dict[str, object]] = []
    seen: set[tuple[str, str, str]] = set()

    for group_key, files in groups.items():
        metadata = parse_filename_metadata(f"{group_key}_MS.pdf")
        source_label = metadata.get("title", group_key)

        if "MS" in files and "QU" in files:
            ms_text = read_pdf_text(files["MS"])
            qu_text = read_pdf_text(files["QU"])

            if "SAM" in group_key:
                items = parse_legacy_mcq_items(qu_text, ms_text, source_label=source_label)
            else:
                mark_scheme_items = parse_new_style_mark_scheme_items(ms_text, source_label=source_label)
                question_items = parse_question_paper_mcqs(qu_text)
                items = merge_new_style_mcqs(mark_scheme_items, question_items)

            for item in items:
                key = (str(item["type"]), str(item["source"]), str(item["prompt"]))
                if key in seen:
                    continue
                seen.add(key)
                drill_items.append(item)
        elif "MS" in files:
            ms_text = read_pdf_text(files["MS"])
            items = [item for item in parse_new_style_mark_scheme_items(ms_text, source_label=source_label) if item["type"] != "mcq"]
            for item in items:
                key = (str(item["type"]), str(item["source"]), str(item["prompt"]))
                if key in seen:
                    continue
                seen.add(key)
                drill_items.append(item)

    return drill_items


def build_examiner_playbook(formula_tips: list[str]) -> list[dict[str, str]]:
    items = [
        {
            "title": "Show Working",
            "body": "Method marks are available on calculation questions, so write each substitution step before the final answer.",
        },
        {
            "title": "Use The Correct Unit",
            "body": "Attach the unit every time: £ for money, % for ratios and growth, and units/items where output is counted.",
        },
        {
            "title": "Use Business Context",
            "body": "For explain and analyse questions, connect the theory back to the business in the question instead of giving generic textbook points.",
        },
        {
            "title": "Define Precisely",
            "body": "One-mark definition questions reward exact business language, so keep the answer sharp and avoid vague everyday wording.",
        },
        {
            "title": "Separate Profit From Cash",
            "body": "The papers regularly test the difference: a business can make profit but still fail if it runs out of cash.",
        },
    ]

    for tip in formula_tips:
        items.append({"title": "Exam Tip", "body": tip})

    return items


def build_dataset(root: Path = ROOT) -> dict[str, object]:
    pdf_paths = sorted(root.glob("*.pdf"))
    deduped_paths = dedupe_pdf_paths(pdf_paths)

    formula_path = next(
        (path for name, path in deduped_paths.items() if name.startswith("Edexcel_Year11_Business_Formulas")),
        None,
    )
    formula_text = read_pdf_text(formula_path) if formula_path else ""
    formula_cards = parse_formula_cards(formula_text) if formula_text else []
    formula_tips = parse_formula_exam_tips(formula_text) if formula_text else []

    dataset = {
        "generatedAt": OUTPUT_PATH.stat().st_mtime if OUTPUT_PATH.exists() else None,
        "formulas": formula_cards,
        "paperCollections": build_paper_collections(deduped_paths),
        "paperDrills": build_paper_drills(deduped_paths),
        "examinerPlaybook": build_examiner_playbook(formula_tips),
    }
    return dataset


def write_study_data(dataset: dict[str, object], output_path: Path = OUTPUT_PATH) -> None:
    payload = json.dumps(dataset, ensure_ascii=False, indent=2)
    output_path.write_text(f"window.STUDY_DATA = {payload};\n", encoding="utf-8")


def main() -> None:
    dataset = build_dataset()
    write_study_data(dataset)
    print(f"Wrote {OUTPUT_PATH.name} with {len(dataset['formulas'])} formulas and {len(dataset['paperDrills'])} drill items.")


if __name__ == "__main__":
    main()
