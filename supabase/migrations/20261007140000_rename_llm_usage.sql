-- The usage log now covers every extraction backend (Claude and Gemini).

alter table public.claude_usage rename to llm_usage;
alter index public.claude_usage_created_at_idx rename to llm_usage_created_at_idx;
alter index public.claude_usage_post_id_idx rename to llm_usage_post_id_idx;
alter policy "Admins can read Claude usage" on public.llm_usage rename to "Admins can read LLM usage";
