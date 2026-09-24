import httpx
import re
import os
import datetime
from .base import BaseProvider

class TraktProvider(BaseProvider):
    async def _get_or_refresh_token(self, force_refresh: bool = False) -> str | None:
        client_id = os.getenv("TRAKT_CLIENT_ID", "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d")
        access_token = None
        refresh_token = None
        expires_at_str = None

        try:
            from ...database import SessionLocal
            from ...models import AppSetting
            db = SessionLocal()
            try:
                settings = db.query(AppSetting).filter(
                    AppSetting.key.in_(["trakt_access_token", "trakt_refresh_token", "trakt_token_expires_at"])
                ).all()
                s_map = {s.key: s.value for s in settings}
                access_token = s_map.get("trakt_access_token")
                refresh_token = s_map.get("trakt_refresh_token")
                expires_at_str = s_map.get("trakt_token_expires_at")
            finally:
                db.close()
        except Exception:
            return None

        if not access_token and not refresh_token:
            return None

        # Check expiration if not force_refresh
        is_expired = force_refresh
        if not is_expired and expires_at_str:
            try:
                exp_dt = datetime.datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    now = datetime.datetime.utcnow()
                else:
                    now = datetime.datetime.now(datetime.timezone.utc)
                if now >= (exp_dt - datetime.timedelta(seconds=60)):
                    is_expired = True
            except Exception:
                pass

        if not is_expired and access_token:
            return access_token

        # Attempt refresh if refresh_token is available
        if refresh_token:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        "https://api.trakt.tv/oauth/token",
                        json={
                            "refresh_token": refresh_token,
                            "client_id": client_id,
                            "grant_type": "refresh_token"
                        },
                        headers={"Content-Type": "application/json"}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        new_access = data.get("access_token")
                        new_refresh = data.get("refresh_token")
                        expires_in = data.get("expires_in", 7776000)
                        new_exp = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)

                        db = SessionLocal()
                        try:
                            updates = {
                                "trakt_access_token": new_access,
                                "trakt_refresh_token": new_refresh,
                                "trakt_token_expires_at": new_exp.isoformat()
                            }
                            for k, v in updates.items():
                                if v:
                                    s = db.query(AppSetting).filter(AppSetting.key == k).first()
                                    if s:
                                        s.value = str(v)
                                    else:
                                        db.add(AppSetting(key=k, value=str(v)))
                            db.commit()
                        finally:
                            db.close()

                        return new_access
            except Exception as e:
                print(f"Error refreshing Trakt token: {e}")

        return access_token

    async def fetch_list(self) -> list[dict]:
        # Examples:
        # https://trakt.tv/users/donxy/lists/marvel-cinematic-universe
        # https://app.trakt.tv/users/donxy/lists/marvel-cinematic-universe
        match = re.search(r'users/([^/]+)/lists/([^/?#]+)', self.url)
        if not match:
            raise Exception(f"Invalid Trakt list URL format: {self.url}. Expected format: https://trakt.tv/users/username/lists/listname")
            
        username = match.group(1)
        list_id = match.group(2)
        
        # Check for user authenticated Trakt access token (with auto-refresh)
        access_token = await self._get_or_refresh_token()

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
                
                # Handle 401 Unauthorized: token expired or revoked
                if resp.status_code == 401:
                    # 1. If we sent Authorization header, try force refresh
                    if "Authorization" in headers:
                        new_tok = await self._get_or_refresh_token(force_refresh=True)
                        if new_tok and f"Bearer {new_tok}" != headers["Authorization"]:
                            headers["Authorization"] = f"Bearer {new_tok}"
                            resp = await client.get(api_url, headers=headers)
                    # 2. If still 401, fall back to unauthenticated public request
                    if resp.status_code == 401 and "Authorization" in headers:
                        headers.pop("Authorization", None)
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
