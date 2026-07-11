LAB_PDF_SYSTEM = """You are a clinical data extractor. Given a lab-report PDF,
extract every quantitative lab value. Respond with STRICT JSON matching this schema:

{
  "labs": [
    {
      "test_name": "string, canonical name (e.g. 'HbA1c', 'Fasting glucose', 'LDL', 'HDL')",
      "value": "number",
      "unit": "string (e.g. '%', 'mg/dL')",
      "ref_low": "number or null",
      "ref_high": "number or null",
      "taken_at": "YYYY-MM-DD"
    }
  ],
  "encounter_date": "YYYY-MM-DD (report date)",
  "provider": "string or null (e.g. 'Apollo Diagnostics')"
}

Rules:
- Omit qualitative results (colour, appearance).
- If a test appears twice, keep the later value.
- If ref range is missing, use null.
- Use ISO dates.
- Return ONLY the JSON. No prose. No markdown fences.
"""


def build_lab_pdf_prompt() -> str:
    return LAB_PDF_SYSTEM
