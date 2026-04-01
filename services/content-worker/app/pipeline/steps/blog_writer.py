"""
Blog writer — 1500-3000 word blog post with SEO frontmatter.

Uses 6000 max_tokens (higher than other steps) to fit the longer output.
This step is NON-CRITICAL.
"""
from app.pipeline.steps.base_step import BaseStep

_BLOG_MAX_TOKENS = 6000


class BlogWriter(BaseStep):
    """Generates a long-form blog post with YAML frontmatter."""

    SKILL_NAME = "blog-writer"

    def _build_user_prompt(self, **kwargs) -> str:
        concepts = kwargs["concepts_text"]
        voice_brief = kwargs["voice_brief_text"]
        kwargs["max_tokens"] = _BLOG_MAX_TOKENS  # override default in BaseStep.run()
        return (
            "Write a 1500-3000 word blog post following the SKILL.md format exactly. "
            "Include YAML frontmatter with title, slug, tags, seo_description, reading_time.\n\n"
            + self.wrap_external("concepts", concepts)
            + "\n\n"
            + self.wrap_external("voice_brief", voice_brief)
        )
