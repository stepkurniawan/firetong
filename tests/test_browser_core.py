import subprocess


def test_browser_core_javascript_unit_tests_pass():
    result = subprocess.run(
        ["node", "--test", "tests/browser_core.test.mjs"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
