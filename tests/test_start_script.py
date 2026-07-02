from pathlib import Path


def test_start_script_restarts_app_when_code_changes():
    start_script = Path("start.sh").read_text()

    assert "--reload" in start_script
    assert "--reload-dir firetong" in start_script
    assert "--reload-include '*.py'" in start_script
    assert "--reload-include '*.html'" in start_script
    assert "--reload-include '*.css'" in start_script
    assert "--reload-include '*.js'" in start_script
    assert "--reload-include '*.webmanifest'" in start_script
