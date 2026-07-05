from importlib.resources import files

from jinja2 import StrictUndefined, Template


def _load_default_transcription_prompt() -> str:
    return (
        files("backend.firetong.prompts")
        .joinpath("transcription_prompt.jinja2")
        .read_text(encoding="utf-8")
        .strip()
    )


DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper"
DEFAULT_REALTIME_INPUT_LANGUAGE = "id"
DEFAULT_REALTIME_TRANSLATION_MODEL = "gpt-realtime-translate"
DEFAULT_REALTIME_TRANSLATION_LANGUAGE = "en"
DEFAULT_REALTIME_TRANSCRIPTION_DELAY = "low"
DEFAULT_TRANSCRIPTION_PROMPT = _load_default_transcription_prompt()

REALTIME_LANGUAGE_OPTIONS = (
    {"value": "id", "label": "Indonesian"},
    {"value": "en", "label": "English"},
    {"value": "de", "label": "German"},
)
SUPPORTED_REALTIME_LANGUAGES = tuple(option["value"] for option in REALTIME_LANGUAGE_OPTIONS)
REALTIME_LANGUAGE_NAMES = {option["value"]: option["label"] for option in REALTIME_LANGUAGE_OPTIONS}
TRANSCRIPT_FILE_LANGUAGE_NAMES = {
    option["value"]: option["label"].lower() for option in REALTIME_LANGUAGE_OPTIONS
}

REALTIME_DURATION_RATES_USD_PER_MINUTE = {
    DEFAULT_TRANSCRIPTION_MODEL: 0.02,
    DEFAULT_REALTIME_TRANSLATION_MODEL: 0.05,
}


def render_transcription_prompt(
    prompt_template: str,
    input_language: str,
    output_language: str,
) -> str:
    template = Template(prompt_template, undefined=StrictUndefined)
    return template.render(
        input_language=input_language,
        input_language_name=REALTIME_LANGUAGE_NAMES[input_language],
        output_language=output_language,
        output_language_name=REALTIME_LANGUAGE_NAMES[output_language],
    ).strip()
