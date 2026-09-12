import httpx
import re
import os
from .base import BaseProvider

class MDBListProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        clean_url = self.url.strip()
        
        # Check if user has an mdblist API key in database or env
        api_key = os.getenv("MDBLIST_API_KEY")
        try:
            from ...database import SessionLocal
            from ...models import AppSetting
            db = SessionLocal()
            setting = db.query(AppSetting).filter(AppSetting.key == "mdblist_api_key").first()
            if setting and setting.value:
                api_key = setting.value
            db.close()
        except Exception:
            pass

        # Normalize target JSON URL
        # e.g. https://mdblist.com/lists/username/listname -> https://mdblist.com/lists/username/listname/json
        target_url = clean_url
        if not target_url.endswith("/json") and not target_url.endswith("/json/"):
            target_url = target_url.rstrip("/") + "/json"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json"
        }
        if api_key:
            headers["X-API-KEY"] = api_key

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(target_url, headers=headers)
            
            # If public json export failed and we have an API key, attempt api.mdblist.com
            if resp.status_code != 200 and api_key:
                match = re.search(r'lists/([^/]+)/([^/?#]+)', clean_url)
                if match:
                    user_or_type = match.group(1)
                    slug = match.group(2)
                    api_endpoint = f"https://api.mdblist.com/lists/{user_or_type}/{slug}/items?unified=true"
                    resp = await client.get(api_endpoint, headers=headers)

            if resp.status_code != 200:
                raise Exception(f"Failed to fetch mdblist: HTTP {resp.status_code} ({resp.text[:100]})")

            data = resp.json()
            raw_items = []
            if isinstance(data, list):
                raw_items = data
            elif isinstance(data, dict):
                # Response from api.mdblist.com with {"movies": [...], "shows": [...]}
                movies = data.get("movies", [])
                shows = data.get("shows", [])
                raw_items = movies + shows

            items = []
            for order, it in enumerate(raw_items, start=1):
                title = it.get("title")
                year = it.get("release_year") or it.get("year")
                mediatype = (it.get("mediatype") or "movie").lower()
                item_type = "show" if mediatype in ["show", "series", "tv"] else "movie"
                
                # Extract IDs
                imdb_id = it.get("imdb_id")
                tmdb_id = it.get("id") or it.get("tmdbid")
                tvdb_id = it.get("tvdbid") or it.get("tvdb_id")
                
                ids_dict = it.get("ids") or {}
                if not imdb_id and ids_dict.get("imdb"):
                    imdb_id = ids_dict.get("imdb")
                if not tmdb_id and ids_dict.get("tmdb"):
                    tmdb_id = ids_dict.get("tmdb")
                if not tvdb_id and ids_dict.get("tvdb"):
                    tvdb_id = ids_dict.get("tvdb")

                rank = it.get("rank")
                items.append({
                    "title": title,
                    "year": int(year) if year and str(year).isdigit() else None,
                    "type": item_type,
                    "imdb_id": str(imdb_id) if imdb_id else None,
                    "tmdb_id": str(tmdb_id) if tmdb_id else None,
                    "tvdb_id": str(tvdb_id) if tvdb_id else None,
                    "show_title": None,
                    "order": rank if isinstance(rank, int) else order
                })

            # Sort items by their rank/order
            items.sort(key=lambda x: x.get("order", 0))
            return items
