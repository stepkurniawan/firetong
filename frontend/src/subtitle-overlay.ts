const DEFAULT_SUBTITLE_TEXT = "Waiting for translation...";
const MAX_SUBTITLE_WORDS = 20;
const MIN_SUBTITLE_FONT_SIZE_PX = 16;
const PUNCTUATION = new Set([".", "!", "?", "。", "！", "？"]);

type DocumentPictureInPictureApi = {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }): Promise<Window>;
};

type DocumentPictureInPictureWindow = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

export const SUBTITLE_PIP_UNSUPPORTED_MESSAGE =
  "Subtitle mode needs Chrome or Edge with Picture-in-Picture support. Use Chrome/Edge or turn off Subtitle mode.";

export function canOpenSubtitleOverlay(browserWindow: Window = window): boolean {
  return typeof getDocumentPictureInPicture(browserWindow)?.requestWindow === "function";
}

export function latestSubtitleText(text: string, maxWords = MAX_SUBTITLE_WORDS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const boundaries = sentenceBoundaries(normalized);
  if (boundaries.length === 0) return latestWords(normalized, maxWords);

  const lastBoundary = boundaries[boundaries.length - 1];
  const previousBoundary = boundaries[boundaries.length - 2] ?? 0;
  const latestPhrase =
    lastBoundary < normalized.length
      ? normalized.slice(lastBoundary).trim()
      : normalized.slice(previousBoundary, lastBoundary).trim();

  return latestWords(latestPhrase || normalized, maxWords);
}

function sentenceBoundaries(text: string): number[] {
  const boundaries: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (!PUNCTUATION.has(text[index])) continue;

    let boundary = index + 1;
    while (boundary < text.length && PUNCTUATION.has(text[boundary])) {
      boundary += 1;
    }
    while (boundary < text.length && /["')\]]/.test(text[boundary])) {
      boundary += 1;
    }
    while (boundary < text.length && /\s/.test(text[boundary])) {
      boundary += 1;
    }
    boundaries.push(boundary);
    index = boundary - 1;
  }

  return boundaries;
}

function latestWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;

  return words.slice(-maxWords).join(" ");
}

function getDocumentPictureInPicture(
  browserWindow: Window,
): DocumentPictureInPictureApi | undefined {
  return (browserWindow as DocumentPictureInPictureWindow).documentPictureInPicture;
}

export class SubtitleOverlay {
  private subtitleWindow: Window | null = null;
  private subtitleTextElement: HTMLElement | null = null;
  private fitFrame: number | null = null;

  async open(initialText = ""): Promise<void> {
    if (!canOpenSubtitleOverlay()) {
      throw new Error(SUBTITLE_PIP_UNSUPPORTED_MESSAGE);
    }

    this.close();
    const subtitleWindow = await getDocumentPictureInPicture(window)?.requestWindow({
      width: 1280,
      height: 220,
      disallowReturnToOpener: true,
    });
    if (!subtitleWindow) {
      throw new Error(SUBTITLE_PIP_UNSUPPORTED_MESSAGE);
    }

    this.subtitleWindow = subtitleWindow;
    this.subtitleTextElement = renderSubtitleDocument(subtitleWindow.document);
    subtitleWindow.addEventListener("resize", () => this.scheduleFit());
    subtitleWindow.addEventListener("pagehide", () => {
      if (this.subtitleWindow !== subtitleWindow) return;

      this.subtitleWindow = null;
      this.subtitleTextElement = null;
      this.fitFrame = null;
    });
    this.update(initialText);
  }

  update(transcriptText: string): void {
    if (!this.subtitleTextElement) return;

    const subtitle = latestSubtitleText(transcriptText);
    this.subtitleTextElement.textContent = subtitle || DEFAULT_SUBTITLE_TEXT;
    this.subtitleTextElement.classList.toggle("is-placeholder", !subtitle);
    this.scheduleFit();
  }

  close(): void {
    const currentWindow = this.subtitleWindow;
    if (currentWindow && this.fitFrame !== null) {
      currentWindow.cancelAnimationFrame(this.fitFrame);
    }
    this.subtitleWindow = null;
    this.subtitleTextElement = null;
    this.fitFrame = null;
    if (currentWindow && !currentWindow.closed) currentWindow.close();
  }

  private scheduleFit(): void {
    const subtitleWindow = this.subtitleWindow;
    const subtitleTextElement = this.subtitleTextElement;
    if (!subtitleWindow || !subtitleTextElement) return;

    if (this.fitFrame !== null) subtitleWindow.cancelAnimationFrame(this.fitFrame);
    this.fitFrame = subtitleWindow.requestAnimationFrame(() => {
      this.fitFrame = null;
      if (
        this.subtitleWindow !== subtitleWindow ||
        this.subtitleTextElement !== subtitleTextElement
      ) {
        return;
      }
      fitSubtitleText(subtitleWindow, subtitleTextElement);
    });
  }
}

function fitSubtitleText(subtitleWindow: Window, subtitleTextElement: HTMLElement): void {
  subtitleTextElement.style.removeProperty("font-size");
  let fontSize = Number.parseFloat(
    subtitleWindow.getComputedStyle(subtitleTextElement).fontSize,
  );

  while (
    subtitleTextElement.scrollHeight > subtitleTextElement.clientHeight + 1 &&
    fontSize > MIN_SUBTITLE_FONT_SIZE_PX
  ) {
    fontSize = Math.max(MIN_SUBTITLE_FONT_SIZE_PX, fontSize - 2);
    subtitleTextElement.style.fontSize = `${fontSize}px`;
  }
}

function renderSubtitleDocument(documentToRender: Document): HTMLElement {
  documentToRender.title = "FireTong subtitles";
  documentToRender.head.replaceChildren();
  documentToRender.body.replaceChildren();

  const style = documentToRender.createElement("style");
  style.textContent = `
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: rgb(0 0 0 / 58%);
      color: #ffffff;
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      display: grid;
      place-items: center;
    }

    .subtitle-shell {
      display: grid;
      place-items: center;
      width: 100vw;
      min-height: 100vh;
      padding: clamp(8px, 3vw, 22px);
      background: rgb(0 0 0 / 58%);
    }

    .subtitle-text {
      display: -webkit-box;
      max-width: 96vw;
      margin: 0;
      overflow: hidden;
      color: #ffffff;
      font-size: max(16px, 30vh);
      font-weight: 760;
      line-height: 1.12;
      overflow-wrap: anywhere;
      text-align: center;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .subtitle-text.is-placeholder {
      color: #aeb7c2;
    }
  `;

  const shell = documentToRender.createElement("main");
  shell.className = "subtitle-shell";

  const text = documentToRender.createElement("p");
  text.className = "subtitle-text";
  text.setAttribute("aria-live", "polite");

  shell.append(text);
  documentToRender.head.append(style);
  documentToRender.body.append(shell);
  return text;
}
