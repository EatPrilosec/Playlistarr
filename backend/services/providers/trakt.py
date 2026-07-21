import httpx
from bs4 import BeautifulSoup
from .base import BaseProvider

class TraktProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        # URL example: https://trakt.tv/users/username/lists/mcu-timeline
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        async with httpx.AsyncClient() as client:
            # Trakt often loads lists in pages or all at once. We'll scrape the main page.
            resp = await client.get(self.url, headers=headers)
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch Trakt list: HTTP {resp.status_code}")
                
            soup = BeautifulSoup(resp.text, 'html.parser')
            items = []
            
            # Trakt lists usually use a grid of items
            grid_items = soup.select('.grid-item')
            for order, item in enumerate(grid_items, start=1):
                # Determine if movie or show
                item_type = item.get('data-type', 'unknown')
                
                # Extract ID and title
                # Trakt HTML structure typically has titles in meta tags or h4 elements
                title_elem = item.select_one('.titles h3, .titles h4')
                title = title_elem.text.strip() if title_elem else "Unknown"
                
                year_elem = item.select_one('.year')
                year = None
                if year_elem:
                    try:
                        year = int(year_elem.text.strip())
                    except:
                        pass
                
                # We need an identifier. Trakt usually puts IMDB or TMDB IDs in data attributes or links
                # For now, we capture the trakt url or internal id
                trakt_id = item.get('data-movie-id') or item.get('data-show-id') or item.get('data-item-id')
                
                items.append({
                    "title": title,
                    "year": year,
                    "type": item_type,
                    "provider_id": trakt_id,
                    "order": order
                })
                
            return items
