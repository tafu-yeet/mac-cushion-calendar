"""Primary backend: the public profile page, fetched through residential proxies.

Loads https://www.instagram.com/{username}/ with curl_cffi Chrome impersonation
and reads the 12 most recent posts (pinned posts included, not flagged) from the
JSON embedded in the page's <script data-sjs> tags. Instagram's web_profile_info
API answers logged-out requests with 401 require_login, so it is not used.

Proxy settings come from PROXY_HOST, PROXY_LOGIN, PROXY_PASSWORD, and
PROXY_PORTS (one port or a range like 10000-10499, each port a separate sticky
IP). Each attempt uses a different port, so a retry comes from a different IP.
"""

from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote

from curl_cffi import requests
from curl_cffi.requests.exceptions import RequestException

from settings import env

from .base import Attempt, AttemptLogger, BlockedError, Post, UnavailableError

NAME = "primary"
PROFILE_URL = "https://www.instagram.com/{username}/"
IMPERSONATE = "chrome"
TIMEOUT_S = 30
MAX_ATTEMPTS = 3
RETRY_DELAY_S = (3.0, 8.0)
# Instagram media ids carry their creation time: (id >> 23) is milliseconds
# since this epoch (2011-08-24). The profile page has no timestamp field.
IG_EPOCH_MS = 1314220021721
SJS_SCRIPT = re.compile(r"<script[^>]*data-sjs[^>]*>(.*?)</script>", re.DOTALL)


class _Retryable(Exception):
    """This IP is blocked or throttled; a fresh one may work."""


def proxy_pool() -> list[str]:
    """Proxy URLs for every port in PROXY_PORTS, or [] if not configured."""
    host, login, password, ports = (
        env(k) for k in ("PROXY_HOST", "PROXY_LOGIN", "PROXY_PASSWORD", "PROXY_PORTS")
    )
    if not (host and login and password and ports):
        return []
    first, _, last = ports.partition("-")
    auth = f"{quote(login, safe='')}:{quote(password, safe='')}"
    return [f"http://{auth}@{host}:{port}" for port in range(int(first), int(last or first) + 1)]


def proxy_label(proxy: str | None) -> str:
    """host:port without credentials, safe to log."""
    return proxy.rsplit("@", 1)[1] if proxy else "direct"


def fetch(username: str, since: datetime | None, on_attempt: AttemptLogger) -> list[Post]:
    """Fetch a profile page, retrying through a different proxy when blocked."""
    proxies = proxy_pool()
    if not proxies:
        raise SystemExit("Proxy settings missing: set PROXY_HOST, PROXY_LOGIN, PROXY_PASSWORD, PROXY_PORTS.")

    for attempt, proxy in enumerate(random.sample(proxies, min(MAX_ATTEMPTS, len(proxies))), 1):
        if attempt > 1:
            time.sleep(random.uniform(*RETRY_DELAY_S))

        status, size = None, 0
        try:
            with requests.Session(impersonate=IMPERSONATE) as session:
                resp = session.get(
                    PROFILE_URL.format(username=username),
                    proxy=proxy,
                    timeout=TIMEOUT_S,
                    allow_redirects=False,
                )
            status, size = resp.status_code, resp.response_size
            nodes = parse_page(resp)
        except (_Retryable, RequestException) as e:
            on_attempt(Attempt(username, NAME, attempt, status, "retry", size, proxy_label(proxy), str(e)))
            continue
        except UnavailableError as e:
            on_attempt(Attempt(username, NAME, attempt, status, "failed", size, proxy_label(proxy), str(e)))
            raise
        on_attempt(Attempt(username, NAME, attempt, status, "ok", size, proxy_label(proxy)))
        return [to_post(node, username) for node in nodes]

    raise BlockedError(f"all {MAX_ATTEMPTS} attempts were blocked")


def parse_page(resp: requests.Response) -> list[dict]:
    """Return the post nodes from a good profile page, or raise."""
    status = resp.status_code
    if 300 <= status < 400:
        location = resp.headers.get("location", "")
        if "login" in location or "challenge" in location:
            raise _Retryable(f"login redirect to {location}")
        raise _Retryable(f"unexpected redirect {status} to {location}")
    if status == 404:
        raise UnavailableError("profile not found (HTTP 404)")
    if status != 200:
        raise _Retryable(f"HTTP {status}")

    html = resp.text
    nodes = extract_post_nodes(html)
    if nodes is None:
        if '"is_private":true' in html:
            raise UnavailableError("account is private")
        # Usually a login wall served in place of the profile.
        raise _Retryable("no post data in page")
    return nodes


def extract_post_nodes(html: str) -> list[dict] | None:
    """Return the post nodes embedded in a profile page, or None if absent."""
    for script in SJS_SCRIPT.findall(html):
        if "polaris_ordered_timeline_connection" not in script:
            continue
        try:
            user = _find_key(json.loads(script), "polaris_ordered_timeline_connection")
        except ValueError:
            continue
        if user:
            return [edge["node"] for edge in user["polaris_ordered_timeline_connection"]["edges"]]
    return None


def _find_key(obj, key: str) -> dict | None:
    """Return the first dict nested in obj that has key, depth first."""
    if isinstance(obj, dict):
        if key in obj:
            return obj
        children = obj.values()
    elif isinstance(obj, list):
        children = obj
    else:
        return None
    for child in children:
        found = _find_key(child, key)
        if found is not None:
            return found
    return None


def to_post(node: dict, username: str) -> Post:
    ms = (int(node["pk"]) >> 23) + IG_EPOCH_MS
    return Post(
        id=str(node["pk"]),
        shortcode=node["code"],
        username=(node.get("user") or {}).get("username") or username,
        caption=((node.get("caption") or {}).get("text") or "").strip(),
        posted_at=datetime.fromtimestamp(ms / 1000, tz=timezone.utc),
        image_url=node.get("display_uri"),
        media_type=node.get("product_type") or "",
        raw=node,
    )
