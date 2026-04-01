"""
Twitter/X writer step — generates threads or standalone tweets.

Formats:
  - thread: 5-8 tweet thread, each tweet ≤280 characters, numbered (1/N)
  - tweet: single standalone tweet ≤280 characters

This step is NON-CRITICAL.
"""
from app.pipeline.steps.base_step import BaseStep


class TwitterWriter(BaseStep):
    """Generates Twitter/X content (thread or single tweet)."""

    SKILL_NAME = "twitter-writer"

    def _build_user_prompt(self, **kwargs) -> str:
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        fmt: str = kwargs.get("fmt", "thread")

        format_instruction = (
            "Write a Twitter/X thread (5-8 tweets, each ≤280 chars, numbered 1/N)"
            if fmt == "thread"
            else "Write a single Twitter/X tweet (≤280 characters)"
        )

        return (
            f"{format_instruction}. Follow the SKILL.md format exactly.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
