# FireTong Frontend

## Checking Realtime Latency Logs

In local development, open the Vite frontend:

```sh
http://127.0.0.1:5173/
```

Open the browser DevTools console and filter for:

```text
firetong:latency
```

The app logs steady-state translation metrics while a live translation session is running:

- `translation_delta_gap`: time between consecutive `session.output_transcript.delta` events.
- `longest_audio_present_without_translation_delta`: longest observed period where input audio is present but no translated text delta has arrived.
- `webrtc_stats`: periodic WebRTC transport stats, including RTT, jitter, packet loss, outbound audio bitrate, and packets sent.
- `translation_delta_ui_render_delay`: time from receiving a translated text delta to Svelte flushing it into the transcript UI.

For sermon-speed testing, keep audio playing continuously and watch the steady-state metrics. The startup time is intentionally not logged here, because the useful signal is how far translated text falls behind after the session is already live.
