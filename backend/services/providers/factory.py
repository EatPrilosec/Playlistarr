from .base import BaseProvider
from .trakt import TraktProvider

def get_provider(url: str, provider_type: str) -> BaseProvider:
    provider_type = provider_type.lower()
    if provider_type == "trakt":
        return TraktProvider(url)
    else:
        # Mocking others for now
        raise NotImplementedError(f"Provider {provider_type} is not yet implemented fully.")
