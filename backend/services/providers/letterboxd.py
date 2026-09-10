import httpx
from bs4 import BeautifulSoup
from .base import BaseProvider

class LetterboxdProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        # URL example: https://letterboxd.com/user/list/list-name/
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        items = []
        
        target_url = self.url
        if target_url.endswith("/detail/"):
            target_url = target_url[:-7]
        
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(target_url, headers=headers)
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch Letterboxd list: HTTP {resp.status_code}")
                
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Letterboxd lists use .poster-container or .film-poster
            posters = soup.select('.film-poster')
            for order, poster in enumerate(posters, start=1):
                # We can grab title from the img alt text, but the img isn't always loaded (lazy load).
                # The data-film-slug or data-target-link has the title slug.
                # Actually, the poster image alt text is usually reliable if present.
                img = poster.select_one('img')
                title = "Unknown"
                if img and img.has_attr('alt'):
                    title = img['alt']
                else:
                    # fallback to data-film-name if available, else derive from link
                    slug = poster.get('data-film-slug')
                    if slug:
                        title = slug.replace('-', ' ').title()
                
                items.append({
                    "title": title,
                    "year": None, # Year is hard to scrape reliably without a second request per film
                    "type": "movie",
                    "provider_id": poster.get('data-film-id', ''),
                    "order": order
                })
                
        return items
