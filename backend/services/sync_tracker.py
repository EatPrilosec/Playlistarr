import datetime
from typing import Dict, Any, Optional

class SyncTracker:
    def __init__(self):
        # Maps playlist_id -> dict containing live sync details
        self._active_syncs: Dict[int, Dict[str, Any]] = {}

    def start_sync(self, playlist_id: int, playlist_name: str, total_items: int = 0):
        now = datetime.datetime.utcnow().isoformat()
        self._active_syncs[playlist_id] = {
            "id": playlist_id,
            "name": playlist_name,
            "status": "syncing",
            "stage": "starting",
            "details": f"Initializing sync for \"{playlist_name}\"...",
            "progress": 5,
            "current_item": 0,
            "total_items": total_items,
            "server": None,
            "started_at": now,
            "updated_at": now
        }

    def update_sync(
        self,
        playlist_id: int,
        stage: Optional[str] = None,
        details: Optional[str] = None,
        progress: Optional[int] = None,
        current_item: Optional[int] = None,
        total_items: Optional[int] = None,
        server: Optional[str] = None
    ):
        if playlist_id not in self._active_syncs:
            self.start_sync(playlist_id, f"Playlist #{playlist_id}")

        sync = self._active_syncs[playlist_id]
        if stage is not None:
            sync["stage"] = stage
        if details is not None:
            sync["details"] = details
        if progress is not None:
            sync["progress"] = max(0, min(100, int(progress)))
        if current_item is not None:
            sync["current_item"] = current_item
        if total_items is not None:
            sync["total_items"] = total_items
        if server is not None:
            sync["server"] = server
        sync["updated_at"] = datetime.datetime.utcnow().isoformat()

    def finish_sync(self, playlist_id: int, status: str = "success", details: Optional[str] = None):
        if playlist_id in self._active_syncs:
            sync = self._active_syncs[playlist_id]
            sync["status"] = status
            sync["stage"] = "complete" if status == "success" else "error"
            sync["progress"] = 100 if status == "success" else sync.get("progress", 0)
            if details:
                sync["details"] = details
            now = datetime.datetime.utcnow().isoformat()
            sync["updated_at"] = now
            sync["finished_at"] = now

    def clear_sync(self, playlist_id: int):
        self._active_syncs.pop(playlist_id, None)

    def get_sync(self, playlist_id: int) -> Optional[Dict[str, Any]]:
        sync = self._active_syncs.get(playlist_id)
        if not sync:
            return None
        # If finished more than 30 seconds ago, remove from memory so DB SyncLog takes over
        if "finished_at" in sync:
            try:
                finished = datetime.datetime.fromisoformat(sync["finished_at"])
                if (datetime.datetime.utcnow() - finished).total_seconds() > 30:
                    self._active_syncs.pop(playlist_id, None)
                    return None
            except Exception:
                pass
        return sync

    def get_all(self) -> Dict[int, Dict[str, Any]]:
        # Expire old completed entries
        for pid in list(self._active_syncs.keys()):
            self.get_sync(pid)
        return self._active_syncs

sync_tracker = SyncTracker()
