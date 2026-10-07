"""Check that this machine can run the worker: settings, database, Claude, proxy, images.

Spends no model tokens (token counting is free) and about 140 KB of proxy
bandwidth for one profile fetch.

Usage (from worker/):
    python check_setup.py
"""

from __future__ import annotations

import sys

REQUIRED = ["PROXY_HOST", "PROXY_LOGIN", "PROXY_PASSWORD", "PROXY_PORTS", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY"]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    failures = 0
    results: dict = {}

    def check(name: str, fn) -> None:
        nonlocal failures
        try:
            print(f"OK    {name}: {fn()}")
        except Exception as e:  # report every failure, then keep checking
            failures += 1
            print(f"FAIL  {name}: {type(e).__name__}: {e}")

    def settings_present() -> str:
        from settings import env

        missing = [k for k in REQUIRED if not env(k)]
        if missing:
            raise RuntimeError(f"missing in worker/.env: {', '.join(missing)}")
        return "all required keys set" + ("" if env("APIFY_TOKEN") else " (APIFY_TOKEN not set: no fallback if Instagram blocks the proxy)")

    def database() -> str:
        import store

        sb = store.connect()
        active = sb.table("clubs").select("id", count="exact").eq("active", True).limit(1).execute().count
        return f"connected, {active} active clubs"

    def claude() -> str:
        import anthropic

        from settings import CLAUDE_MODEL, VERIFY_MODEL

        client = anthropic.Anthropic()
        models = [CLAUDE_MODEL] + ([VERIFY_MODEL] if VERIFY_MODEL.lower() != "none" else [])
        for model in models:
            client.messages.count_tokens(model=model, messages=[{"role": "user", "content": "ok"}])
        return f"key works for {', '.join(models)}"

    def instagram() -> str:
        from fetchers import fetch_posts

        result = fetch_posts("macmanhunt", backend="primary", on_attempt=lambda a: None)
        results["posts"] = result.posts
        return f"profile page fetched through the proxy, {len(result.posts)} posts"

    def images() -> str:
        from curl_cffi import requests

        from store import IMAGE_ACCEPT

        post = next((p for p in results.get("posts", []) if p.image_url), None)
        if post is None:
            raise RuntimeError("skipped: no post image to try (Instagram check failed)")
        resp = requests.get(post.image_url, impersonate="chrome", headers={"Accept": IMAGE_ACCEPT}, timeout=30)
        resp.raise_for_status()
        return f"downloaded directly (no proxy): {resp.headers.get('content-type')}, {len(resp.content):,} bytes"

    check("settings", settings_present)
    check("database", database)
    check("claude", claude)
    check("instagram", instagram)
    check("images", images)
    print("\nAll checks passed." if not failures else f"\n{failures} check(s) failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
