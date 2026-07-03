import json
from pathlib import Path


def test_vite_dev_server_proxies_api_to_local_backend():
    package_json = json.loads(Path("package.json").read_text())
    vite_config = Path("vite.config.ts").read_text()

    assert "dev:api" in package_json["scripts"]
    assert "uv run uvicorn backend.firetong.main:app" in package_json["scripts"]["dev:api"]
    assert "--port 8000" in package_json["scripts"]["dev:api"]
    assert '"/api"' in vite_config
    assert 'target: "http://127.0.0.1:8000"' in vite_config


def test_generated_backend_static_assets_are_ignored_but_directory_exists():
    gitignore = Path(".gitignore").read_text()

    assert "backend/static/*" in gitignore
    assert "!backend/static/.gitkeep" in gitignore
    assert Path("backend/static/.gitkeep").exists()
