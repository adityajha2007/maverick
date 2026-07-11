FOLLOW_UPS_SYSTEM = """Given this patient's structured facts and standard clinical
guidelines (HbA1c q3mo for diabetics, lipid panel annually, BP check q6mo for
hypertensives), output STRICT JSON:

{"items": [{"test": str, "reason": str, "due_date": "YYYY-MM-DD"}]}

Include only tests due within the next 4 weeks (from the latest 'taken_at' date in
facts). Return ONLY the JSON. If nothing is due, return {"items": []}.
"""


def build_follow_ups_prompt(facts_json: str) -> str:
    return FOLLOW_UPS_SYSTEM + "\n\n# Facts\n" + facts_json + "\n\n# Output\n"
