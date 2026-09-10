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

    async def get_users(self) -> list[dict]:
        """Fetch all users from the media server"""
        url = f"{self.server_url}/Users"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params={"api_key": self.api_key})
            if resp.status_code == 200:
                return resp.json()
        return []

    async def create_or_update_playlist(self, name: str, item_ids: list[str], user_id: str = None):
        """Creates a playlist or updates an existing one"""
        if not user_id:
            # Fallback to the first user if none provided (Jellyfin requires it)
            users = await self.get_users()
            if users:
                user_id = users[0]["Id"]
            else:
                raise Exception("No users found on media server to assign playlist")
                
        # First check if playlist exists
        url = f"{self.server_url}/Items"
        params = {
            "IncludeItemTypes": "Playlist",
            "Recursive": "true",
            "SearchTerm": name,
            "api_key": self.api_key,
            "userId": user_id
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
        if playlist_id:
            delete_url = f"{self.server_url}/Items/{playlist_id}"
            async with httpx.AsyncClient() as client:
                await client.delete(delete_url, params={"api_key": self.api_key})
            
        create_url = f"{self.server_url}/Playlists"
        create_params = {"api_key": self.api_key, "userId": user_id}
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(create_url, json={"Name": name}, params=create_params)
            if resp.status_code != 200:
                raise Exception(f"Failed to create playlist {name}: {resp.status_code} {resp.text}")
                
            playlist_id = resp.json().get("Id")
            
        if item_ids and playlist_id:
            add_items_url = f"{self.server_url}/Playlists/{playlist_id}/Items"
            add_params = {
                "api_key": self.api_key,
                "userId": user_id,
                "Ids": ",".join(item_ids)
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(add_items_url, params=add_params)
                if resp.status_code not in [200, 204]:
                    raise Exception(f"Failed to add items to playlist: {resp.status_code} {resp.text}")
