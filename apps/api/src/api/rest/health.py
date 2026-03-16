from __future__ import annotations

from pydantic import BaseModel

from api.middleware import BaseAPIHandler


class HealthResponse(BaseModel):
    ok: bool
    service: str


class HealthHandler(BaseAPIHandler):
    async def get(self) -> None:
        response = HealthResponse(ok=True, service="api")
        self.write_json(200, response.model_dump())
