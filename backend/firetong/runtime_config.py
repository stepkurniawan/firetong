DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper"
DEFAULT_REALTIME_INPUT_LANGUAGE = "id"
DEFAULT_REALTIME_TRANSLATION_MODEL = "gpt-realtime-translate"
DEFAULT_REALTIME_TRANSLATION_LANGUAGE = "en"
DEFAULT_REALTIME_TRANSCRIPTION_DELAY = "low"

REALTIME_LANGUAGE_OPTIONS = (
    {"value": "id", "label": "Indonesian"},
    {"value": "en", "label": "English"},
    {"value": "de", "label": "German"},
)
SUPPORTED_REALTIME_LANGUAGES = tuple(option["value"] for option in REALTIME_LANGUAGE_OPTIONS)
TRANSCRIPT_FILE_LANGUAGE_NAMES = {
    option["value"]: option["label"].lower() for option in REALTIME_LANGUAGE_OPTIONS
}

REALTIME_DURATION_RATES_USD_PER_MINUTE = {
    DEFAULT_TRANSCRIPTION_MODEL: 0.017,
    DEFAULT_REALTIME_TRANSLATION_MODEL: 0.034,
}
