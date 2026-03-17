from __future__ import annotations

from datetime import datetime

import strawberry
from pydantic import BaseModel, Field

from api.models import Alert, DriftSnapshot, Family, FamilyRunResult, FamilyTarget, MonitoringRun, Note, TaskRun


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_dt(value: datetime | None) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return None
    return str(value)


# ---------------------------------------------------------------------------
# Scaffold default types (notes / tasks / auth)
# ---------------------------------------------------------------------------


@strawberry.type
class NoteType:
    id: str
    title: str
    body: str
    summary: str | None
    summary_provider: str | None
    summary_updated_at: str | None
    created_at: str


@strawberry.type
class CurrentUserType:
    id: str
    email: str


@strawberry.type
class ViewerType:
    email: str


@strawberry.type
class TaskRunType:
    id: str
    task_name: str
    status: str
    progress_current: int
    progress_total: int
    message: str | None
    error_message: str | None
    created_at: str
    updated_at: str
    finished_at: str | None


@strawberry.input
class CreateNoteInput:
    title: str
    body: str = ""


class CreateNoteInputModel(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)


# ---------------------------------------------------------------------------
# Portfolio Drift Monitor types
# ---------------------------------------------------------------------------


@strawberry.type
class DriftSnapshotType:
    id: str
    target_id: str
    target_name: str
    target_type: str
    target_weight_pct: float
    actual_market_value: float
    actual_pct: float
    drift_pct: float
    is_breach: bool


@strawberry.type
class FamilyTargetType:
    id: str
    family_id: str
    name: str
    target_type: str
    target_weight_pct: float
    created_at: str
    updated_at: str


@strawberry.type
class FamilyRunResultType:
    id: str
    run_id: str
    family_id: str
    status: str
    error_message: str | None
    checked_at: str
    snapshots: list[DriftSnapshotType]


@strawberry.type
class FamilyType:
    id: str
    name: str
    pm_email: str
    drift_threshold_pct: float
    monitoring_enabled: bool
    created_at: str
    updated_at: str
    targets: list[FamilyTargetType]
    latest_status: str | None
    latest_checked_at: str | None
    breach_count: int


@strawberry.type
class MonitoringRunType:
    id: str
    status: str
    started_at: str | None
    completed_at: str | None
    total_families: int
    breach_count: int
    error_count: int
    created_at: str
    results: list[FamilyRunResultType]


@strawberry.type
class AlertType:
    id: str
    family_id: str
    family_name: str
    result_id: str | None
    pm_email: str
    summary_text: str
    delivery_status: str
    acknowledged: bool
    acknowledged_at: str | None
    acknowledged_by: str | None
    sent_at: str


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------


@strawberry.input
class CreateFamilyInput:
    name: str
    pm_email: str
    drift_threshold_pct: float = 10.0


class CreateFamilyInputModel(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    pm_email: str = Field(min_length=1, max_length=320)
    drift_threshold_pct: float = Field(default=10.0, ge=0.1, le=100.0)


@strawberry.input
class UpdateFamilyInput:
    id: str
    name: str | None = None
    pm_email: str | None = None
    drift_threshold_pct: float | None = None
    monitoring_enabled: bool | None = None


@strawberry.input
class CreateFamilyTargetInput:
    family_id: str
    name: str
    target_type: str  # asset_class | account | ticker
    target_weight_pct: float


class CreateFamilyTargetInputModel(BaseModel):
    family_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    target_type: str = Field(pattern=r"^(asset_class|account|ticker)$")
    target_weight_pct: float = Field(ge=0.0, le=100.0)


@strawberry.input
class UpdateFamilyTargetInput:
    id: str
    name: str | None = None
    target_type: str | None = None
    target_weight_pct: float | None = None


# ---------------------------------------------------------------------------
# Converters: ORM model -> GraphQL type
# ---------------------------------------------------------------------------


def user_email_to_viewer_type(user_email: str) -> ViewerType:
    return ViewerType(email=user_email)


def note_to_type(note: Note) -> NoteType:
    return NoteType(
        id=note.id,
        title=note.title,
        body=note.body,
        summary=note.summary,
        summary_provider=note.summary_provider,
        summary_updated_at=_serialize_dt(note.summary_updated_at),
        created_at=_serialize_dt(note.created_at) or "",
    )


def task_run_to_type(task_run: TaskRun) -> TaskRunType:
    return TaskRunType(
        id=task_run.id,
        task_name=task_run.task_name,
        status=task_run.status,
        progress_current=task_run.progress_current,
        progress_total=task_run.progress_total,
        message=task_run.message,
        error_message=task_run.error_message,
        created_at=_serialize_dt(task_run.created_at) or "",
        updated_at=_serialize_dt(task_run.updated_at) or "",
        finished_at=_serialize_dt(task_run.finished_at),
    )


def family_target_to_type(target: FamilyTarget) -> FamilyTargetType:
    return FamilyTargetType(
        id=target.id,
        family_id=target.family_id,
        name=target.name,
        target_type=target.target_type,
        target_weight_pct=target.target_weight_pct,
        created_at=_serialize_dt(target.created_at) or "",
        updated_at=_serialize_dt(target.updated_at) or "",
    )


def drift_snapshot_to_type(snap: DriftSnapshot) -> DriftSnapshotType:
    return DriftSnapshotType(
        id=snap.id,
        target_id=snap.target_id,
        target_name=snap.target_name,
        target_type=snap.target_type,
        target_weight_pct=snap.target_weight_pct,
        actual_market_value=snap.actual_market_value,
        actual_pct=snap.actual_pct,
        drift_pct=snap.drift_pct,
        is_breach=snap.is_breach,
    )


def family_run_result_to_type(result: FamilyRunResult, snapshots: list[DriftSnapshot]) -> FamilyRunResultType:
    return FamilyRunResultType(
        id=result.id,
        run_id=result.run_id,
        family_id=result.family_id,
        status=result.status,
        error_message=result.error_message,
        checked_at=_serialize_dt(result.checked_at) or "",
        snapshots=[drift_snapshot_to_type(s) for s in snapshots],
    )


def family_to_type(
    family: Family,
    targets: list[FamilyTarget],
    latest_status: str | None = None,
    latest_checked_at: datetime | None = None,
    breach_count: int = 0,
) -> FamilyType:
    return FamilyType(
        id=family.id,
        name=family.name,
        pm_email=family.pm_email,
        drift_threshold_pct=family.drift_threshold_pct,
        monitoring_enabled=family.monitoring_enabled,
        created_at=_serialize_dt(family.created_at) or "",
        updated_at=_serialize_dt(family.updated_at) or "",
        targets=[family_target_to_type(t) for t in targets],
        latest_status=latest_status,
        latest_checked_at=_serialize_dt(latest_checked_at),
        breach_count=breach_count,
    )


def monitoring_run_to_type(run: MonitoringRun, results: list[FamilyRunResultType] | None = None) -> MonitoringRunType:
    return MonitoringRunType(
        id=run.id,
        status=run.status,
        started_at=_serialize_dt(run.started_at),
        completed_at=_serialize_dt(run.completed_at),
        total_families=run.total_families,
        breach_count=run.breach_count,
        error_count=run.error_count,
        created_at=_serialize_dt(run.created_at) or "",
        results=results or [],
    )


def alert_to_type(alert: Alert, family_name: str = "") -> AlertType:
    return AlertType(
        id=alert.id,
        family_id=alert.family_id,
        family_name=family_name,
        result_id=alert.result_id,
        pm_email=alert.pm_email,
        summary_text=alert.summary_text,
        delivery_status=alert.delivery_status,
        acknowledged=alert.acknowledged,
        acknowledged_at=_serialize_dt(alert.acknowledged_at),
        acknowledged_by=alert.acknowledged_by,
        sent_at=_serialize_dt(alert.sent_at) or "",
    )
