class BaseProvider:
    def __init__(self, url: str):
        self.url = url
        
    async def fetch_list(self) -> list[dict]:
        """
        Returns a list of items.
        Each item is a dict with at least:
        {
            "title": "...",
            "year": 2024,
            "type": "movie" | "show",
            "provider_id": "...",
            "order": 1
        }
        """
        raise NotImplementedError
