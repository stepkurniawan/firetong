from fastapi.testclient import TestClient

from firetong.main import app, render_prompt
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
        "translation_model": "gpt-4o-mini",
        "transcription_model": "whisper-1",
        "chunk_seconds": 5,
    }
    app.dependency_overrides.clear()


def test_server_exposes_translation_and_transcription_routes():
    client = TestClient(app)

    response = client.post("/api/translate", json={})
    transcribe_response = client.post("/api/transcribe")

    assert response.status_code == 422
    assert transcribe_response.status_code == 422


def test_translation_prompt_renders_from_jinja_template():
    prompt = render_prompt(
        "translation_system.jinja2",
        source_language="Indonesian",
        target_language="English",
    )

    assert "Translate Indonesian sermon text to English." in prompt
    assert "Roh Kudus" in prompt
    assert "{{" not in prompt
    assert "{%" not in prompt


def test_translate_route_uses_backend_openai_chat_completion(monkeypatch):
    calls = []

    async def fake_post_to_openai(settings, path, json_data=None, form_data=None, files=None):
        calls.append(
            {
                "path": path,
                "json_data": json_data,
                "files": files,
                "model": settings.translation_model,
            }
        )
        return {
            "choices": [
                {
                    "message": {
                        "content": "God is good.",
                    }
                }
            ]
        }

    monkeypatch.setattr("firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.post("/api/translate", json={"source_text": "Tuhan itu baik."})

    assert response.status_code == 200
    assert response.json() == {"translation": "God is good."}
    assert calls[0]["path"] == "/chat/completions"
    assert calls[0]["json_data"]["model"] == "gpt-4o-mini"
    assert calls[0]["json_data"]["messages"][1] == {
        "role": "user",
        "content": "Tuhan itu baik.",
    }
    assert "Roh Kudus" in calls[0]["json_data"]["messages"][0]["content"]
    assert calls[0]["files"] is None
    assert calls[0]["model"] == "gpt-4o-mini"
    app.dependency_overrides.clear()


def test_transcribe_route_uses_openai_whisper_api(monkeypatch):
    calls = []

    async def fake_post_to_openai(settings, path, json_data=None, form_data=None, files=None):
        calls.append(
            {
                "path": path,
                "form_data": form_data,
                "files": files,
                "model": settings.transcription_model,
            }
        )
        return {"text": "Tuhan itu baik."}

    monkeypatch.setattr("firetong.main.post_to_openai", fake_post_to_openai)
    app.dependency_overrides[get_settings] = override_settings(openai_api_key="test-key")
    client = TestClient(app)

    response = client.post(
        "/api/transcribe",
        data={"language": "id"},
        files={"file": ("recording.webm", b"audio-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "Tuhan itu baik."}
    assert calls[0]["path"] == "/audio/transcriptions"
    assert calls[0]["form_data"] == {"model": "whisper-1", "language": "id"}
    assert calls[0]["files"]["file"] == ("recording.webm", b"audio-bytes", "audio/webm")
    assert calls[0]["model"] == "whisper-1"
    app.dependency_overrides.clear()


def test_openai_routes_require_server_api_key():
    app.dependency_overrides[get_settings] = override_settings(openai_api_key=None)
    client = TestClient(app)

    response = client.post("/api/translate", json={"source_text": "Tuhan itu baik."})

    assert response.status_code == 503
    assert response.json() == {"detail": "OpenAI API key is not configured on the server."}
    app.dependency_overrides.clear()
