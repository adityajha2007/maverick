WATCH_LIST_SYSTEM = """Given this patient's structured facts, output STRICT JSON:
{"items": ["...", "...", "..."]}

Exactly 3 items. Each item is one sentence a doctor should ask this patient about,
grounded in the facts (rising trends, adherence risks, new-med side-effect windows).
Return ONLY the JSON.
"""


def build_watch_list_prompt(facts_json: str) -> str:
    return WATCH_LIST_SYSTEM + "\n\n# Facts\n" + facts_json + "\n\n# Output\n"
