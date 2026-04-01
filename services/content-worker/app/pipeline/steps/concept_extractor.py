"""
Concept extractor step — extracts structured concepts from a transcript.

Inputs: transcript_text (from any source type)
Output: concepts.md — structured markdown with:
  - Core thesis
  - Key frameworks / mental models
  - Counterintuitive claims
  - Data points and statistics
  - Analogies and metaphors
  - Identified gaps or missing angles
  - Platform-agnostic angles
  - Quotable lines

This step is CRITICAL — failure halts the pipeline.
"""
from app.config import Settings
from app.pipeline.steps.base_step import BaseStep


class ConceptExtractor(BaseStep):
    """Extracts structured concepts from a transcript for downstream writing steps."""

    SKILL_NAME = "concept-extractor"

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    def _build_user_prompt(self, **kwargs) -> str:
        """
        Build the concept extraction prompt.

        Args:
            **kwargs: Must contain 'transcript_text' (str).

        Returns:
            User prompt with transcript wrapped in XML delimiters.
        """
        transcript = kwargs["transcript_text"]
        return (
            "Extract the core concepts from the following transcript. "
            "Return structured markdown following the SKILL.md template exactly.\n\n"
            + self.wrap_external("transcript", transcript)
        )
