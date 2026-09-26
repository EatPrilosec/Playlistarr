import httpx
import re

def _clean_str(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

def _generate_search_queries(title: str, item_type: str = None) -> list[str]:
    if not title:
        return []
    queries = []
    seen = set()

    def add(q: str):
        q_clean = q.strip()
        if q_clean and q_clean.lower() not in seen:
            seen.add(q_clean.lower())
            queries.append(q_clean)

    add(title)

    if "volume" in title.lower():
        add(re.sub(r'volume', 'Vol.', title, flags=re.IGNORECASE))
    if "." in title:
        add(title.replace(".", ""))
    elif len(title) <= 5 and title.isupper():
        add(".".join(list(title)) + ".")

    # Subtitle splitting on ':' (e.g. "Star Wars: Episode IV - A New Hope" -> "Star Wars", "A New Hope")
    if ":" in title:
        parts = title.split(":", 1)
        add(parts[0])
        add(parts[1])
        if "-" in parts[1]:
            subparts = parts[1].split("-", 1)
            add(subparts[0])
            add(subparts[1])

    # Subtitle splitting on ' - ' (e.g. "Star Wars - The Empire Strikes Back")
    if " - " in title:
        parts = title.split(" - ", 1)
        add(parts[0])
        add(parts[1])

    # Stylized numbers (e.g. "Seven" <-> "Se7en")
    t_lower = title.lower()
    if "seven" in t_lower:
        add(re.sub(r'\bseven\b', 'se7en', title, flags=re.IGNORECASE))
    elif "se7en" in t_lower:
        add(re.sub(r'\bse7en\b', 'seven', title, flags=re.IGNORECASE))

    return queries

class MediaServerClient:
    def __init__(self, server_url: str, api_key: str, server_type: str = "emby"):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.server_type = (server_type or "emby").lower()
        self.headers = {
            "Authorization": f'MediaBrowser Token="{self.api_key}"',
            "X-Emby-Token": self.api_key
        }

    async def detect_server_type(self) -> str:
        """Detects whether the media server is Emby or Jellyfin."""
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=5.0) as client:
                resp = await client.get(f"{self.server_url}/System/Info/Public")
                if resp.status_code == 200:
                    prod = str(resp.json().get("ProductName", "")).lower()
                    srv_hdr = str(resp.headers.get("Server", "")).lower()
                    if "jellyfin" in prod or "jellyfin" in srv_hdr:
                        self.server_type = "jellyfin"
                        return "jellyfin"
                    elif "emby" in prod or "emby" in srv_hdr or resp.json().get("ServerName"):
                        self.server_type = "emby"
                        return "emby"
        except Exception:
            pass
        return self.server_type
        
    async def find_series_id(
        self,
        show_title: str = None,
        year: int = None,
        imdb_id: str = None,
        tmdb_id: str = None,
        tvdb_id: str = None,
        client: httpx.AsyncClient = None
    ) -> str | None:
        """Find the Media Server Series Id using provider IDs or title"""
        close_client = False
        if client is None:
            client = httpx.AsyncClient(headers=self.headers, timeout=10.0)
            close_client = True

        try:
            # 1. For Emby: AnyProviderIdEquals on Series
            if self.server_type == "emby":
                for pid_key, pid_val in [('imdb', imdb_id), ('tvdb', tvdb_id), ('tmdb', tmdb_id)]:
                    if pid_val:
                        try:
                            resp = await client.get(f"{self.server_url}/Items", params={
                                "Recursive": "true",
                                "AnyProviderIdEquals": f"{pid_key}.{pid_val}",
                                "IncludeItemTypes": "Series",
                                "fields": "ProviderIds,Name,ProductionYear"
                            }, headers=self.headers)
                            if resp.status_code == 200:
                                items = resp.json().get("Items", [])
                                if items:
                                    return items[0].get("Id")
                        except Exception:
                            pass

            # 2. Search by show_title or candidate queries
            if show_title:
                search_queries = _generate_search_queries(show_title, "show")
                clean_st = _clean_str(show_title)
                for sq in search_queries:
                    try:
                        resp = await client.get(f"{self.server_url}/Items", params={
                            "SearchTerm": sq,
                            "Recursive": "true",
                            "IncludeItemTypes": "Series",
                            "fields": "ProviderIds,Name,ProductionYear"
                        }, headers=self.headers)
                        if resp.status_code == 200:
                            items = resp.json().get("Items", [])
                            # Match by candidate ProviderIds
                            for it in items:
                                pids = it.get("ProviderIds", {}) or {}
                                if imdb_id and pids.get("Imdb") == imdb_id:
                                    return it.get("Id")
                                if tvdb_id and str(pids.get("Tvdb")) == str(tvdb_id):
                                    return it.get("Id")
                                if tmdb_id and str(pids.get("Tmdb")) == str(tmdb_id):
                                    return it.get("Id")

                            for it in items:
                                it_year = it.get("ProductionYear")
                                if year and it_year and abs(it_year - year) > 2:
                                    continue
                                it_name = _clean_str(it.get("Name", ""))
                                if it_name == clean_st:
                                    return it.get("Id")
                                if len(clean_st) >= 4 and (clean_st in it_name or it_name in clean_st):
                                    return it.get("Id")
                    except Exception:
                        pass
        finally:
            if close_client:
                await client.aclose()

        return None

    async def search_item(
        self,
        title: str,
        year: int = None,
        item_type: str = None,
        imdb_id: str = None,
        tmdb_id: str = None,
        tvdb_id: str = None,
        show_title: str = None,
        season_number: int = None,
        episode_number: int = None,
        client: httpx.AsyncClient = None
    ) -> str | None:
        """Search for an item by provider IDs or title and return its media server ID"""
        close_client = False
        if client is None:
            client = httpx.AsyncClient(headers=self.headers, timeout=10.0)
            close_client = True
            
        try:
            itype = (item_type or "").lower()

            # --- A. SPECIALIZED SEASON RESOLUTION ---
            if itype == "season":
                target_show = show_title or title
                series_id = await self.find_series_id(
                    show_title=target_show,
                    year=year,
                    imdb_id=imdb_id,
                    tmdb_id=tmdb_id,
                    tvdb_id=tvdb_id,
                    client=client
                )
                if series_id:
                    try:
                        resp = await client.get(f"{self.server_url}/Shows/{series_id}/Seasons", headers=self.headers)
                        if resp.status_code == 200:
                            seasons = resp.json().get("Items", [])
                            # 1. Match by season_number (IndexNumber)
                            if season_number is not None:
                                for s in seasons:
                                    if s.get("IndexNumber") == season_number:
                                        return s.get("Id")
                                # Fallback by Season Name
                                for s in seasons:
                                    s_name = (s.get("Name") or "").strip().lower()
                                    if s_name in [f"season {season_number}", f"season 0{season_number}", f"series {season_number}"]:
                                        return s.get("Id")
                            # 2. Match by clean season title
                            clean_t = _clean_str(title)
                            for s in seasons:
                                if _clean_str(s.get("Name", "")) == clean_t:
                                    return s.get("Id")
                    except Exception:
                        pass
                # Strict: Never return parent Series ID when a Season was requested
                return None

            # --- B. SPECIALIZED EPISODE RESOLUTION ---
            if itype == "episode":
                target_show = show_title
                series_id = None
                if target_show:
                    series_id = await self.find_series_id(
                        show_title=target_show,
                        year=year,
                        imdb_id=imdb_id,
                        tmdb_id=tmdb_id,
                        tvdb_id=tvdb_id,
                        client=client
                    )
                if series_id:
                    try:
                        ep_params = {"fields": "ProviderIds,Name,Path,IndexNumber,ParentIndexNumber"}
                        if season_number is not None:
                            ep_params["season"] = season_number
                        resp = await client.get(f"{self.server_url}/Shows/{series_id}/Episodes", params=ep_params, headers=self.headers)
                        if resp.status_code == 200:
                            eps = resp.json().get("Items", [])
                            # Match by season & episode number
                            if episode_number is not None:
                                for ep in eps:
                                    ep_num = ep.get("IndexNumber")
                                    s_num = ep.get("ParentIndexNumber")
                                    if ep_num == episode_number:
                                        if season_number is None or s_num is None or s_num == season_number:
                                            return ep.get("Id")
                            # Match by episode ProviderIds
                            for ep in eps:
                                pids = ep.get("ProviderIds", {}) or {}
                                if tvdb_id and str(pids.get("Tvdb")) == str(tvdb_id):
                                    return ep.get("Id")
                                if imdb_id and pids.get("Imdb") == imdb_id:
                                    return ep.get("Id")
                                if tmdb_id and str(pids.get("Tmdb")) == str(tmdb_id):
                                    return ep.get("Id")
                            # Match by episode title
                            clean_t = _clean_str(title)
                            for ep in eps:
                                if _clean_str(ep.get("Name", "")) == clean_t:
                                    return ep.get("Id")
                    except Exception:
                        pass

                # Episode fallback: search /Items specifically for IncludeItemTypes="Episode"
                search_queries = _generate_search_queries(title, "episode")
                clean_t = _clean_str(title)
                for sq in search_queries:
                    try:
                        resp = await client.get(f"{self.server_url}/Items", params={
                            "SearchTerm": sq,
                            "Recursive": "true",
                            "IncludeItemTypes": "Episode",
                            "fields": "ProviderIds,SeriesName,Path,ProductionYear,Name,IndexNumber,ParentIndexNumber"
                        }, headers=self.headers)
                        if resp.status_code == 200:
                            items = resp.json().get("Items", [])
                            for it in items:
                                if show_title:
                                    s_name = it.get("SeriesName", "")
                                    if s_name and _clean_str(s_name) != _clean_str(show_title):
                                        continue
                                if episode_number is not None and it.get("IndexNumber") == episode_number:
                                    if season_number is None or it.get("ParentIndexNumber") == season_number:
                                        return it.get("Id")
                                if _clean_str(it.get("Name", "")) == clean_t:
                                    return it.get("Id")
                    except Exception:
                        pass
                # Strict: Never return Series or Season ID when an Episode was requested
                return None

            # --- C. MOVIES, SERIES, & GENERAL ITEMS ---
            # 1. For Emby, AnyProviderIdEquals is fast and native
            if self.server_type == "emby":
                inc_types = "Movie,Series,Video"
                if itype == "movie":
                    inc_types = "Movie,Video"
                elif itype in ["show", "series"]:
                    inc_types = "Series"

                for pid_key, pid_val in [('imdb', imdb_id), ('tmdb', tmdb_id), ('tvdb', tvdb_id)]:
                    if pid_val:
                        url = f"{self.server_url}/Items"
                        params = {
                            "Recursive": "true",
                            "AnyProviderIdEquals": f"{pid_key}.{pid_val}",
                            "IncludeItemTypes": inc_types,
                            "fields": "ProviderIds,SeriesName,Path,ProductionYear,Name"
                        }
                        try:
                            resp = await client.get(url, params=params, headers=self.headers)
                            if resp.status_code == 200:
                                items = resp.json().get("Items", [])
                                if items:
                                    return items[0].get("Id")
                        except Exception:
                            pass

            # 2. Search by SearchTerm with candidate provider IDs and title/path filtering
            include_types = "Movie,Series,Video"
            if itype == "movie":
                include_types = "Movie,Video"
            elif itype in ["show", "series"]:
                include_types = "Series"

            search_queries = _generate_search_queries(title, item_type)
            clean_t = _clean_str(title)

            for sq in search_queries:
                url = f"{self.server_url}/Items"
                params = {
                    "SearchTerm": sq,
                    "Recursive": "true",
                    "IncludeItemTypes": include_types,
                    "fields": "ProviderIds,SeriesName,Path,ProductionYear,Name"
                }
                try:
                    resp = await client.get(url, params=params, headers=self.headers)
                    if resp.status_code == 200:
                        items = resp.json().get("Items", [])

                        # 2a. Match by candidate ProviderIds if present
                        for it in items:
                            pids = it.get("ProviderIds", {}) or {}
                            if imdb_id and pids.get("Imdb") == imdb_id:
                                return it.get("Id")
                            if tmdb_id and str(pids.get("Tmdb")) == str(tmdb_id):
                                return it.get("Id")
                            if tvdb_id and str(pids.get("Tvdb")) == str(tvdb_id):
                                return it.get("Id")

                        # 2b. Match by candidate Name / Path WITH STRICT YEAR CHECK
                        for it in items:
                            it_year = it.get("ProductionYear")
                            if year and it_year and abs(it_year - year) > 1:
                                continue

                            it_name = _clean_str(it.get("Name", ""))
                            it_path = _clean_str(it.get("Path", ""))

                            # Exact title match
                            if it_name == clean_t:
                                if not year or not it_year or abs(it_year - year) <= 1:
                                    return it.get("Id")

                            # Substring match requires minimum length (>= 4 chars) and strict year confirmation
                            if len(clean_t) >= 4 and ((clean_t in it_path) or (clean_t in it_name)):
                                if year and it_year and abs(it_year - year) <= 1:
                                    return it.get("Id")
                except Exception:
                    pass

        finally:
            if close_client:
                await client.aclose()
                
        return None

    async def get_users(self) -> list[dict]:
        """Fetch all users from the media server"""
        url = f"{self.server_url}/Users"
        async with httpx.AsyncClient(headers=self.headers, timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
            raise Exception(f"Failed to get users (HTTP {resp.status_code}): {resp.text}")

    async def create_or_update_playlist(self, name: str, item_ids: list[str], user_id: str = None, images: dict = None, is_public: bool = True):
        """Creates a playlist or updates an existing one, and sets custom artwork if provided"""
        # For private playlists or Jellyfin public playlists, resolve target user ID
        if not user_id and (self.server_type == "jellyfin" or not is_public):
            users = await self.get_users()
            admin_u = None
            for u in users:
                if u.get("Policy", {}).get("IsAdministrator"):
                    admin_u = u.get("Id")
                    break
            user_id = admin_u or (users[0]["Id"] if users else None)
            if not user_id and not is_public:
                raise Exception("No users found on media server to assign playlist")
                
        # First check if playlist exists for this user or server-wide
        url = f"{self.server_url}/Users/{user_id}/Items" if user_id else f"{self.server_url}/Items"
        check_urls = [url]
        if self.server_type == "jellyfin" or not user_id or is_public:
            global_url = f"{self.server_url}/Items"
            if global_url not in check_urls:
                check_urls.append(global_url)

        params = {
            "IncludeItemTypes": "Playlist",
            "Recursive": "true",
            "SearchTerm": name
        }
            
        existing_ids = []
        async with httpx.AsyncClient(headers=self.headers, timeout=90.0) as client:
            seen_existing = set()
            for cur_url in check_urls:
                try:
                    resp = await client.get(cur_url, params=params)
                    if resp.status_code == 200:
                        items = resp.json().get("Items", [])
                        for p in items:
                            pid = p.get("Id")
                            if (p.get("Name") or "").strip().lower() == name.strip().lower() and pid and pid not in seen_existing:
                                seen_existing.add(pid)
                                existing_ids.append(pid)
                except Exception as e:
                    print(f"Error checking existing playlists at {cur_url}: {e}")
        
            # If playlist(s) exist, remove them to recreate fresh with matched items
            for old_id in existing_ids:
                try:
                    delete_url = f"{self.server_url}/Items/{old_id}"
                    await client.delete(delete_url)
                except Exception as de:
                    print(f"Error removing existing playlist {old_id}: {de}")
            
            create_url = f"{self.server_url}/Playlists"
            create_params = {
                "mediaType": "Video"
            }
            if user_id:
                create_params["userId"] = user_id
            
            # Pass initial batch directly to create the playlist (up to 100 items)
            initial_ids = item_ids[:100] if item_ids else []
            remaining_ids = item_ids[100:] if item_ids and len(item_ids) > 100 else []
            if initial_ids:
                create_params["Ids"] = ",".join(initial_ids)

            create_body = {
                "Name": name,
                "IsPublic": is_public,
                "MediaType": "Video"
            }
            if user_id:
                create_body["UserId"] = user_id
            if not is_public and user_id:
                create_body["Users"] = [
                    {"UserId": user_id, "CanEdit": True}
                ]
                
            resp = await client.post(create_url, json=create_body, params=create_params)
            # If rejected without userId (e.g. server is Jellyfin or requires an owner), resolve admin and retry
            if resp.status_code != 200 and not user_id:
                try:
                    users = await self.get_users()
                    admin_u = None
                    for u in users:
                        if u.get("Policy", {}).get("IsAdministrator"):
                            admin_u = u.get("Id")
                            break
                    retry_user_id = admin_u or (users[0]["Id"] if users else None)
                    if retry_user_id:
                        user_id = retry_user_id
                        create_params["userId"] = retry_user_id
                        create_body["UserId"] = retry_user_id
                        self.server_type = "jellyfin"
                        resp = await client.post(create_url, json=create_body, params=create_params)
                except Exception as retry_err:
                    print(f"Fallback retry with userId failed: {retry_err}")

            if resp.status_code != 200:
                raise Exception(f"Failed to create playlist {name}: {resp.status_code} {resp.text}")
                
            new_playlist_id = resp.json().get("Id")
            
            # If remaining items exist, chunk into batches of 100 to avoid query string length limits
            if remaining_ids and new_playlist_id:
                chunk_size = 100
                for i in range(0, len(remaining_ids), chunk_size):
                    chunk = remaining_ids[i:i + chunk_size]
                    add_url = f"{self.server_url}/Playlists/{new_playlist_id}/Items"
                    add_params = {
                        "ids": ",".join(chunk)
                    }
                    if user_id:
                        add_params["userId"] = user_id
                    add_resp = await client.post(add_url, params=add_params)
                    if add_resp.status_code not in [200, 204]:
                        raise Exception(f"Failed to add items batch to playlist: {add_resp.status_code} {add_resp.text}")

            # If images provided, set them on the playlist
            if images and new_playlist_id:
                for img_type, img_url in images.items():
                    if not img_url:
                        continue
                    resolved_url = img_url
                    if resolved_url.startswith("/"):
                        resolved_url = f"http://127.0.0.1:8671{resolved_url}"
                    try:
                        dl_url = f"{self.server_url}/Items/{new_playlist_id}/RemoteImages/Download"
                        await client.post(dl_url, params={"Type": img_type, "ImageUrl": resolved_url})
                    except Exception as ie:
                        print(f"Failed to set {img_type} image on {name}: {ie}")

    async def delete_playlist(self, name: str, user_id: str = None) -> list[str]:
        """Deletes all playlists matching name (case-insensitive) for a specific user or globally across all users."""
        deleted_ids = []
        clean_name = (name or "").strip().lower()
        if not clean_name:
            return deleted_ids

        async with httpx.AsyncClient(headers=self.headers, timeout=15.0) as client:
            candidate_items = []
            # 1. Server-wide playlists query
            try:
                resp = await client.get(f"{self.server_url}/Items", params={
                    "IncludeItemTypes": "Playlist",
                    "Recursive": "true"
                })
                if resp.status_code == 200:
                    candidate_items.extend(resp.json().get("Items", []))
            except Exception as e:
                print(f"Error fetching /Items in delete_playlist: {e}")

            # 2. Check per-user items if specific user_id or all users if user_id is None
            try:
                if user_id:
                    users_to_check = [{"Id": user_id}]
                else:
                    users_to_check = await self.get_users()
            except Exception:
                users_to_check = []

            for u in users_to_check:
                uid = u.get("Id")
                if not uid:
                    continue
                try:
                    u_resp = await client.get(f"{self.server_url}/Users/{uid}/Items", params={
                        "IncludeItemTypes": "Playlist",
                        "Recursive": "true"
                    })
                    if u_resp.status_code == 200:
                        candidate_items.extend(u_resp.json().get("Items", []))
                except Exception:
                    pass

            # Filter exact name match (case-insensitive) and deduplicate IDs
            seen_ids = set()
            for it in candidate_items:
                it_id = it.get("Id")
                it_name = (it.get("Name") or "").strip().lower()
                if it_id and it_id not in seen_ids and it_name == clean_name:
                    seen_ids.add(it_id)
                    try:
                        del_resp = await client.delete(f"{self.server_url}/Items/{it_id}")
                        if del_resp.status_code in (200, 204):
                            deleted_ids.append(it_id)
                    except Exception as de:
                        print(f"Failed to delete playlist {it_id} ({it.get('Name')}): {de}")

        return deleted_ids

    async def rename_playlist(self, old_name: str, new_name: str, user_id: str = None) -> list[str]:
        """Renames all playlists matching old_name to new_name, or deletes old_name if new_name already exists."""
        clean_old = (old_name or "").strip().lower()
        clean_new = (new_name or "").strip().lower()
        if not clean_old or not clean_new or clean_old == clean_new:
            return []

        affected_ids = []
        async with httpx.AsyncClient(headers=self.headers, timeout=15.0) as client:
            candidate_items = []
            try:
                resp = await client.get(f"{self.server_url}/Items", params={
                    "IncludeItemTypes": "Playlist",
                    "Recursive": "true"
                })
                if resp.status_code == 200:
                    candidate_items.extend(resp.json().get("Items", []))
            except Exception as e:
                print(f"Error fetching /Items in rename_playlist: {e}")

            try:
                if user_id:
                    users_to_check = [{"Id": user_id}]
                else:
                    users_to_check = await self.get_users()
            except Exception:
                users_to_check = []

            for u in users_to_check:
                uid = u.get("Id")
                if not uid:
                    continue
                try:
                    u_resp = await client.get(f"{self.server_url}/Users/{uid}/Items", params={
                        "IncludeItemTypes": "Playlist",
                        "Recursive": "true"
                    })
                    if u_resp.status_code == 200:
                        candidate_items.extend(u_resp.json().get("Items", []))
                except Exception:
                    pass

            # Check if any playlist with new_name already exists
            new_name_exists = any(
                (it.get("Name") or "").strip().lower() == clean_new
                for it in candidate_items
            )

            seen_ids = set()
            for it in candidate_items:
                it_id = it.get("Id")
                it_name = (it.get("Name") or "").strip().lower()
                if it_id and it_id not in seen_ids and it_name == clean_old:
                    seen_ids.add(it_id)
                    # If new_name already exists on the server, delete old_name to avoid duplicates
                    if new_name_exists:
                        try:
                            del_resp = await client.delete(f"{self.server_url}/Items/{it_id}")
                            if del_resp.status_code in (200, 204):
                                affected_ids.append(it_id)
                        except Exception as de:
                            print(f"Failed to delete duplicate old playlist {it_id}: {de}")
                    else:
                        # Otherwise, rename in-place via POST /Items/{it_id}
                        try:
                            item_data = None
                            if users_to_check:
                                uid = users_to_check[0].get("Id")
                                u_get = await client.get(f"{self.server_url}/Users/{uid}/Items/{it_id}")
                                if u_get.status_code == 200:
                                    item_data = u_get.json()
                            if not item_data:
                                get_resp = await client.get(f"{self.server_url}/Items", params={"Ids": it_id})
                                if get_resp.status_code == 200:
                                    items = get_resp.json().get("Items", [])
                                    if items:
                                        item_data = items[0]
                            if item_data:
                                item_data["Name"] = new_name.strip()
                                post_resp = await client.post(f"{self.server_url}/Items/{it_id}", json=item_data)
                                if post_resp.status_code in (200, 204):
                                    affected_ids.append(it_id)
                        except Exception as re:
                            print(f"Failed to rename playlist {it_id}: {re}")

        return affected_ids
