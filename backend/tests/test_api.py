import json

from backend.firetong.main import app
from backend.firetong.settings import Settings, get_settings
from fastapi.testclient import TestClient


def override_settings(**values):
    def _override():
        return Settings(**values)

    return _override


def test_config_reports_openai_model_defaults():
    app.dependency_overrides[get_settings] = override_settings()
    client = TestClient(app)

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {
        "openai_base_url": "https://api.openai.com/v1",
        "realtime_input_language": "id",
        "realtime_translation_model": "gpt-realtime-translate",
        "realtime_translation_language": "en",
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
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.get("/api/realtime/token?input_language=en")

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
                        "delay": "low",
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
    translation_response = client.get("/api/realtime/translation-token?output_language=fr")

    assert transcription_response.status_code == 422
    assert transcription_response.json() == {"detail": "input_language must be one of: id, en, de."}
    assert translation_response.status_code == 422
    assert translation_response.json() == {"detail": "output_language must be one of: id, en, de."}
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
    saved_directory = tmp_path / response.json()["directory"].split("/")[-1]
    assert saved_directory.is_dir()
    assert (saved_directory / "input.txt").read_text() == "Selamat pagi\n"
    assert (saved_directory / "output.txt").read_text() == "Good morning\n"
    assert json.loads((saved_directory / "metadata.json").read_text()) == {
        "source_text": "Selamat pagi",
        "translated_text": "Good morning",
        "input_language": "id",
        "output_language": "en",
        "started_at": "2026-07-04T07:00:00.000Z",
        "ended_at": "2026-07-04T07:05:00.000Z",
    }
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
