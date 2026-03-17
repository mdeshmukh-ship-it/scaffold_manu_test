"""drift monitor schema

Revision ID: 202603170001
Revises: 202602260001
Create Date: 2026-03-17 09:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202603170001"
down_revision = "202602260001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "families",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("pm_email", sa.String(length=320), nullable=False),
        sa.Column("drift_threshold_pct", sa.Float(), nullable=False),
        sa.Column("monitoring_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_families_pm_email", "families", ["pm_email"], unique=False)

    op.create_table(
        "family_targets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("family_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_weight_pct", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_targets_family_id", "family_targets", ["family_id"], unique=False)

    op.create_table(
        "monitoring_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_families", sa.Integer(), nullable=False),
        sa.Column("breach_count", sa.Integer(), nullable=False),
        sa.Column("error_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "family_run_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("family_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["monitoring_runs.id"]),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_run_results_run_id", "family_run_results", ["run_id"], unique=False)
    op.create_index("ix_family_run_results_family_id", "family_run_results", ["family_id"], unique=False)

    op.create_table(
        "drift_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("result_id", sa.String(length=36), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("target_name", sa.String(length=200), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_weight_pct", sa.Float(), nullable=False),
        sa.Column("actual_market_value", sa.Float(), nullable=False),
        sa.Column("actual_pct", sa.Float(), nullable=False),
        sa.Column("drift_pct", sa.Float(), nullable=False),
        sa.Column("is_breach", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["result_id"], ["family_run_results.id"]),
        sa.ForeignKeyConstraint(["target_id"], ["family_targets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_drift_snapshots_result_id", "drift_snapshots", ["result_id"], unique=False)
    op.create_index("ix_drift_snapshots_target_id", "drift_snapshots", ["target_id"], unique=False)

    op.create_table(
        "alerts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("family_id", sa.String(length=36), nullable=False),
        sa.Column("result_id", sa.String(length=36), nullable=True),
        sa.Column("pm_email", sa.String(length=320), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=False),
        sa.Column("delivery_status", sa.String(length=30), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(length=320), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["result_id"], ["family_run_results.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alerts_family_id", "alerts", ["family_id"], unique=False)
    op.create_index("ix_alerts_result_id", "alerts", ["result_id"], unique=False)
    op.create_index("ix_alerts_pm_email", "alerts", ["pm_email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_alerts_pm_email", table_name="alerts")
    op.drop_index("ix_alerts_result_id", table_name="alerts")
    op.drop_index("ix_alerts_family_id", table_name="alerts")
    op.drop_table("alerts")
    op.drop_index("ix_drift_snapshots_target_id", table_name="drift_snapshots")
    op.drop_index("ix_drift_snapshots_result_id", table_name="drift_snapshots")
    op.drop_table("drift_snapshots")
    op.drop_index("ix_family_run_results_family_id", table_name="family_run_results")
    op.drop_index("ix_family_run_results_run_id", table_name="family_run_results")
    op.drop_table("family_run_results")
    op.drop_table("monitoring_runs")
    op.drop_index("ix_family_targets_family_id", table_name="family_targets")
    op.drop_table("family_targets")
    op.drop_index("ix_families_pm_email", table_name="families")
    op.drop_table("families")
