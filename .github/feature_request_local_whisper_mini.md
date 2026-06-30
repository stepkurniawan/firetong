# Feature request: Local Whisper Mini support

## Summary

Add a future capability to run local in-browser Whisper Mini transcription without relying on remote model downloads from the Hugging Face Hub.

## Motivation

Currently FireTong uses `@xenova/transformers` with `Xenova/whisper-tiny` in the browser.
That approach downloads remote assets and may fail when a local `/models/` path is not configured or available.

A local Whisper Mini feature would:
- improve offline or restricted-network usability,
- avoid hub fetch failures and reduce cold-start latency,
- provide a fallback to a local model directory when remote assets are blocked.

## Proposed behavior

- support a local model directory served from `/models/` or similar,
- allow `@xenova/transformers` `env.localModelPath` configuration,
- optionally provide a smaller Whisper Mini variant for better in-browser performance,
- keep the OpenAI Whisper API as a fallback path.

## Notes

This is a future enhancement request only. The current implementation remains browser-based transcription via `Xenova/whisper-tiny`.

## Status

- Status: open
- Priority: future improvement
