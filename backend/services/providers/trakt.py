import httpx
import re
import os
from .base import BaseProvider

class TraktProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        # Examples:
        # https://trakt.tv/users/donxy/lists/marvel-cinematic-universe
        # https://app.trakt.tv/users/donxy/lists/marvel-cinematic-universe
        match = re.search(r'users/([^/]+)/lists/([^/?#]+)', self.url)
        if not match:
            raise Exception(f"Invalid Trakt list URL format: {self.url}. Expected format: https://trakt.tv/users/username/lists/listname")
            
        username = match.group(1)
        list_id = match.group(2)
        
        # Check for user authenticated Trakt access token
        access_token = None
        try:
            from ...database import SessionLocal
            from ...models import AppSetting
            db = SessionLocal()
            setting = db.query(AppSetting).filter(AppSetting.key == "trakt_access_token").first()
            if setting and setting.value:
                access_token = setting.value
            db.close()
        except Exception:
            pass

        client_id = os.getenv("TRAKT_CLIENT_ID", "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d")
        headers = {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": client_id,
            "User-Agent": "Playlistarr/1.0"
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        
        items = []
        page = 1
        limit = 100
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                api_url = f"https://api.trakt.tv/users/{username}/lists/{list_id}/items?page={page}&limit={limit}"
                resp = await client.get(api_url, headers=headers)
                if resp.status_code != 200:
                    raise Exception(f"Failed to fetch Trakt list: HTTP {resp.status_code} ({resp.text[:100]})")
                    
                data = resp.json()
                if not data:
                    break
                    
                for it in data:
                    itype = it.get("type", "movie")
                    media = it.get(itype) or {}
                    show = it.get("show") or {}
                    
                    show_title = show.get("title")
                    show_year = show.get("year")
                    
                    media_ids = media.get("ids") or {}
                    show_ids = show.get("ids") or {}
                    
                    season_num = None
                    episode_num = None
                    
                    if itype == "season":
                        season_num = media.get("number")
                        media_title = media.get("title")
                        title = media_title or (f"{show_title} Season {season_num}" if show_title and season_num is not None else show_title or "Unknown Season")
                        year = show_year or media.get("year")
                    elif itype == "episode":
                        season_num = media.get("season")
                        episode_num = media.get("number")
                        title = media.get("title") or (f"Episode {episode_num}" if episode_num is not None else "Unknown Episode")
                        year = media.get("year") or show_year
                    else:
                        title = media.get("title") or show_title
                        year = media.get("year") or show_year
                    
                    # For TV items, prioritize show_ids for TVDB (Sonarr requirement) and IMDb
                    imdb_id = show_ids.get("imdb") or media_ids.get("imdb")
                    tmdb_id = media_ids.get("tmdb") or show_ids.get("tmdb")
                    tvdb_id = show_ids.get("tvdb") or media_ids.get("tvdb")
                    
                    items.append({
                        "title": title,
                        "show_title": show_title,
                        "year": year,
                        "type": itype,
                        "season": season_num,
                        "episode": episode_num,
                        "season_number": season_num,
                        "episode_number": episode_num,
                        "imdb_id": str(imdb_id) if imdb_id else None,
                        "tmdb_id": str(tmdb_id) if tmdb_id else None,
                        "tvdb_id": str(tvdb_id) if tvdb_id else None,
                        "order": it.get("rank") or (len(items) + 1)
                    })
                    
                total_pages = int(resp.headers.get("x-pagination-page-count", 1))
                if page >= total_pages:
                    break
                page += 1
                
        return items
