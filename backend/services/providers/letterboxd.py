import asyncio
import re
from bs4 import BeautifulSoup
from .base import BaseProvider

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

import httpx

class LetterboxdProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        base_url = self.url.strip()
        if base_url.endswith("/detail/"):
            base_url = base_url[:-8]
        elif base_url.endswith("/detail"):
            base_url = base_url[:-7]
        base_url = base_url.rstrip("/")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        items = []
        current_url = base_url
        page = 1
        max_pages = 25

        while current_url and page <= max_pages:
            html = await self._get_html(current_url, headers)
            if not html:
                break

            soup = BeautifulSoup(html, 'html.parser')
            containers = soup.select('li.posteritem') or soup.select('.film-poster')
            if not containers:
                break

            page_items = 0
            for container in containers:
                lazy_poster = container.select_one('[data-item-full-display-name]') or container
                full_name = lazy_poster.get('data-item-full-display-name') or lazy_poster.get('data-item-name')
                
                title = None
                year = None

                if full_name:
                    m = re.match(r'^(.*?)\s*\((\d{4})\)$', full_name.strip())
                    if m:
                        title = m.group(1).strip()
                        year = int(m.group(2))
                    else:
                        title = full_name.strip()

                if not title:
                    img = container.select_one('img')
                    if img and img.has_attr('alt') and img['alt']:
                        title = img['alt'].strip()
                    else:
                        slug = container.get('data-film-slug') or (container.select_one('[data-film-slug]') or {}).get('data-film-slug')
                        if slug:
                            title = slug.replace('-', ' ').title()

                if not title:
                    continue

                items.append({
                    "title": title,
                    "year": year,
                    "type": "movie",
                    "imdb_id": None,
                    "tmdb_id": None,
                    "tvdb_id": None,
                    "show_title": None,
                    "order": len(items) + 1
                })
                page_items += 1

            if page_items == 0:
                break

            # Pagination
            next_link = soup.select_one('a.next, .paginate-nextprev a.next')
            if next_link and next_link.get('href'):
                next_href = next_link['href']
                if next_href.startswith('http'):
                    current_url = next_href
                else:
                    current_url = f"https://letterboxd.com{next_href}"
                page += 1
            else:
                break

        return items

    async def _get_html(self, url: str, headers: dict) -> str | None:
        # Prefer curl_cffi to bypass Cloudflare TLS fingerprint blocks
        if cffi_requests:
            try:
                loop = asyncio.get_running_loop()
                resp = await loop.run_in_executor(
                    None,
                    lambda: cffi_requests.get(url, headers=headers, impersonate="chrome124", timeout=20)
                )
                if resp.status_code == 200:
                    return resp.text
                if resp.status_code == 404:
                    return None
            except Exception:
                pass

        # Fallback to httpx
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code == 404:
                return None
            raise Exception(f"Failed to fetch Letterboxd page: HTTP {resp.status_code}")
