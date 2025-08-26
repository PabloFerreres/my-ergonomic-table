# backend/SSE/event_bus.py
import asyncio, json
from collections import defaultdict
from typing import Any, Dict, Set

_clients: dict[int, Set[asyncio.Queue]] = defaultdict(set)
_HEARTBEAT = 25  # s

async def stream(project_id: int):
    q: asyncio.Queue = asyncio.Queue()
    _clients[project_id].add(q)
    try:
        yield "event: hello\ndata: {}\n\n"
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=_HEARTBEAT)
                yield f"data: {json.dumps(msg)}\n\n"
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
    finally:
        _clients[project_id].discard(q)
        if not _clients[project_id]:
            _clients.pop(project_id, None)

def publish(project_id: int, data: Dict[str, Any]) -> None:
    for q in list(_clients.get(project_id, ())):
        try:
            q.put_nowait(data)
        except Exception:
            pass
