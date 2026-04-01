"""
LinkedIn writer step — generates platform-native LinkedIn posts.

Output format:
  - 150–300 words, plain text ONLY (no markdown symbols)
  - Hook (standalone sentence) → blank line → tension/problem → 3 insights
    → blank line → synthesis → blank line → CTA question → hashtags (3-5)
  - Minimum 4 blank lines for visual breathing room
  - No **bold**, no ## headers, no bullet points

Variations: When variation_index > 0, the prompt instructs Claude to use a
different hook archetype:
  - 0: identity challenge hook ("Most [profession]s...")
  - 1: contrarian hook ("Everyone says X. They're wrong.")
  - 2: specific result hook ("I [achieved X] in [timeframe]. Here's how.")
  - 3: curiosity gap hook ("There's a reason [unexpected thing] works.")
  - 4: pattern interrupt hook (starts mid-thought)

Max supported variations: 5 (0-4).

This step is NON-CRITICAL — failure marks linkedin-writer FAILED but pipeline continues.
"""
from app.config import Settings
from app.pipeline.steps.base_step import BaseStep

_HOOK_ARCHETYPES = [
    "identity challenge — start with 'Most [profession]s...' or 'If you [do X]...'",
    "contrarian — start with a provocative 'Everyone says X. They're wrong.' or similar",
    "specific result — start with 'I [achieved measurable result] in [timeframe]. Here's the [framework/reason].'",
    "curiosity gap — start with 'There's a reason [unexpected/counterintuitive thing] works. And it's not what you think.'",
    "pattern interrupt — start mid-thought, as if the reader already knows the context",
]


class LinkedInWriter(BaseStep):
    """
    Generates a LinkedIn post for the given concepts and voice brief.

    Supports up to 5 variations using different hook archetypes.
    """

    SKILL_NAME = "linkedin-writer"

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    def _build_user_prompt(self, **kwargs) -> str:
        """
        Build the LinkedIn writer prompt.

        Uses variation_index to select the hook archetype. This ensures
        each variation has a structurally different opening, not just
        a paraphrased version of the same hook.

        Args:
            **kwargs: Must contain:
                - concepts_text (str): Extracted concepts markdown
                - voice_brief_text (str): Per-job voice brief markdown
                - variation_index (int): 0 = primary, 1-4 = variations
                - fmt (str): 'post' (only supported format for LinkedIn)

        Returns:
            User prompt with all external content wrapped in XML delimiters.
        """
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        variation_index: int = kwargs.get("variation_index", 0)

        # Select hook archetype for this variation
        archetype_index = min(variation_index, len(_HOOK_ARCHETYPES) - 1)
        hook_instruction = _HOOK_ARCHETYPES[archetype_index]

        variation_note = (
            f"\n\nHOOK REQUIREMENT for this variation: Use a {hook_instruction}. "
            "The hook MUST be structurally different from a standard 'Most X do Y' opener."
            if variation_index > 0
            else ""
        )

        return (
            "Write a LinkedIn post following the SKILL.md format exactly. "
            "Plain text only — no markdown symbols (**, ##, -, *). "
            "150–300 words. Minimum 4 blank lines for visual breathing room."
            + variation_note
            + "\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
