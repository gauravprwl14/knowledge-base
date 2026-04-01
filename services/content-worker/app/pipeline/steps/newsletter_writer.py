"""
Newsletter writer — 400-600 word email newsletter.

Output: subject line, preview text, personal opener (starts with "I"),
3 bold takeaway sections, closing, CTA, sign-off, P.S.
This step is NON-CRITICAL.
"""
from app.pipeline.steps.base_step import BaseStep


class NewsletterWriter(BaseStep):
    """Generates an email newsletter with subject line and preview text."""

    SKILL_NAME = "newsletter-writer"

    def _build_user_prompt(self, **kwargs) -> str:
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        return (
            "Write a 400-600 word newsletter following the SKILL.md format exactly. "
            "Include subject line, preview text, personal opener starting with 'I'.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
