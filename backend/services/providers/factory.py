from .base import BaseProvider
from .trakt import TraktProvider
from .letterboxd import LetterboxdProvider

def get_provider(url: str, provider_type: str) -> BaseProvider:
    provider_type = provider_type.lower()
    if provider_type == "trakt":
        return TraktProvider(url)
    elif provider_type == "letterboxd":
        return LetterboxdProvider(url)
    else:
        # Mocking others for now
        raise NotImplementedError(f"Provider {provider_type} is not yet implemented fully.")
