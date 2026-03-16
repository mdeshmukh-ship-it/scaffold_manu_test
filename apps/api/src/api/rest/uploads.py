from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import tornado.web
from pydantic import BaseModel, Field, ValidationError

from api.audit import AuthorizationError, require_authenticated_user_email
from api.middleware import BaseAPIHandler


class UploadSignRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=120)
    max_bytes: int = Field(gt=0, le=50 * 1024 * 1024)


class UploadSignResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_at: str
    max_bytes: int


class UploadSignHandler(BaseAPIHandler):
    async def post(self) -> None:
        try:
            user_email = require_authenticated_user_email(
                self.current_user_email,
                action="uploads.sign",
                resource="gcs.object",
            )
        except AuthorizationError as exc:
            raise tornado.web.HTTPError(401, reason=str(exc)) from exc

        bucket = os.getenv("GCS_BUCKET", "")
        if not bucket:
            raise tornado.web.HTTPError(
                501,
                reason="GCS signing is not configured. Set GCS_BUCKET for this environment.",
            )

        try:
            payload = UploadSignRequest.model_validate(json.loads(self.request.body.decode("utf-8")))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise tornado.web.HTTPError(400, reason=f"Invalid upload request: {exc}") from exc

        safe_file_name = payload.file_name.replace("/", "_")
        object_key = f"{user_email}/{uuid4().hex}-{safe_file_name}"
        expires_at = datetime.now(tz=UTC) + timedelta(minutes=15)

        # Stub response for v1 scaffold: swap this with real V4 signing before public launch.
        upload_url = (
            f"https://storage.googleapis.com/{bucket}/{object_key}"
            "?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=stub"
        )

        response = UploadSignResponse(
            upload_url=upload_url,
            object_key=object_key,
            expires_at=expires_at.isoformat(),
            max_bytes=payload.max_bytes,
        )
        self.write_json(200, response.model_dump())
