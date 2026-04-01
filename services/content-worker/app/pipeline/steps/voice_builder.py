"""
Voice builder step — generates a per-job voice brief from concepts + user profile.

Inputs: concepts_text, voice_profile (from user's creator_voice_profiles row)
Output: voice-brief.md — per-job brief specifying:
  - Angle / unique perspective for this piece
  - Primary analogy or metaphor
  - Target reader profile
  - Tone settings
  - Emphasis priorities
  - Voice rules for downstream writers

Falls back to neutral defaults if voice_profile is empty or < 100 characters.
In that case, includes a WARNING banner in the output brief.

This step is CRITICAL — failure halts the pipeline.
"""
from app.config import Settings
from app.pipeline.steps.base_step import BaseStep

_MIN_PROFILE_LENGTH = 100
_EMPTY_PROFILE_WARNING = (
    "⚠️  WARNING: No voice profile set. "
    "Using neutral defaults. Go to /content/settings to configure your voice profile."
)


class VoiceBuilder(BaseStep):
    """Builds a per-job voice brief from concepts and the user's voice profile."""

    SKILL_NAME = "voice-builder"

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    def _build_user_prompt(self, **kwargs) -> str:
        """
        Build the voice builder prompt.

        If the voice profile is absent or too short, injects a warning into
        the prompt so the output brief includes the setup reminder banner.

        Args:
            **kwargs: Must contain 'concepts_text' (str) and 'voice_profile' (str).

        Returns:
            User prompt with concepts and voice profile wrapped in XML delimiters.
        """
        concepts = kwargs["concepts_text"]
        profile = kwargs.get("voice_profile", "")

        if len(profile.strip()) < _MIN_PROFILE_LENGTH:
            profile_block = (
                f"No voice profile configured. Use neutral defaults. "
                f"Include this exact banner at the top of the brief: '{_EMPTY_PROFILE_WARNING}'"
            )
        else:
            profile_block = self.wrap_external("voice_profile", profile)

        return (
            "Generate a per-job voice brief for the following content concepts. "
            "Follow the SKILL.md template exactly.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + profile_block
        )
