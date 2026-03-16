from __future__ import annotations

import tornado.web
from pydantic import BaseModel, EmailStr

from api.audit import AuthorizationError, require_authenticated_user_email
from api.middleware import BaseAPIHandler


class MeResponse(BaseModel):
    email: EmailStr


class MeHandler(BaseAPIHandler):
    async def get(self) -> None:
        try:
            email = require_authenticated_user_email(
                self.current_user_email,
                action="me.read",
                resource="user.profile",
            )
        except AuthorizationError as exc:
            raise tornado.web.HTTPError(401, reason=str(exc)) from exc
        self.write_json(200, MeResponse(email=email).model_dump())
