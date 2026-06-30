from fastapi.testclient import TestClient

from firetong.main import app
from firetong.settings import Settings, get_settings


def override_settings(**values):
    def _override():
        return Settings(**values)

    return _override


def test_config_reports_browser_model_defaults():
    app.dependency_overrides[get_settings] = override_settings()
    client = TestClient(app)

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {
        "openai_base_url": "https://api.openai.com/v1",
        "translation_model": "gpt-4o-mini",
        "transcription_model": "Xenova/whisper-tiny",
        "chunk_seconds": 5,
    }
    app.dependency_overrides.clear()


def test_server_does_not_own_transcription_or_translation():
    client = TestClient(app)

    response = client.post("/api/translate", json={"source_text": "Tuhan itu baik."})
    transcribe_response = client.post("/api/transcribe")

    assert response.status_code == 405
    assert transcribe_response.status_code == 405
