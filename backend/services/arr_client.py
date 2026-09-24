import httpx
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from ..models import AppSetting

class RadarrClient:
    def __init__(self, url: str, api_key: str):
        self.url = (url or "").rstrip("/")
        self.api_key = api_key or ""
        self.headers = {
            "X-Api-Key": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    async def test_connection(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/system/status", headers=self.headers)
            if resp.status_code != 200:
                raise Exception(f"Radarr returned HTTP {resp.status_code}: {resp.text[:100]}")
            data = resp.json()
            return {
                "appName": data.get("appName", "Radarr"),
                "version": data.get("version", "Unknown")
            }

    async def get_root_folders(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/rootfolder", headers=self.headers)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [{"id": rf.get("id"), "path": rf.get("path"), "freeSpace": rf.get("freeSpace")} for rf in data]

    async def get_quality_profiles(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/qualityprofile", headers=self.headers)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [{"id": qp.get("id"), "name": qp.get("name")} for qp in data]

    async def lookup_movie(
        self,
        title: Optional[str] = None,
        year: Optional[int] = None,
        tmdb_id: Optional[Any] = None,
        imdb_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            candidates = []
            
            # 1. Try tmdb:ID
            if tmdb_id:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/movie/lookup",
                        params={"term": f"tmdb:{tmdb_id}"},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            return data
                except Exception:
                    pass

            # 2. Try imdb:ID
            if imdb_id:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/movie/lookup",
                        params={"term": f"imdb:{imdb_id}"},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            return data
                except Exception:
                    pass

            # 3. Try title
            if title:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/movie/lookup",
                        params={"term": title},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            # Sort/filter by year if available
                            if year:
                                exact_year = [m for m in data if m.get("year") == year]
                                if exact_year:
                                    return exact_year
                            return data
                except Exception:
                    pass

            return candidates

    async def add_movie(
        self,
        movie: Dict[str, Any],
        quality_profile_id: int,
        root_folder_path: str,
        search_on_add: bool = True
    ) -> Dict[str, Any]:
        # Check if already in library
        if movie.get("id") and movie.get("id") > 0:
            return {
                "status": "already_exists",
                "title": movie.get("title"),
                "message": f"'{movie.get('title')}' is already in your Radarr library",
                "id": movie.get("id")
            }

        payload = {
            **movie,
            "qualityProfileId": quality_profile_id,
            "rootFolderPath": root_folder_path,
            "monitored": True,
            "addOptions": {
                "searchForMovie": search_on_add
            }
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.url}/api/v3/movie",
                json=payload,
                headers=self.headers
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "status": "added",
                    "title": data.get("title", movie.get("title")),
                    "message": f"Added '{data.get('title', movie.get('title'))}' to Radarr",
                    "id": data.get("id")
                }
            elif resp.status_code == 400:
                err_text = resp.text
                if "already exists" in err_text.lower() or "moviealreadyexists" in err_text.lower():
                    return {
                        "status": "already_exists",
                        "title": movie.get("title"),
                        "message": f"'{movie.get('title')}' already exists in Radarr library"
                    }
                raise Exception(f"Radarr rejected addition: {err_text[:120]}")
            else:
                raise Exception(f"Radarr returned HTTP {resp.status_code}: {resp.text[:120]}")

    async def get_import_lists(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/importlist", headers=self.headers)
            if resp.status_code != 200:
                return []
            return resp.json()

    async def create_custom_import_list(
        self,
        name: str,
        list_url: str,
        quality_profile_id: int,
        root_folder_path: str,
        enable_auto: bool = False
    ) -> Dict[str, Any]:
        payload = {
            "name": name,
            "enabled": True,
            "enableAuto": False,
            "qualityProfileId": quality_profile_id,
            "rootFolderPath": root_folder_path,
            "searchOnAdd": False,
            "implementation": "RadarrListImport",
            "configContract": "RadarrListSettings",
            "fields": [
                {
                    "name": "url",
                    "value": list_url
                }
            ]
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.url}/api/v3/importlist",
                json=payload,
                headers=self.headers
            )
            if resp.status_code in (200, 201):
                return resp.json()
            raise Exception(f"Radarr failed to create import list (HTTP {resp.status_code}): {resp.text[:150]}")

    async def delete_import_list(self, list_id: int) -> bool:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(
                f"{self.url}/api/v3/importlist/{list_id}",
                headers=self.headers
            )
            return resp.status_code in (200, 204)

    async def delete_import_lists_matching_url(self, url_pattern: str) -> int:
        lists = await self.get_import_lists()
        deleted = 0
        for l in lists:
            fields = l.get("fields", [])
            for f in fields:
                if f.get("name") in ("url", "baseUrl") and url_pattern in str(f.get("value", "")):
                    if await self.delete_import_list(l.get("id")):
                        deleted += 1
                    break
        return deleted


class SonarrClient:
    def __init__(self, url: str, api_key: str):
        self.url = (url or "").rstrip("/")
        self.api_key = api_key or ""
        self.headers = {
            "X-Api-Key": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    async def test_connection(self) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/system/status", headers=self.headers)
            if resp.status_code != 200:
                raise Exception(f"Sonarr returned HTTP {resp.status_code}: {resp.text[:100]}")
            data = resp.json()
            return {
                "appName": data.get("appName", "Sonarr"),
                "version": data.get("version", "Unknown")
            }

    async def get_root_folders(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/rootfolder", headers=self.headers)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [{"id": rf.get("id"), "path": rf.get("path"), "freeSpace": rf.get("freeSpace")} for rf in data]

    async def get_quality_profiles(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/qualityprofile", headers=self.headers)
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [{"id": qp.get("id"), "name": qp.get("name")} for qp in data]

    async def lookup_series(
        self,
        title: Optional[str] = None,
        tvdb_id: Optional[Any] = None,
        imdb_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            candidates = []

            # 1. Try tvdb:ID
            if tvdb_id:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/series/lookup",
                        params={"term": f"tvdb:{tvdb_id}"},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            return data
                except Exception:
                    pass

            # 2. Try imdb:ID
            if imdb_id:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/series/lookup",
                        params={"term": f"imdb:{imdb_id}"},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            return data
                except Exception:
                    pass

            # 3. Try title
            if title:
                try:
                    resp = await client.get(
                        f"{self.url}/api/v3/series/lookup",
                        params={"term": title},
                        headers=self.headers
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data and isinstance(data, list):
                            return data
                except Exception:
                    pass

            return candidates

    async def add_series(
        self,
        series: Dict[str, Any],
        quality_profile_id: int,
        root_folder_path: str,
        search_on_add: bool = True,
        season_folder: bool = True
    ) -> Dict[str, Any]:
        # Check if already in library
        if series.get("id") and series.get("id") > 0:
            return {
                "status": "already_exists",
                "title": series.get("title"),
                "message": f"'{series.get('title')}' is already in your Sonarr library",
                "id": series.get("id")
            }

        payload = {
            **series,
            "qualityProfileId": quality_profile_id,
            "rootFolderPath": root_folder_path,
            "monitored": True,
            "seasonFolder": season_folder,
            "addOptions": {
                "searchForMissingEpisodes": search_on_add
            }
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.url}/api/v3/series",
                json=payload,
                headers=self.headers
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                return {
                    "status": "added",
                    "title": data.get("title", series.get("title")),
                    "message": f"Added '{data.get('title', series.get('title'))}' to Sonarr",
                    "id": data.get("id")
                }
            elif resp.status_code == 400:
                err_text = resp.text
                if "already exists" in err_text.lower() or "seriesalreadyexists" in err_text.lower():
                    return {
                        "status": "already_exists",
                        "title": series.get("title"),
                        "message": f"'{series.get('title')}' already exists in Sonarr library"
                    }
                raise Exception(f"Sonarr rejected addition: {err_text[:120]}")
            else:
                raise Exception(f"Sonarr returned HTTP {resp.status_code}: {resp.text[:120]}")

    async def get_import_lists(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.url}/api/v3/importlist", headers=self.headers)
            if resp.status_code != 200:
                return []
            return resp.json()

    async def create_custom_import_list(
        self,
        name: str,
        list_url: str,
        quality_profile_id: int,
        root_folder_path: str,
        enable_auto: bool = False,
        season_folder: bool = True
    ) -> Dict[str, Any]:
        payload = {
            "name": name,
            "enabled": True,
            "enableAuto": False,
            "qualityProfileId": quality_profile_id,
            "rootFolderPath": root_folder_path,
            "searchOnAdd": False,
            "seasonFolder": season_folder,
            "implementation": "CustomImport",
            "configContract": "CustomSettings",
            "fields": [
                {
                    "name": "baseUrl",
                    "value": list_url
                }
            ]
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.url}/api/v3/importlist",
                json=payload,
                headers=self.headers
            )
            if resp.status_code in (200, 201):
                return resp.json()
            raise Exception(f"Sonarr failed to create import list (HTTP {resp.status_code}): {resp.text[:150]}")

    async def delete_import_list(self, list_id: int) -> bool:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(
                f"{self.url}/api/v3/importlist/{list_id}",
                headers=self.headers
            )
            return resp.status_code in (200, 204)

    async def delete_import_lists_matching_url(self, url_pattern: str) -> int:
        lists = await self.get_import_lists()
        deleted = 0
        for l in lists:
            fields = l.get("fields", [])
            for f in fields:
                if f.get("name") in ("baseUrl", "url") and url_pattern in str(f.get("value", "")):
                    if await self.delete_import_list(l.get("id")):
                        deleted += 1
                    break
        return deleted


def get_arr_config(db: Session) -> Dict[str, Any]:
    """Helper to fetch all Sonarr & Radarr settings from database."""
    keys = [
        "radarr_url", "radarr_api_key", "radarr_quality_profile_id",
        "radarr_root_folder_path", "radarr_search_on_add",
        "sonarr_url", "sonarr_api_key", "sonarr_quality_profile_id",
        "sonarr_root_folder_path", "sonarr_search_on_add", "sonarr_season_folder"
    ]
    settings_dict = {}
    records = db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()
    for rec in records:
        settings_dict[rec.key] = rec.value

    radarr_url = settings_dict.get("radarr_url")
    radarr_api = settings_dict.get("radarr_api_key")
    sonarr_url = settings_dict.get("sonarr_url")
    sonarr_api = settings_dict.get("sonarr_api_key")

    radarr_profile_id = settings_dict.get("radarr_quality_profile_id")
    sonarr_profile_id = settings_dict.get("sonarr_quality_profile_id")

    return {
        "radarr": {
            "configured": bool(radarr_url and radarr_api),
            "url": radarr_url or "",
            "api_key": radarr_api or "",
            "quality_profile_id": int(radarr_profile_id) if radarr_profile_id and radarr_profile_id.isdigit() else None,
            "root_folder_path": settings_dict.get("radarr_root_folder_path") or "",
            "search_on_add": settings_dict.get("radarr_search_on_add", "true").lower() == "true"
        },
        "sonarr": {
            "configured": bool(sonarr_url and sonarr_api),
            "url": sonarr_url or "",
            "api_key": sonarr_api or "",
            "quality_profile_id": int(sonarr_profile_id) if sonarr_profile_id and sonarr_profile_id.isdigit() else None,
            "root_folder_path": settings_dict.get("sonarr_root_folder_path") or "",
            "search_on_add": settings_dict.get("sonarr_search_on_add", "true").lower() == "true",
            "season_folder": settings_dict.get("sonarr_season_folder", "true").lower() == "true"
        }
    }
