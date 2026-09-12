import httpx
import re
import os
import logging
from .base import BaseProvider

logger = logging.getLogger(__name__)

DEFAULT_SIMKL_CLIENT_ID = "62a587ec2a82dbed02c6ab48b923d72e775cb1096d2de60d04502413e36ef100"

class SIMKLProvider(BaseProvider):
    async def fetch_list(self) -> list[dict]:
        clean_url = self.url.strip()
        client_id = os.getenv("SIMKL_CLIENT_ID", DEFAULT_SIMKL_CLIENT_ID)
        access_token = None

        try:
            from ...database import SessionLocal
            from ...models import AppSetting
            db = SessionLocal()
            token_setting = db.query(AppSetting).filter(AppSetting.key == "simkl_access_token").first()
            if token_setting and token_setting.value:
                access_token = token_setting.value
            id_setting = db.query(AppSetting).filter(AppSetting.key == "simkl_client_id").first()
            if id_setting and id_setting.value:
                client_id = id_setting.value
            db.close()
        except Exception:
            pass

        headers = {
            "Content-Type": "application/json",
            "simkl-api-key": client_id,
            "User-Agent": "Playlistarr/1.0"
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Discovery lists (e.g. /movies/trending, /tv/trending, /tv/best, /anime/trending)
            discovery_match = re.search(r'/(movies|tv|anime)/(trending|best)', clean_url)
            if discovery_match:
                mtype = discovery_match.group(1)
                dtype = discovery_match.group(2)
                return await self._fetch_discovery(client, headers, mtype, dtype)

            # 2. Custom List (e.g. simkl.com/5742139/list/6837/marvel-mcu or simkl.com/list/6837)
            list_match = re.search(r'list/(\d+)', clean_url)
            if list_match:
                list_id = list_match.group(1)
                return await self._fetch_custom_list(client, headers, list_id)

            # 3. User watchlist or status list (e.g. /5742139/movies/plantowatch/ or /username/tv/completed/)
            user_status_match = re.search(r'/(movies|tv|anime)/([a-zA-Z0-9_-]+)', clean_url)
            if user_status_match and access_token:
                mtype = user_status_match.group(1)
                status = user_status_match.group(2)
                return await self._fetch_user_sync(client, headers, mtype, status)

            # Fallback attempt on custom list or discovery
            raise Exception(
                f"Unsupported SIMKL URL: {clean_url}. "
                "Supported formats: https://simkl.com/movies/trending, https://simkl.com/tv/best, "
                "or https://simkl.com/user_id/list/list_id"
            )

    async def _fetch_discovery(self, client: httpx.AsyncClient, headers: dict, mtype: str, dtype: str) -> list[dict]:
        api_url = f"https://api.simkl.com/{mtype}/{dtype}"
        resp = await client.get(api_url, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"SIMKL API error: HTTP {resp.status_code} ({resp.text[:100]})")

        data = resp.json()
        if not isinstance(data, list):
            raise Exception(f"Unexpected SIMKL discovery response: {str(data)[:100]}")

        items = []
        for order, it in enumerate(data, start=1):
            title = it.get("title")
            year = it.get("year")
            if not year and it.get("release_date"):
                # e.g. "09/03/2026"
                m = re.search(r'\b(19\d\d|20\d\d)\b', it["release_date"])
                if m:
                    year = int(m.group(1))

            ids = it.get("ids") or {}
            imdb_id = ids.get("imdb")
            tmdb_id = ids.get("tmdb")
            tvdb_id = ids.get("tvdb")

            item_type = "show" if mtype in ["tv", "anime"] else "movie"

            items.append({
                "title": title,
                "year": int(year) if year and str(year).isdigit() else None,
                "type": item_type,
                "imdb_id": str(imdb_id) if imdb_id else None,
                "tmdb_id": str(tmdb_id) if tmdb_id else None,
                "tvdb_id": str(tvdb_id) if tvdb_id else None,
                "show_title": None,
                "order": order
            })
        return items

    async def _fetch_custom_list(self, client: httpx.AsyncClient, headers: dict, list_id: str) -> list[dict]:
        api_url = f"https://api.simkl.com/lists/{list_id}"
        resp = await client.get(api_url, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"SIMKL API error: HTTP {resp.status_code} ({resp.text[:100]})")

        data = resp.json()
        if isinstance(data, dict) and data.get("error") == "premium_only":
            raise Exception(
                "SIMKL custom lists via API require a Simkl Pro/VIP account or connected user token. "
                "Please connect your SIMKL account in Settings or use SIMKL Discovery/Watchlist lists."
            )

        # Parse custom list items
        raw_items = data if isinstance(data, list) else data.get("items") or []
        items = []
        for order, it in enumerate(raw_items, start=1):
            m = it.get("movie") or it.get("show") or it.get("anime") or it
            title = m.get("title")
            year = m.get("year")
            ids = m.get("ids") or {}
            mtype = "show" if (it.get("show") or it.get("anime")) else "movie"

            items.append({
                "title": title,
                "year": int(year) if year and str(year).isdigit() else None,
                "type": mtype,
                "imdb_id": str(ids.get("imdb")) if ids.get("imdb") else None,
                "tmdb_id": str(ids.get("tmdb")) if ids.get("tmdb") else None,
                "tvdb_id": str(ids.get("tvdb")) if ids.get("tvdb") else None,
                "show_title": None,
                "order": order
            })
        return items

    async def _fetch_user_sync(self, client: httpx.AsyncClient, headers: dict, mtype: str, status: str) -> list[dict]:
        # Normalize status (e.g. watchlist -> plantowatch)
        norm_status = "plantowatch" if status in ["watchlist", "plantowatch", "plan_to_watch"] else status
        norm_type = "shows" if mtype in ["tv", "shows"] else mtype
        api_url = f"https://api.simkl.com/sync/all-items/{norm_type}/{norm_status}?extended=full"
        resp = await client.get(api_url, headers=headers)
        if resp.status_code != 200:
            raise Exception(f"SIMKL sync API error: HTTP {resp.status_code} ({resp.text[:100]})")

        data = resp.json()
        raw_items = data.get(norm_type) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        items = []
        for order, it in enumerate(raw_items, start=1):
            m = it.get("movie") or it.get("show") or it
            title = m.get("title")
            year = m.get("year")
            ids = m.get("ids") or {}
            item_type = "show" if norm_type in ["shows", "anime"] else "movie"

            items.append({
                "title": title,
                "year": int(year) if year and str(year).isdigit() else None,
                "type": item_type,
                "imdb_id": str(ids.get("imdb")) if ids.get("imdb") else None,
                "tmdb_id": str(ids.get("tmdb")) if ids.get("tmdb") else None,
                "tvdb_id": str(ids.get("tvdb")) if ids.get("tvdb") else None,
                "show_title": None,
                "order": order
            })
        return items
