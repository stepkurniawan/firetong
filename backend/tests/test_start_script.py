from pathlib import Path


def test_start_script_runs_backend_api_for_vite_dev_proxy():
    start_script = Path("start.sh").read_text()

    assert "--reload" in start_script
    assert "backend.firetong.main:app" in start_script
    assert "--host 127.0.0.1" in start_script
    assert "--port 8000" in start_script
    assert "--reload-dir backend" in start_script
    assert "--reload-dir frontend" not in start_script
