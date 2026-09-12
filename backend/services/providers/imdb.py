import httpx
import re
import logging
from .base import BaseProvider

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://api.graphql.imdb.com/"
FALLBACK_LIST_HASH = "dc98c1b896ffcb97e619b888d27721ff40fea6985fd022bca920615ed744ee0b"
FALLBACK_WATCHLIST_HASH = "bd16984d2dec070e278187d502321c785bdf3d7771b172cc4b72002a4a6ce715"

CHART_MAP = {
    "top": "TOP_RATED_MOVIES",
    "top_movies": "TOP_RATED_MOVIES",
    "toptv": "TOP_RATED_TV_SHOWS",
    "top_shows": "TOP_RATED_TV_SHOWS",
    "moviemeter": "MOST_POPULAR_MOVIES",
    "popular_movies": "MOST_POPULAR_MOVIES",
    "tvmeter": "MOST_POPULAR_TV_SHOWS",
    "popular_shows": "MOST_POPULAR_TV_SHOWS",
    "bottom": "LOWEST_RATED_MOVIES",
    "lowest_rated": "LOWEST_RATED_MOVIES",
    "top-english-movies": "TOP_RATED_ENGLISH_MOVIES",
}

class IMDbProvider(BaseProvider):
    _cached_list_hash: str | None = None
    _cached_watchlist_hash: str | None = None

    async def _get_list_hash(self, client: httpx.AsyncClient) -> str:
        if self._cached_list_hash:
            return self._cached_list_hash
        try:
            r = await client.get("https://raw.githubusercontent.com/Kometa-Team/IMDb-Hash/master/LIST_HASH", timeout=5.0)
            if r.status_code == 200 and len(r.text.strip()) == 64:
                self.__class__._cached_list_hash = r.text.strip()
                return self._cached_list_hash
        except Exception:
            pass
        return FALLBACK_LIST_HASH

    async def _get_watchlist_hash(self, client: httpx.AsyncClient) -> str:
        if self._cached_watchlist_hash:
            return self._cached_watchlist_hash
        try:
            r = await client.get("https://raw.githubusercontent.com/Kometa-Team/IMDb-Hash/master/WATCHLIST_HASH", timeout=5.0)
            if r.status_code == 200 and len(r.text.strip()) == 64:
                self.__class__._cached_watchlist_hash = r.text.strip()
                return self._cached_watchlist_hash
        except Exception:
            pass
        return FALLBACK_WATCHLIST_HASH

    async def fetch_list(self) -> list[dict]:
        clean_url = self.url.strip()
        headers = {
            "content-type": "application/json",
            "x-imdb-client-name": "imdb-web-next",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Check for IMDb Chart (e.g. /chart/top, /chart/toptv, /chart/moviemeter)
            chart_match = re.search(r'chart/([a-zA-Z0-9_-]+)', clean_url)
            if chart_match:
                chart_slug = chart_match.group(1).lower()
                chart_type = CHART_MAP.get(chart_slug, "TOP_RATED_MOVIES")
                return await self._fetch_chart(client, headers, chart_type)

            # 2. Check for User Watchlist (e.g. /user/ur12345678/watchlist or /user/p.xxx/watchlist)
            watchlist_match = re.search(r'user/([^/?#]+)/watchlist', clean_url)
            if watchlist_match:
                user_id = watchlist_match.group(1)
                return await self._fetch_watchlist(client, headers, user_id)

            # 3. Check for IMDb List ID (e.g. ls055592025 or full URL with /list/ls...)
            list_match = re.search(r'(ls\d+)', clean_url)
            if list_match:
                list_id = list_match.group(1)
                return await self._fetch_user_list(client, headers, list_id)

            # 4. Check for search/title URLs (e.g. /search/title/?groups=top_100)
            if "search/title" in clean_url:
                if "top_100" in clean_url:
                    items = await self._fetch_chart(client, headers, "TOP_RATED_MOVIES")
                    return items[:100]
                elif "top_250" in clean_url or "top" in clean_url:
                    return await self._fetch_chart(client, headers, "TOP_RATED_MOVIES")
                elif "tv" in clean_url or "show" in clean_url:
                    return await self._fetch_chart(client, headers, "TOP_RATED_TV_SHOWS")
                elif "popular" in clean_url or "moviemeter" in clean_url:
                    return await self._fetch_chart(client, headers, "MOST_POPULAR_MOVIES")
                else:
                    return await self._fetch_chart(client, headers, "TOP_RATED_MOVIES")

            raise Exception(f"Unrecognized IMDb list URL: {clean_url}. Expected format: https://www.imdb.com/list/ls... or https://www.imdb.com/chart/...")

    async def _fetch_chart(self, client: httpx.AsyncClient, headers: dict, chart_type: str) -> list[dict]:
        gql = (
            f"{{ chartTitles(chart: {{ chartType: {chart_type} }}, first: 250) "
            f"{{ edges {{ node {{ id titleText {{ text }} releaseYear {{ year }} titleType {{ id }} }} }} total }} }}"
        )
        resp = await client.post(GRAPHQL_URL, headers=headers, json={"query": gql})
        if resp.status_code != 200:
            raise Exception(f"IMDb Chart GraphQL request failed: HTTP {resp.status_code} ({resp.text[:100]})")

        data = resp.json()
        edges = data.get("data", {}).get("chartTitles", {}).get("edges", [])
        items = []
        for order, edge in enumerate(edges, start=1):
            node = edge.get("node") or {}
            title = (node.get("titleText") or {}).get("text")
            year = (node.get("releaseYear") or {}).get("year")
            tt_type = (node.get("titleType") or {}).get("id") or "movie"
            item_type = "show" if tt_type in ["tvSeries", "tvMiniSeries"] else "movie"

            items.append({
                "title": title,
                "year": year,
                "type": item_type,
                "imdb_id": node.get("id"),
                "tmdb_id": None,
                "tvdb_id": None,
                "show_title": None,
                "order": order
            })
        return items

    async def _fetch_user_list(self, client: httpx.AsyncClient, headers: dict, list_id: str) -> list[dict]:
        list_hash = await self._get_list_hash(client)
        items = []
        after = None
        has_next_page = True

        while has_next_page and len(items) < 2000:
            variables = {
                "locale": "en-US",
                "first": 100,
                "lsConst": list_id,
                "isInPace": False,
                "sort": {"by": "LIST_ORDER", "order": "ASC"}
            }
            if after:
                variables["after"] = after

            payload = {
                "operationName": "TitleListMainPage",
                "variables": variables,
                "extensions": {
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": list_hash
                    }
                }
            }

            resp = await client.post(GRAPHQL_URL, headers=headers, json=payload)
            if resp.status_code != 200:
                raise Exception(f"IMDb List GraphQL request failed: HTTP {resp.status_code} ({resp.text[:100]})")

            data = resp.json()
            if "errors" in data:
                err_msg = data["errors"][0].get("message", "Unknown GraphQL error")
                raise Exception(f"IMDb Error: {err_msg}")

            list_data = data.get("data", {}).get("list", {})
            search_data = list_data.get("titleListItemSearch", {})
            edges = search_data.get("edges", [])

            for edge in edges:
                node = edge.get("listItem") or {}
                title = (node.get("titleText") or {}).get("text")
                year = (node.get("releaseYear") or {}).get("year")
                tt_type = (node.get("titleType") or {}).get("id") or "movie"
                item_type = "show" if tt_type in ["tvSeries", "tvMiniSeries"] else "movie"

                items.append({
                    "title": title,
                    "year": year,
                    "type": item_type,
                    "imdb_id": node.get("id"),
                    "tmdb_id": None,
                    "tvdb_id": None,
                    "show_title": None,
                    "order": len(items) + 1
                })

            page_info = search_data.get("pageInfo", {})
            has_next_page = page_info.get("hasNextPage", False)
            after = page_info.get("endCursor")
            if not after:
                break

        return items

    async def _fetch_watchlist(self, client: httpx.AsyncClient, headers: dict, user_id: str) -> list[dict]:
        # If user_id is p.xxx, resolve to internal ur ID if needed
        actual_user_id = user_id
        if user_id.startswith("p."):
            res_query = f'{{ userProfile(input: {{profileId: "{user_id}"}}) {{ userId }} }}'
            r = await client.post(GRAPHQL_URL, headers=headers, json={"query": res_query})
            if r.status_code == 200:
                resolved = r.json().get("data", {}).get("userProfile", {}).get("userId")
                if resolved:
                    actual_user_id = resolved

        watchlist_hash = await self._get_watchlist_hash(client)
        items = []
        after = None
        has_next_page = True

        while has_next_page and len(items) < 2000:
            variables = {
                "locale": "en-US",
                "first": 100,
                "urConst": actual_user_id,
                "isInPace": False,
                "sort": {"by": "DATE_ADDED", "order": "DESC"}
            }
            if after:
                variables["after"] = after

            payload = {
                "operationName": "WatchListPageRefiner",
                "variables": variables,
                "extensions": {
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": watchlist_hash
                    }
                }
            }

            resp = await client.post(GRAPHQL_URL, headers=headers, json=payload)
            if resp.status_code != 200:
                raise Exception(f"IMDb Watchlist GraphQL failed: HTTP {resp.status_code}")

            data = resp.json()
            search_data = data.get("data", {}).get("predefinedList", {}).get("titleListItemSearch", {})
            edges = search_data.get("edges", [])

            for edge in edges:
                node = edge.get("listItem") or {}
                title = (node.get("titleText") or {}).get("text")
                year = (node.get("releaseYear") or {}).get("year")
                tt_type = (node.get("titleType") or {}).get("id") or "movie"
                item_type = "show" if tt_type in ["tvSeries", "tvMiniSeries"] else "movie"

                items.append({
                    "title": title,
                    "year": year,
                    "type": item_type,
                    "imdb_id": node.get("id"),
                    "tmdb_id": None,
                    "tvdb_id": None,
                    "show_title": None,
                    "order": len(items) + 1
                })

            page_info = search_data.get("pageInfo", {})
            has_next_page = page_info.get("hasNextPage", False)
            after = page_info.get("endCursor")
            if not after:
                break

        return items
