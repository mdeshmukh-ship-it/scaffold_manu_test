from __future__ import annotations

import json
from typing import Any

import tornado.web
from graphql import GraphQLError, get_operation_ast, parse
from graphql.language.ast import FieldNode
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from api.audit import log_authz_decision
from api.middleware import BaseAPIHandler
from api.settings import get_settings

from .schema import schema


class GraphQLBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str
    variables: dict[str, Any] | None = None
    operation_name: str | None = Field(default=None, alias="operationName")


INTROSPECTION_FIELD_NAMES = frozenset({"__schema", "__type"})


def _is_local_or_test_introspection_query(body: GraphQLBody) -> bool:
    settings = get_settings()
    if settings.app_env not in {"local", "test"}:
        return False

    try:
        document = parse(body.query)
    except GraphQLError:
        return False

    operation = get_operation_ast(document, body.operation_name)
    if operation is None:
        return False

    root_field_names = {
        selection.name.value for selection in operation.selection_set.selections if isinstance(selection, FieldNode)
    }
    return bool(root_field_names) and root_field_names.issubset(INTROSPECTION_FIELD_NAMES)


class GraphQLHandler(BaseAPIHandler):
    async def post(self) -> None:
        try:
            raw_body = json.loads(self.request.body.decode("utf-8"))
            body = GraphQLBody.model_validate(raw_body)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise tornado.web.HTTPError(400, reason=f"Invalid GraphQL request: {exc}") from exc

        if not self.current_user_email and not _is_local_or_test_introspection_query(body):
            log_authz_decision(
                action="graphql.execute",
                resource="graphql.operation",
                allowed=False,
                reason="authentication required",
                extra={"operation_name": body.operation_name},
            )
            raise tornado.web.HTTPError(401, reason="Authentication required.")

        result = await schema.execute(
            query=body.query,
            variable_values=body.variables,
            operation_name=body.operation_name,
            context_value={
                "user_email": self.current_user_email,
                "request_id": self.request_id,
            },
        )

        payload: dict[str, Any] = {"data": result.data}
        if result.errors:
            payload["errors"] = [{"message": err.message} for err in result.errors]
        self.write_json(200, payload)
