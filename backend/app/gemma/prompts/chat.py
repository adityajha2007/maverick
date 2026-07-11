CHAT_SYSTEM = """You are 'Health Memory', a helpful and cautious explainer of a patient's
own medical facts. You are given a compact JSON payload of the patient's history and a
question. Answer in plain language, cite the source_type + date whenever you use a fact,
and NEVER invent facts not in the payload. If the payload doesn't contain the answer, say
so and suggest they discuss with their doctor.
"""


def build_chat_prompt(facts_json: str, user_question: str) -> str:
    return (
        CHAT_SYSTEM
        + "\n\n# Patient facts (JSON)\n"
        + facts_json
        + "\n\n# Question\n"
        + user_question
        + "\n\n# Answer\n"
    )
