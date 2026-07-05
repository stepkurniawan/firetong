import json
import smtplib
from email.message import EmailMessage
from typing import Any

from backend.firetong.schemas import FeedbackReportRequest
from backend.firetong.settings import Settings


class FeedbackEmailNotConfiguredError(RuntimeError):
    pass


def send_feedback_email(
    payload: FeedbackReportRequest,
    settings: Settings,
    client_ip: str | None,
    user_agent: str | None,
) -> None:
    if not settings.feedback_smtp_host or not settings.feedback_email_from:
        raise FeedbackEmailNotConfiguredError(
            "Feedback email is not configured on the server."
        )

    message = EmailMessage()
    message["Subject"] = "firetong bug"
    message["From"] = settings.feedback_email_from
    message["To"] = settings.feedback_email_to
    message.set_content(build_feedback_email_body(payload, client_ip, user_agent))

    smtp_class = smtplib.SMTP_SSL if settings.feedback_smtp_ssl else smtplib.SMTP
    with smtp_class(settings.feedback_smtp_host, settings.feedback_smtp_port, timeout=20) as smtp:
        if settings.feedback_smtp_starttls and not settings.feedback_smtp_ssl:
            smtp.starttls()
        if settings.feedback_smtp_username and settings.feedback_smtp_password:
            smtp.login(settings.feedback_smtp_username, settings.feedback_smtp_password)
        smtp.send_message(message)


def build_feedback_email_body(
    payload: FeedbackReportRequest,
    client_ip: str | None,
    user_agent: str | None,
) -> str:
    report: dict[str, Any] = {
        "feedback": payload.feedback,
        "input_language": payload.input_language,
        "input_language_label": payload.input_language_label,
        "output_language": payload.output_language,
        "output_language_label": payload.output_language_label,
        "source_transcript": payload.source_transcript,
        "translated_transcript": payload.translated_transcript,
        "server": {
            "client_ip": client_ip,
            "user_agent": user_agent,
        },
        "browser_metadata": payload.metadata,
    }
    return json.dumps(report, ensure_ascii=False, indent=2)
