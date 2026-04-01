"""
Instagram writer — caption + 8-slide carousel script.

Output: caption (hook visible in 125 chars) + 8 carousel slides with
headline, body copy, image concept, image prompt per slide.
This step is NON-CRITICAL.
"""
from app.pipeline.steps.base_step import BaseStep


class InstagramWriter(BaseStep):
    """Generates Instagram caption and carousel slide scripts."""

    SKILL_NAME = "instagram-writer"

    def _build_user_prompt(self, **kwargs) -> str:
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        fmt: str = kwargs.get("fmt", "carousel")
        return (
            f"Write an Instagram {fmt} following the SKILL.md format exactly.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
