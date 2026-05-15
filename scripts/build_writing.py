#!/usr/bin/env python3
"""
Build /writing/index.html for thetakematters.com from Jeffrey Anthony's
Medium RSS feed.

No third-party services, no dependencies. Standard library only.
Fetches the Medium RSS feed, parses it, and writes a static page styled
with the site's existing styles.css classes so it renders natively.

Safety: if the feed cannot be fetched or yields zero posts, the script
exits non-zero WITHOUT touching the existing writing/index.html, so a
transient Medium outage can never blank the page.

Usage:
    python3 scripts/build_writing.py

Run locally to generate the page now, and by the GitHub Action on a
daily cron so new Medium posts appear automatically.
"""

import html
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEED_URL = "https://medium.com/feed/@WeWillNotBeFlattened"
PROFILE_URL = "https://medium.com/@WeWillNotBeFlattened"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(REPO_ROOT, "writing", "index.html")

# Tags that are noise as card chips; everything else is shown (max 3).
TAG_BLOCKLIST = set()


def fetch_feed(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0 Safari/537.36"
            ),
            "Accept": "application/rss+xml, application/xml, text/xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def cdata(value):
    """Strip a single CDATA wrapper if present."""
    m = re.match(r"\s*<!\[CDATA\[(.*?)\]\]>\s*$", value, re.S)
    return m.group(1) if m else value


def first(pattern, text, flags=re.S):
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else ""


def clean_dek(description_html):
    """
    Medium's <description> is a short HTML blurb that ends with
    'Continue reading on X »'. Pull the meaningful lead sentence,
    drop the boilerplate tail, strip tags, unescape entities.
    """
    txt = re.sub(r"<[^>]+>", " ", description_html)
    txt = html.unescape(txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    txt = re.sub(r"\s*Continue reading on .*?»\s*$", "", txt).strip()
    return txt


def fmt_date(pubdate_raw):
    try:
        dt = parsedate_to_datetime(pubdate_raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%B %-d, %Y"), dt.strftime("%Y-%m-%d")
    except Exception:
        return pubdate_raw, ""


def parse_items(xml):
    items = re.findall(r"<item>(.*?)</item>", xml, re.S)
    posts = []
    for it in items:
        title = clean_dek(cdata(first(r"<title>(.*?)</title>", it)))
        link = first(r"<link>(.*?)</link>", it)
        link = re.sub(r"\?source=rss.*$", "", link).strip()
        pub_raw = first(r"<pubDate>(.*?)</pubDate>", it)
        date_h, date_iso = fmt_date(pub_raw)
        desc = cdata(first(r"<description>(.*?)</description>", it))
        dek = clean_dek(desc)
        if dek == title:
            dek = ""
        img_m = re.search(r'<img[^>]+src="([^"]+)"', desc)
        image = img_m.group(1).strip() if img_m else ""
        if image:
            # Medium's CDN honors a width segment. Original heroes are
            # ~2MB; a 320px crop is ~24KB and plenty for a thumbnail.
            image = re.sub(
                r"(cdn-images-1\.medium\.com)/max/\d+/",
                r"\1/max/320/",
                image,
            )
        cats = [
            cdata(c).strip()
            for c in re.findall(r"<category>(.*?)</category>", it, re.S)
        ]
        cats = [c for c in cats if c and c not in TAG_BLOCKLIST][:3]
        if not title or not link:
            continue
        posts.append(
            {
                "title": title,
                "link": link,
                "date_h": date_h,
                "date_iso": date_iso,
                "dek": dek,
                "tags": cats,
                "image": image,
            }
        )
    return posts


def esc(s):
    return html.escape(s, quote=True)


def render_card(p):
    tags = ""
    if p["tags"]:
        chips = "".join(
            f'<span class="writing-tag">{esc(t)}</span>' for t in p["tags"]
        )
        tags = f'<div class="writing-tags">{chips}</div>'
    dek = f'<p class="writing-dek">{esc(p["dek"])}</p>' if p["dek"] else ""
    date_attr = f' datetime="{p["date_iso"]}"' if p["date_iso"] else ""
    thumb = (
        f'<img class="writing-thumb" src="{esc(p["image"])}" alt="" loading="lazy">\n        '
        if p["image"]
        else ""
    )
    return f"""      <article class="writing-card">
        {thumb}<div class="writing-body">
          <a class="writing-title" href="{esc(p['link'])}" target="_blank" rel="noopener">{esc(p['title'])}</a>
          {dek}
          <div class="writing-meta">
            <time{date_attr}>{esc(p['date_h'])}</time>
            {tags}
          </div>
        </div>
      </article>"""


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Writing | Jeffrey Anthony</title>
<meta name="description" content="Essays by Jeffrey Anthony on music, AI, philosophy, and culture — how music is made and why it matters.">
<meta property="og:title" content="Writing | Jeffrey Anthony">
<meta property="og:description" content="Essays by Jeffrey Anthony on music, AI, philosophy, and culture.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://thetakematters.com/writing/">
<meta property="og:site_name" content="The Take Matters">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Writing | Jeffrey Anthony">
<meta name="twitter:description" content="Essays by Jeffrey Anthony on music, AI, philosophy, and culture.">
<link rel="canonical" href="https://thetakematters.com/writing/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<main class="page">

  <nav class="topnav">
    <a href="/">The Take Matters</a>
    <a href="/writing/" aria-current="page">Writing</a>
  </nav>

  <section class="writing-header">
    <h1>Writing</h1>
    <p>Essays on music, AI, philosophy, and culture: how music is made, and why it matters. Published on Medium, where there is an active readership and conversation.</p>
  </section>

  <section class="writing-list">
{cards}
  </section>

  <section class="writing-more">
    <p>More essays, and the comment threads, live on <a href="{profile}" target="_blank" rel="noopener">Medium</a>.</p>
  </section>

  <footer class="footer">
    <p>&copy; 2026 The Take Matters. All rights reserved.</p>
  </footer>

</main>

<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>

</body>
</html>
"""


def main():
    try:
        xml = fetch_feed(FEED_URL)
    except Exception as e:
        print(f"ERROR: could not fetch Medium feed: {e}", file=sys.stderr)
        print("Existing writing/index.html left untouched.", file=sys.stderr)
        return 1

    posts = parse_items(xml)
    if not posts:
        print("ERROR: feed parsed to zero posts. Aborting without "
              "overwriting writing/index.html.", file=sys.stderr)
        return 1

    cards = "\n".join(render_card(p) for p in posts)
    page = PAGE.replace("{cards}", cards).replace("{profile}", PROFILE_URL)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(page)

    print(f"Wrote {len(posts)} posts to {OUT_PATH}")
    for p in posts:
        print(f"  - {p['date_iso']}  {p['title'][:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
