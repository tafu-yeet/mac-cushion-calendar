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

import html
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


def fetch(username: str, since: datetime | None, on_attempt: AttemptLogger) -> tuple[list[Post], int | None, list[dict]]:
    """Fetch a profile page, retrying through a different proxy when blocked.

    Returns the recent posts, the follower count (None if the page didn't show
    it), and the links in the bio ([{url, title}]).
    """
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
            nodes, followers, bio = parse_page(resp)
        except (_Retryable, RequestException) as e:
            on_attempt(Attempt(username, NAME, attempt, status, "retry", size, proxy_label(proxy), str(e)))
            continue
        except UnavailableError as e:
            on_attempt(Attempt(username, NAME, attempt, status, "failed", size, proxy_label(proxy), str(e)))
            raise
        on_attempt(Attempt(username, NAME, attempt, status, "ok", size, proxy_label(proxy)))
        return [to_post(node, username) for node in nodes], followers, bio

    raise BlockedError(f"all {MAX_ATTEMPTS} attempts were blocked")


def parse_page(resp: requests.Response) -> tuple[list[dict], int | None, list[dict]]:
    """Return the post nodes, follower count and bio links from a good profile page, or raise."""
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
    return nodes, followers_from_html(html), bio_links_from_html(html)


def bio_links_from_html(page: str) -> list[dict]:
    """The links in the profile's bio: [{url, title}] (worker/bio_links.py uses them)."""
    links = []
    i = page.find('"bio_links":')
    if i != -1:
        try:
            items, _ = json.JSONDecoder().raw_decode(page, i + len('"bio_links":'))
            links = [{"url": l["url"], "title": (l.get("title") or "").strip()} for l in items if l.get("url")]
        except (ValueError, KeyError, TypeError):
            links = []
    if not links and (m := EXTERNAL_URL.search(page)):
        links = [{"url": json.loads(f'"{m.group(1)}"'), "title": ""}]
    return links


EXTERNAL_URL = re.compile(r'"external_url":"(https?:[^"]+)"')
FOLLOWER_JSON = re.compile(r'"follower_count":(\d+)')
FOLLOWER_META = re.compile(r'content="([\d.,]+)([KkMm]?) Followers')


def followers_from_html(html: str) -> int | None:
    """The follower count from the page's data, or from its "959 Followers" description."""
    if m := FOLLOWER_JSON.search(html):
        return int(m.group(1))
    if m := FOLLOWER_META.search(html):
        number, suffix = float(m.group(1).replace(",", "")), m.group(2).lower()
        return round(number * {"k": 1_000, "m": 1_000_000}.get(suffix, 1))
    return None


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


POST_URL = "https://www.instagram.com/p/{shortcode}/"
POST_NAME = "post_page"
POST_CAPTION = re.compile(r'<meta property="og:description" content="([^"]*)"')


def fetch_post_page(username: str, shortcode: str, on_attempt: AttemptLogger) -> str | None:
    """A single post's caption from its own page, or None when the post is gone.

    A live post's page carries its caption in og:description ("19 likes, 0
    comments - club on October 7, 2026: "caption""); a deleted or hidden post's
    page has none. Because a blocked request can look the same, a page without
    a caption is tried once more through another proxy before it counts as gone.
    """
    proxies = proxy_pool()
    if not proxies:
        raise SystemExit("Proxy settings missing: set PROXY_HOST, PROXY_LOGIN, PROXY_PASSWORD, PROXY_PORTS.")
    misses = 0
    for attempt, proxy in enumerate(random.sample(proxies, min(MAX_ATTEMPTS, len(proxies))), 1):
        if attempt > 1:
            time.sleep(random.uniform(*RETRY_DELAY_S))
        status, size = None, 0
        try:
            with requests.Session(impersonate=IMPERSONATE) as session:
                resp = session.get(POST_URL.format(shortcode=shortcode), proxy=proxy, timeout=TIMEOUT_S, allow_redirects=False)
            status, size = resp.status_code, resp.response_size
        except RequestException as e:
            on_attempt(Attempt(username, POST_NAME, attempt, status, "retry", size, proxy_label(proxy), str(e)))
            continue
        if status == 404:
            on_attempt(Attempt(username, POST_NAME, attempt, status, "failed", size, proxy_label(proxy), "post not found"))
            return None
        if status != 200:
            on_attempt(Attempt(username, POST_NAME, attempt, status, "retry", size, proxy_label(proxy), f"HTTP {status}"))
            continue
        if m := POST_CAPTION.search(resp.text):
            on_attempt(Attempt(username, POST_NAME, attempt, status, "ok", size, proxy_label(proxy)))
            text = html.unescape(m.group(1))
            # Everything after 'club on Month D, YYYY: "', without the closing quote.
            caption = text.split(': "', 1)[1] if ': "' in text else text
            return caption[:-1] if caption.endswith('"') else caption
        misses += 1
        on_attempt(Attempt(username, POST_NAME, attempt, status, "retry" if misses < 2 else "failed", size,
                           proxy_label(proxy), "no caption on the page"))
        if misses >= 2:
            return None
    raise BlockedError(f"all {MAX_ATTEMPTS} attempts to open post {shortcode} failed")
