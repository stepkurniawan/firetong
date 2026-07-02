from fastapi.testclient import TestClient

from firetong.main import app
from firetong.settings import Settings, get_settings


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

    async def fake_post_to_openai(settings, path, json_data=None, form_data=None, files=None):
        calls.append(
            {
                "path": path,
                "json_data": json_data,
                "files": files,
                "model": settings.realtime_translation_model,
            }
        )
        return {"value": "translation-secret"}

    monkeypatch.setattr("firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.get("/api/realtime/translation-token")

    assert response.status_code == 200
    assert response.json() == {"value": "translation-secret"}
    assert calls[0]["path"] == "/realtime/translations/client_secrets"
    assert calls[0]["json_data"] == {
        "session": {
            "model": "gpt-realtime-translate",
            "audio": {
                "output": {
                    "language": "en",
                },
            },
        }
    }
    assert calls[0]["files"] is None
    assert calls[0]["model"] == "gpt-realtime-translate"
    app.dependency_overrides.clear()


def test_realtime_token_route_creates_transcription_session(monkeypatch):
    calls = []

    async def fake_post_to_openai(settings, path, json_data=None, form_data=None, files=None):
        calls.append(
            {
                "path": path,
                "json_data": json_data,
                "files": files,
                "model": settings.transcription_model,
            }
        )
        return {"value": "ephemeral-secret"}

    monkeypatch.setattr("firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.get("/api/realtime/token")

    assert response.status_code == 200
    assert response.json() == {"value": "ephemeral-secret"}
    assert calls[0]["path"] == "/realtime/client_secrets"
    assert calls[0]["json_data"] == {
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "transcription": {
                        "model": "gpt-realtime-whisper",
                        "language": "id",
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
