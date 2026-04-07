from __future__ import annotations

import asyncio

import tornado.httpserver
import tornado.web

from api.auth.handlers import (
    LogoutAuthHandler,
    PasswordLoginHandler,
    StartAuthHandler,
    VerifyAuthHandler,
)
from api.db import init_db
from api.graphql.handler import GraphQLHandler
from api.logging_config import configure_logging, get_logger
from api.rest.health import HealthHandler
from api.rest.me import MeHandler
from api.rest.monitoring import MonitoringRunHandler
from api.rest.cio import (
    CIOAccountsHandler,
    CIOAccountSummaryHandler,
    CIOAgentChatHandler,
    CIOAssetClassHandler,
    CIOBalanceSheetHandler,
    CIOBalanceSheetManualHandler,
    CIOCapitalCallsTimelineHandler,
    CIOCashFlowForecastHandler,
    CIOClientsHandler,
    CIOCumulativeReturnsHandler,
    CIODailyPnlHandler,
    CIOEntitiesHandler,
    CIOMarketValuesHandler,
    CIOMonthlyReturnsHandler,
    CIOPeriodVolHandler,
    CIOPrivateFundDetailHandler,
    CIOPrivateFundTypesHandler,
    CIORaFundHoldingsHandler,
    CIORecentTransactionsHandler,
    CIORiskMetricsHandler,
    CIORollingMetricsHandler,
    CIOTopPositionsHandler,
    CIOTwrorHandler,
)
from api.rest.rebalancer import (
    RebalancerAccountsHandler,
    RebalancerClientsHandler,
    RebalancerDriftHandler,
    RebalancerEntitiesHandler,
    RebalancerSaveTargetsHandler,
    RebalancerTargetsHandler,
)
from api.rest.tasks import NoteSummaryRunHandler
from api.rest.uploads import UploadSignHandler
from api.settings import get_settings
from api.tasks.base import recover_abandoned_task_runs

logger = get_logger(__name__)


def create_app() -> tornado.web.Application:
    settings = get_settings()
    init_db(settings)

    return tornado.web.Application(
        [
            (r"/api/healthz", HealthHandler),
            (r"/api/auth/start", StartAuthHandler),
            (r"/api/auth/verify", VerifyAuthHandler),
            (r"/api/auth/password-login", PasswordLoginHandler),
            (r"/api/auth/logout", LogoutAuthHandler),
            (r"/api/me", MeHandler),
            (r"/api/tasks/note-summary/run", NoteSummaryRunHandler),
            (r"/api/monitoring/run", MonitoringRunHandler),
            (r"/api/uploads/sign", UploadSignHandler),
            # CIO Dashboard endpoints (BigQuery-backed)
            (r"/api/cio/clients", CIOClientsHandler),
            (r"/api/cio/entities", CIOEntitiesHandler),
            (r"/api/cio/accounts", CIOAccountsHandler),
            (r"/api/cio/market-values", CIOMarketValuesHandler),
            (r"/api/cio/daily-pnl", CIODailyPnlHandler),
            (r"/api/cio/twror", CIOTwrorHandler),
            (r"/api/cio/monthly-returns", CIOMonthlyReturnsHandler),
            (r"/api/cio/risk-metrics", CIORiskMetricsHandler),
            (r"/api/cio/cumulative-returns", CIOCumulativeReturnsHandler),
            (r"/api/cio/rolling-metrics", CIORollingMetricsHandler),
            (r"/api/cio/period-vol", CIOPeriodVolHandler),
            (r"/api/cio/account-summary", CIOAccountSummaryHandler),
            (r"/api/cio/asset-class", CIOAssetClassHandler),
            (r"/api/cio/ra-fund-holdings", CIORaFundHoldingsHandler),
            (r"/api/cio/capital-calls-timeline", CIOCapitalCallsTimelineHandler),
            (r"/api/cio/cash-flow-forecast", CIOCashFlowForecastHandler),
            (r"/api/cio/top-positions", CIOTopPositionsHandler),
            (r"/api/cio/recent-transactions", CIORecentTransactionsHandler),
            (r"/api/cio/balance-sheet", CIOBalanceSheetHandler),
            (r"/api/cio/balance-sheet/manual", CIOBalanceSheetManualHandler),
            (r"/api/cio/private-fund-types", CIOPrivateFundTypesHandler),
            (r"/api/cio/private-fund-detail", CIOPrivateFundDetailHandler),
            (r"/api/cio/agent/chat", CIOAgentChatHandler),
            # Rebalancer endpoints (BigQuery-backed)
            (r"/api/rebalancer/clients", RebalancerClientsHandler),
            (r"/api/rebalancer/targets", RebalancerTargetsHandler),
            (r"/api/rebalancer/entities", RebalancerEntitiesHandler),
            (r"/api/rebalancer/accounts", RebalancerAccountsHandler),
            (r"/api/rebalancer/drift", RebalancerDriftHandler),
            (r"/api/rebalancer/save-targets", RebalancerSaveTargetsHandler),
            (r"/graphql", GraphQLHandler),
        ],
        debug=settings.app_env == "local",
        cookie_secret=settings.session_secret,
    )


async def _prewarm_caches() -> None:
    """Pre-warm slow BigQuery caches so the first page load is fast."""
    try:
        from api.services.bigquery_client import get_all_clients

        clients = await get_all_clients()
        logger.info(
            "Pre-warmed clients cache",
            event_type="app.prewarm",
            severity="INFO",
            client_count=len(clients),
        )
    except Exception as exc:
        logger.warning(
            "Failed to pre-warm clients cache (will retry on first request)",
            event_type="app.prewarm_failed",
            severity="WARNING",
            error_message=str(exc)[:256],
        )


async def run() -> None:
    configure_logging()
    settings = get_settings()
    app = create_app()
    await recover_abandoned_task_runs()
    server = tornado.httpserver.HTTPServer(app)
    server.bind(port=settings.app_port, address=settings.app_host)
    server.start(1)
    logger.info(
        "api started",
        event_type="app.event",
        severity="INFO",
        host=settings.app_host,
        port=settings.app_port,
    )
    # Pre-warm BigQuery caches in the background (don't block startup)
    asyncio.create_task(_prewarm_caches())
    await asyncio.Event().wait()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
