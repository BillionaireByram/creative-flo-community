"""Shared request guards for Creative Flo API routes."""

from fastapi import HTTPException, Request
from fastapi.routing import APIRoute

MAX_BODY_BYTES = 512 * 1024


async def limit_body(request: Request):
    length = request.headers.get("content-length")
    try:
        oversized = length is not None and int(length) > MAX_BODY_BYTES
    except ValueError:
        oversized = False
    if oversized or len(await request.body()) > MAX_BODY_BYTES:
        raise HTTPException(413, "Request body too large")


class LimitedBodyRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def limited(request: Request):
            await limit_body(request)
            return await handler(request)

        return limited
