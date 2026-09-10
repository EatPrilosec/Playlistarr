import httpx
import re

def _clean_str(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

class MediaServerClient:
    def __init__(self, server_url: str, api_key: str):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        
    async def search_item(
        self,
        title: str,
        year: int = None,
        item_type: str = None,
        imdb_id: str = None,
        tmdb_id: str = None,
        tvdb_id: str = None,
        show_title: str = None,
        client: httpx.AsyncClient = None
    ) -> str | None:
        """Search for an item by provider IDs or title and return its media server ID"""
        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=10.0)
            close_client = True
            
        try:
            # 1. Search by Provider IDs
            for pid_key, pid_val in [('imdb', imdb_id), ('tmdb', tmdb_id), ('tvdb', tvdb_id)]:
                if pid_val:
                    url = f"{self.server_url}/Items"
                    params = {
                        "api_key": self.api_key,
                        "Recursive": "true",
                        "AnyProviderIdEquals": f"{pid_key}.{pid_val}",
                        "IncludeItemTypes": "Movie,Series,Season,Episode,Video"
                    }
                    try:
                        resp = await client.get(url, params=params)
                        if resp.status_code == 200:
                            items = resp.json().get("Items", [])
                            if items:
                                return items[0].get("Id")
                    except Exception:
                        pass
            
            # 2. Fallback to title search
            if title:
                url = f"{self.server_url}/Items"
                include_types = "Movie,Series,Season,Episode"
                if item_type:
                    itype = item_type.lower()
                    if itype == "movie":
                        include_types = "Movie"
                    elif itype in ["show", "series"]:
                        include_types = "Series"
                    elif itype == "season":
                        include_types = "Season,Series"
                    elif itype == "episode":
                        include_types = "Episode"
                        
                params = {
                    "SearchTerm": title,
                    "Recursive": "true",
                    "api_key": self.api_key,
                    "IncludeItemTypes": include_types
                }
                try:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 200:
                        items = resp.json().get("Items", [])
                        clean_t = _clean_str(title)
                        for item in items:
                            # For episodes, verify series name if available
                            if item_type and item_type.lower() == "episode" and show_title:
                                series_name = item.get("SeriesName", "")
                                if _clean_str(series_name) != _clean_str(show_title):
                                    continue
                                    
                            if _clean_str(item.get("Name", "")) == clean_t:
                                if year and item.get("ProductionYear") and abs(item["ProductionYear"] - year) > 1:
                                    continue
                                return item.get("Id")
                except Exception:
                    pass
        finally:
            if close_client:
                await client.aclose()
                
        return None

    async def get_users(self) -> list[dict]:
        """Fetch all users from the media server"""
        url = f"{self.server_url}/Users"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params={"api_key": self.api_key})
            if resp.status_code == 200:
                return resp.json()
        return []

    async def create_or_update_playlist(self, name: str, item_ids: list[str], user_id: str = None):
        """Creates a playlist or updates an existing one"""
        if not user_id:
            users = await self.get_users()
            if users:
                user_id = users[0]["Id"]
            else:
                raise Exception("No users found on media server to assign playlist")
                
        # First check if playlist exists for this user
        url = f"{self.server_url}/Users/{user_id}/Items" if user_id else f"{self.server_url}/Items"
        params = {
            "IncludeItemTypes": "Playlist",
            "Recursive": "true",
            "SearchTerm": name,
            "api_key": self.api_key
        }
            
        playlist_id = None
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                items = resp.json().get("Items", [])
                for p in items:
                    if p.get("Name", "") == name:
                        playlist_id = p.get("Id")
                        break
        
            # If playlist exists, remove old one to recreate fresh with matched items
            if playlist_id:
                delete_url = f"{self.server_url}/Items/{playlist_id}"
                await client.delete(delete_url, params={"api_key": self.api_key})
            
            create_url = f"{self.server_url}/Playlists"
            create_params = {
                "api_key": self.api_key,
                "userId": user_id
            }
            
            # If items count <= 100, pass Ids directly to create
            if item_ids and len(item_ids) <= 100:
                create_params["Ids"] = ",".join(item_ids)
                
            resp = await client.post(create_url, json={"Name": name}, params=create_params)
            if resp.status_code != 200:
                raise Exception(f"Failed to create playlist {name}: {resp.status_code} {resp.text}")
                
            new_playlist_id = resp.json().get("Id")
            
            # If items count > 100, chunk into batches of 100 to avoid query string length limits
            if item_ids and len(item_ids) > 100 and new_playlist_id:
                chunk_size = 100
                for i in range(0, len(item_ids), chunk_size):
                    chunk = item_ids[i:i + chunk_size]
                    add_url = f"{self.server_url}/Playlists/{new_playlist_id}/Items"
                    add_params = {
                        "api_key": self.api_key,
                        "userId": user_id,
                        "Ids": ",".join(chunk)
                    }
                    add_resp = await client.post(add_url, params=add_params)
                    if add_resp.status_code not in [200, 204]:
                        raise Exception(f"Failed to add items batch to playlist: {add_resp.status_code} {add_resp.text}")
