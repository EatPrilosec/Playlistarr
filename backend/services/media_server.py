import httpx

class MediaServerClient:
    def __init__(self, server_url: str, api_key: str):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        
    async def search_item(self, title: str, year: int = None, item_type: str = None) -> str | None:
        """Search for an item and return its internal ID"""
        url = f"{self.server_url}/Items"
        params = {
            "SearchTerm": title,
            "Recursive": "true",
            "api_key": self.api_key
        }
        if item_type:
            # Map type string to Emby item types
            if item_type.lower() == "movie":
                params["IncludeItemTypes"] = "Movie"
            elif item_type.lower() == "show":
                params["IncludeItemTypes"] = "Series"
        
        # If year provided, we can optionally use it, but Emby sometimes uses Years for Movies
        # It's safer to get results and filter locally
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                items = resp.json().get("Items", [])
                for item in items:
                    if item.get("Name", "").lower() == title.lower():
                        if year and item.get("ProductionYear") != year:
                            continue
                        return item.get("Id")
                # If no exact match with year, return the first result
                if items:
                    return items[0].get("Id")
        return None

    async def create_or_update_playlist(self, name: str, item_ids: list[str]):
        """Creates a playlist or updates an existing one"""
        # First check if playlist exists
        url = f"{self.server_url}/Items"
        params = {
            "IncludeItemTypes": "Playlist",
            "Recursive": "true",
            "SearchTerm": name,
            "api_key": self.api_key
        }
        playlist_id = None
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                items = resp.json().get("Items", [])
                for p in items:
                    if p.get("Name", "") == name:
                        playlist_id = p.get("Id")
                        break
        
        # We either create a new one with items, or update existing
        if not playlist_id:
            create_url = f"{self.server_url}/Playlists"
            payload = {
                "Name": name,
                "Ids": ",".join(item_ids)
            }
            async with httpx.AsyncClient() as client:
                await client.post(create_url, json=payload, params={"api_key": self.api_key})
        else:
            # Clear and add items? Or delete and recreate? Emby API allows POST /Playlists/{Id}/Items
            # Simplest way: Delete and recreate
            delete_url = f"{self.server_url}/Items/{playlist_id}"
            async with httpx.AsyncClient() as client:
                await client.delete(delete_url, params={"api_key": self.api_key})
            
            # Recreate
            create_url = f"{self.server_url}/Playlists"
            payload = {
                "Name": name,
                "Ids": ",".join(item_ids)
            }
            async with httpx.AsyncClient() as client:
                await client.post(create_url, json=payload, params={"api_key": self.api_key})
