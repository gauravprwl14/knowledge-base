"""
Reels scripter — 60-90 second spoken-word script with timestamps.

Output: timestamped sections [0:00-0:03] hook through [1:25-1:30] CTA,
on-screen text callouts, B-roll suggestions, production notes.
This step is NON-CRITICAL.
"""
from app.pipeline.steps.base_step import BaseStep


class ReelsScripter(BaseStep):
    """Generates a Reels/Shorts script with timestamps and B-roll suggestions."""

    SKILL_NAME = "reels-scripter"

    def _build_user_prompt(self, **kwargs) -> str:
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        return (
            "Write a 60-90 second Reels script following the SKILL.md format exactly. "
            "Include timestamps, on-screen text callouts, and B-roll suggestions.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
