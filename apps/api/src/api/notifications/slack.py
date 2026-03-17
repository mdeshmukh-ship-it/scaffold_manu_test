"""Send Slack notifications for drift breach alerts."""

from __future__ import annotations

from api.logging_config import get_logger
from api.outbound_http import request
from api.settings import get_settings

logger = get_logger(__name__)

APP_BASE_URL = "http://127.0.0.1:3000"  # TODO: make configurable per environment


async def send_slack_alert(
    *,
    family_id: str,
    family_name: str,
    pm_email: str,
    summary_text: str,
) -> bool:
    """Send a breach alert to Slack. Returns True if delivery succeeded."""
    settings = get_settings()

    if not settings.slack_webhook_url:
        logger.warning(
            "slack webhook not configured, skipping alert",
            event_type="slack.skip",
            severity="WARNING",
            family_name=family_name,
        )
        return False

    family_url = f"{APP_BASE_URL}/family/{family_id}"

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"🚨 Portfolio Drift Alert: {family_name}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*PM:* {pm_email}\n\n```\n{summary_text}\n```",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View in App"},
                    "url": family_url,
                    "style": "primary",
                },
            ],
        },
    ]

    payload = {
        "channel": settings.slack_alert_channel,
        "blocks": blocks,
        "text": f"Portfolio Drift Alert: {family_name}",  # fallback
    }

    try:
        response = await request(
            op="slack.send_alert",
            url=settings.slack_webhook_url,
            method="POST",
            json=payload,
            timeout=10.0,
        )
        if response.status_code == 200:
            logger.info(
                "slack alert sent",
                event_type="slack.sent",
                severity="INFO",
                family_name=family_name,
                pm_email=pm_email,
            )
            return True
        else:
            logger.error(
                "slack alert failed",
                event_type="slack.error",
                severity="ERROR",
                family_name=family_name,
                status_code=response.status_code,
            )
            return False
    except Exception as exc:
        logger.exception(
            "slack alert exception",
            event_type="slack.error",
            severity="ERROR",
            family_name=family_name,
            error_type=exc.__class__.__name__,
            error_message=str(exc)[:256],
        )
        return False
