from .base import BaseProvider
from .trakt import TraktProvider
from .letterboxd import LetterboxdProvider
from .imdb import IMDbProvider
from .mdblist import MDBListProvider
from .simkl import SIMKLProvider

def get_provider(url: str, provider_type: str | None = None) -> BaseProvider:
    clean_type = (provider_type or "").strip().lower()
    clean_url = url.lower()

    # Auto-detect from URL if provider_type is unspecified or auto
    if not clean_type or clean_type == "auto":
        if "trakt.tv" in clean_url:
            clean_type = "trakt"
        elif "letterboxd.com" in clean_url:
            clean_type = "letterboxd"
        elif "imdb.com" in clean_url:
            clean_type = "imdb"
        elif "mdblist.com" in clean_url:
            clean_type = "mdblist"
        elif "simkl.com" in clean_url:
            clean_type = "simkl"

    if clean_type == "trakt":
        return TraktProvider(url)
    elif clean_type == "letterboxd":
        return LetterboxdProvider(url)
    elif clean_type == "imdb":
        return IMDbProvider(url)
    elif clean_type == "mdblist":
        return MDBListProvider(url)
    elif clean_type == "simkl":
        return SIMKLProvider(url)
    else:
        raise NotImplementedError(
            f"Provider '{clean_type}' is not supported. "
            "Supported providers: trakt, letterboxd, imdb, mdblist, simkl"
        )
