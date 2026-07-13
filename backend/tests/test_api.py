import json
import re

from backend.firetong.main import app
from backend.firetong.runtime_config import (
    DEFAULT_REALTIME_TRANSLATION_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
    REALTIME_DURATION_RATES_USD_PER_MINUTE,
)
from backend.firetong.settings import Settings, get_settings
from fastapi.testclient import TestClient


def expected_duration_cost_usd(model: str, duration_seconds: float) -> float:
    return round((duration_seconds / 60) * REALTIME_DURATION_RATES_USD_PER_MINUTE[model], 6)


def override_settings(**values):
    def _override():
        return Settings(_env_file=None, **values)

    return _override


def test_config_reports_openai_model_defaults():
    app.dependency_overrides[get_settings] = override_settings()
    client = TestClient(app)

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {
        "openai_base_url": "https://api.openai.com/v1",
        "transcription_model": "gpt-realtime-whisper",
        "realtime_input_language": "id",
        "realtime_translation_model": "gpt-realtime-translate",
        "realtime_translation_language": "en",
        "realtime_language_options": [
            {"value": "id", "label": "Indonesian"},
            {"value": "en", "label": "English"},
            {"value": "de", "label": "German"},
            {"value": "ja", "label": "Japanese"},
        ],
        "realtime_duration_rates_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE,
    }
    app.dependency_overrides.clear()


def test_server_replaces_backend_translation_route():
    client = TestClient(app)

    response = client.post("/api/translate", json={})

    assert response.status_code == 405


def test_realtime_translation_token_route_creates_translation_session(monkeypatch):
    calls = []

    async def fake_post_to_openai(
        settings,
        path,
        api_key_override=None,
        json_data=None,
        form_data=None,
        files=None,
    ):
        calls.append(
            {
                "path": path,
                "api_key_override": api_key_override,
                "json_data": json_data,
                "files": files,
                "model": settings.realtime_translation_model,
            }
        )
        return {"value": "translation-secret"}

    monkeypatch.setattr("backend.firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.get("/api/realtime/translation-token?output_language=de")

    assert response.status_code == 200
    assert response.json() == {"value": "translation-secret"}
    assert calls[0]["path"] == "/realtime/translations/client_secrets"
    assert calls[0]["api_key_override"] is None
    assert calls[0]["json_data"] == {
        "session": {
            "model": "gpt-realtime-translate",
            "audio": {
                "output": {
                    "language": "de",
                },
            },
        }
    }
    assert calls[0]["files"] is None
    assert calls[0]["model"] == "gpt-realtime-translate"
    app.dependency_overrides.clear()


def test_realtime_token_route_creates_transcription_session(monkeypatch):
    calls = []

    async def fake_post_to_openai(
        settings,
        path,
        api_key_override=None,
        json_data=None,
        form_data=None,
        files=None,
    ):
        calls.append(
            {
                "path": path,
                "api_key_override": api_key_override,
                "json_data": json_data,
                "files": files,
                "model": settings.transcription_model,
            }
        )
        return {"value": "ephemeral-secret"}

    monkeypatch.setattr("backend.firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(
        openai_api_key="test-key",
        transcription_prompt=(
            "Transcribe {{ input_language_name }} ({{ input_language }}) for listeners using "
            "{{ output_language_name }} ({{ output_language }})."
        ),
    )
    client = TestClient(app)

    response = client.get("/api/realtime/token?input_language=en&output_language=de")

    assert response.status_code == 200
    assert response.json() == {"value": "ephemeral-secret"}
    assert calls[0]["path"] == "/realtime/client_secrets"
    assert calls[0]["api_key_override"] is None
    assert calls[0]["json_data"] == {
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "transcription": {
                        "model": "gpt-realtime-whisper",
                        "language": "en",
                        "delay": "minimal",
                        "prompt": "Transcribe English (en) for listeners using German (de).",
                    },
                    "turn_detection": None,
                }
            },
        }
    }
    assert calls[0]["files"] is None
    assert calls[0]["model"] == "gpt-realtime-whisper"
    app.dependency_overrides.clear()


def test_realtime_token_routes_reject_unsupported_languages(monkeypatch):
    async def fake_post_to_openai(
        settings,
        path,
        api_key_override=None,
        json_data=None,
        form_data=None,
        files=None,
    ):
        return {"value": "should-not-be-used"}

    monkeypatch.setattr("backend.firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    transcription_response = client.get("/api/realtime/token?input_language=fr")
    transcription_output_response = client.get("/api/realtime/token?output_language=fr")
    translation_response = client.get("/api/realtime/translation-token?output_language=fr")

    assert transcription_response.status_code == 422
    assert transcription_response.json() == {
        "detail": "input_language must be one of: id, en, de, ja."
    }
    assert transcription_output_response.status_code == 422
    assert transcription_output_response.json() == {
        "detail": "output_language must be one of: id, en, de, ja."
    }
    assert translation_response.status_code == 422
    assert translation_response.json() == {
        "detail": "output_language must be one of: id, en, de, ja."
    }
    app.dependency_overrides.clear()


def test_realtime_token_route_rejects_same_input_and_output_language(monkeypatch):
    async def fake_post_to_openai(
        settings,
        path,
        api_key_override=None,
        json_data=None,
        form_data=None,
        files=None,
    ):
        return {"value": "should-not-be-used"}

    monkeypatch.setattr("backend.firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.get("/api/realtime/token?input_language=en&output_language=en")

    assert response.status_code == 422
    assert response.json() == {"detail": "input_language and output_language must be different."}
    app.dependency_overrides.clear()


def test_openai_routes_require_server_api_key():
    app.dependency_overrides[get_settings] = override_settings(openai_api_key=None)
    client = TestClient(app)

    realtime_response = client.get("/api/realtime/token")
    realtime_translation_response = client.get("/api/realtime/translation-token")

    assert realtime_response.status_code == 503
    assert realtime_response.json() == {"detail": "OpenAI API key is not configured on the server."}
    assert realtime_translation_response.status_code == 503
    assert realtime_translation_response.json() == {
        "detail": "OpenAI API key is not configured on the server."
    }
    app.dependency_overrides.clear()


def test_realtime_token_route_accepts_browser_api_key_override(monkeypatch):
    calls = []

    async def fake_post_to_openai(
        settings,
        path,
        api_key_override=None,
        json_data=None,
        form_data=None,
        files=None,
    ):
        calls.append(
            {
                "path": path,
                "api_key_override": api_key_override,
                "server_api_key": settings.openai_api_key,
            }
        )
        return {"value": "ephemeral-secret"}

    monkeypatch.setattr("backend.firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key=None)
    client = TestClient(app)

    response = client.get("/api/realtime/token", headers={"X-OpenAI-API-Key": "user-key"})

    assert response.status_code == 200
    assert response.json() == {"value": "ephemeral-secret"}
    assert calls == [
        {
            "path": "/realtime/client_secrets",
            "api_key_override": "user-key",
            "server_api_key": None,
        }
    ]
    app.dependency_overrides.clear()


def test_transcript_session_route_saves_input_output_files(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/transcript-sessions",
        json={
            "source_text": "Selamat pagi",
            "translated_text": "Good morning",
            "input_language": "id",
            "output_language": "en",
            "started_at": "2026-07-04T07:00:00.000Z",
            "ended_at": "2026-07-04T07:05:00.000Z",
        },
    )

    assert response.status_code == 200
    response_data = response.json()
    assert response_data["directory"] == str(tmp_path)

    input_dir = tmp_path / "input"
    output_dir = tmp_path / "output"
    input_file = next(path for path in input_dir.iterdir() if path.name.endswith("-id.txt"))
    output_file = next(path for path in output_dir.iterdir() if path.name.endswith("-en.txt"))
    metadata_file = next(
        path for path in tmp_path.iterdir() if path.name.endswith("-metadata.json")
    )
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-id\.txt", input_file.name)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-en\.txt", output_file.name)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-metadata\.json", metadata_file.name)
    assert input_file.read_text() == "Selamat pagi\n"
    assert output_file.read_text() == "Good morning\n"
    assert sorted(path.name for path in tmp_path.iterdir()) == sorted(
        ["input", "output", metadata_file.name]
    )
    assert sorted(path.name for path in input_dir.iterdir()) == [input_file.name]
    assert sorted(path.name for path in output_dir.iterdir()) == [output_file.name]
    duration_seconds = 300.0
    transcription_cost = expected_duration_cost_usd(DEFAULT_TRANSCRIPTION_MODEL, duration_seconds)
    translation_cost = expected_duration_cost_usd(
        DEFAULT_REALTIME_TRANSLATION_MODEL, duration_seconds
    )
    expected_cost = {
        "currency": "USD",
        "estimated_total_usd": round(transcription_cost + translation_cost, 6),
        "sessions": [
            {
                "name": "transcription",
                "model": DEFAULT_TRANSCRIPTION_MODEL,
                "pricing_basis": "duration",
                "duration_seconds": duration_seconds,
                "rate_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE[
                    DEFAULT_TRANSCRIPTION_MODEL
                ],
                "estimated_cost_usd": transcription_cost,
            },
            {
                "name": "translation",
                "model": DEFAULT_REALTIME_TRANSLATION_MODEL,
                "pricing_basis": "duration",
                "duration_seconds": duration_seconds,
                "rate_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE[
                    DEFAULT_REALTIME_TRANSLATION_MODEL
                ],
                "estimated_cost_usd": translation_cost,
            },
        ],
    }
    assert json.loads(metadata_file.read_text()) == {
        "timestamp": metadata_file.name.removesuffix("-metadata.json"),
        "input_language": "id",
        "input_language_name": "indonesian",
        "output_language": "en",
        "output_language_name": "english",
        "started_at": "2026-07-04T07:00:00.000Z",
        "ended_at": "2026-07-04T07:05:00.000Z",
        "input_path": str(input_file),
        "output_path": str(output_file),
        "cost": expected_cost,
    }
    assert response_data["cost"] == expected_cost
    app.dependency_overrides.clear()


def test_transcript_session_route_saves_output_without_input_file(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/transcript-sessions",
        json={
            "source_text": "",
            "translated_text": "Good morning",
            "input_language": "id",
            "output_language": "en",
            "started_at": "2026-07-04T07:00:00.000Z",
            "ended_at": "2026-07-04T07:05:00.000Z",
        },
    )

    assert response.status_code == 200
    response_data = response.json()
    output_file = next(path for path in (tmp_path / "output").iterdir())
    metadata_file = next(
        path for path in tmp_path.iterdir() if path.name.endswith("-metadata.json")
    )

    assert not (tmp_path / "input").exists()
    assert output_file.read_text() == "Good morning\n"
    assert response_data["input_path"] is None
    assert response_data["output_path"] == str(output_file)

    metadata = json.loads(metadata_file.read_text())
    assert metadata["input_path"] is None
    assert metadata["output_path"] == str(output_file)
    duration_seconds = 300.0
    translation_cost = expected_duration_cost_usd(
        DEFAULT_REALTIME_TRANSLATION_MODEL, duration_seconds
    )
    assert metadata["cost"]["estimated_total_usd"] == translation_cost
    assert metadata["cost"]["sessions"] == [
        {
            "name": "translation",
            "model": DEFAULT_REALTIME_TRANSLATION_MODEL,
            "pricing_basis": "duration",
            "duration_seconds": duration_seconds,
            "rate_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE[
                DEFAULT_REALTIME_TRANSLATION_MODEL
            ],
            "estimated_cost_usd": translation_cost,
        }
    ]
    app.dependency_overrides.clear()


def test_transcript_session_route_rejects_source_without_output(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/transcript-sessions",
        json={
            "source_text": "Selamat pagi",
            "translated_text": " ",
            "input_language": "id",
            "output_language": "en",
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "translated_text is required."}
    assert list(tmp_path.iterdir()) == []
    app.dependency_overrides.clear()


def test_transcript_session_route_rejects_same_input_and_output_language(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/transcript-sessions",
        json={
            "source_text": "Good morning",
            "translated_text": "Good morning",
            "input_language": "en",
            "output_language": "en",
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "input_language and output_language must be different."}
    assert list(tmp_path.iterdir()) == []
    app.dependency_overrides.clear()


def test_transcript_session_route_does_not_overwrite_same_minute_sessions(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    for _ in range(2):
        response = client.post(
            "/api/transcript-sessions",
            json={
                "source_text": "Selamat pagi",
                "translated_text": "Good morning",
                "input_language": "id",
                "output_language": "en",
            },
        )
        assert response.status_code == 200

    assert len(list((tmp_path / "input").iterdir())) == 2
    assert len(list((tmp_path / "output").iterdir())) == 2
    assert len([path for path in tmp_path.iterdir() if path.name.endswith("-metadata.json")]) == 2
    app.dependency_overrides.clear()


def test_transcript_session_route_rejects_empty_session(tmp_path):
    app.dependency_overrides[get_settings] = override_settings(transcript_save_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/transcript-sessions",
        json={
            "source_text": " ",
            "translated_text": "",
            "input_language": "id",
            "output_language": "en",
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "At least one transcript field is required."}
    assert list(tmp_path.iterdir()) == []
    app.dependency_overrides.clear()


def test_feedback_route_sends_report_email(monkeypatch):
    calls = []

    def fake_send_feedback_email(payload, settings, client_ip, user_agent):
        calls.append(
            {
                "payload": payload,
                "settings": settings,
                "client_ip": client_ip,
                "user_agent": user_agent,
            }
        )

    monkeypatch.setattr("backend.firetong.main.send_feedback_email", fake_send_feedback_email)
    app.dependency_overrides[get_settings] = override_settings(
        feedback_email_from="reports@example.com",
        feedback_smtp_host="smtp.example.com",
    )
    client = TestClient(app)

    response = client.post(
        "/api/feedback",
        headers={
            "User-Agent": "Test Browser",
            "X-Forwarded-For": "203.0.113.10, 10.0.0.2",
        },
        json={
            "feedback": "Translation froze halfway through.",
            "source_transcript": "Selamat pagi",
            "translated_transcript": "Good morning",
            "input_language": "id",
            "input_language_label": "Indonesian",
            "output_language": "en",
            "output_language_label": "English",
            "metadata": {"online": True},
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(calls) == 1
    call = calls[0]
    assert call["payload"].feedback == "Translation froze halfway through."
    assert call["payload"].source_transcript == "Selamat pagi"
    assert call["payload"].translated_transcript == "Good morning"
    assert call["payload"].metadata == {"online": True}
    assert call["client_ip"] == "203.0.113.10"
    assert call["user_agent"] == "Test Browser"
    assert call["settings"].feedback_email_to == "stepkurniawan.learn@gmail.com"
    app.dependency_overrides.clear()


def test_feedback_route_rejects_blank_feedback(monkeypatch):
    def fake_send_feedback_email(payload, settings, client_ip, user_agent):
        raise AssertionError("blank feedback should not send email")

    monkeypatch.setattr("backend.firetong.main.send_feedback_email", fake_send_feedback_email)
    client = TestClient(app)

    response = client.post(
        "/api/feedback",
        json={
            "feedback": " ",
            "source_transcript": "",
            "translated_transcript": "Good morning",
            "input_language": "id",
            "input_language_label": "Indonesian",
            "output_language": "en",
            "output_language_label": "English",
            "metadata": {},
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "feedback is required."}
