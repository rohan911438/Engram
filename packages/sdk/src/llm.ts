/** A JSON-schema-ish description of the expected output (Gemini's OpenAPI subset). */
export type Schema = Record<string, unknown>;

/** Anything that can answer a prompt with JSON matching a schema. */
export interface LLM {
  readonly name: string;
  json<T>(system: string, prompt: string, schema: Schema): Promise<T>;
}

export interface GeminiOptions {
  /** One or more API keys; on rate limits the next key is tried. */
  apiKeys: string[];
  model?: string;
  temperature?: number;
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

export class GeminiLLM implements LLM {
  readonly name: string;
  private keys: string[];
  private current = 0;
  private model: string;
  private temperature: number;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(opts: GeminiOptions) {
    this.keys = opts.apiKeys.map((k) => k.trim()).filter(Boolean);
    if (this.keys.length === 0) throw new Error("GeminiLLM needs at least one API key");
    this.model = opts.model ?? "gemini-flash-latest";
    this.temperature = opts.temperature ?? 0.2;
    this.baseUrl = opts.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = opts.fetch ?? fetch;
    this.name = `gemini:${this.model}`;
  }

  async json<T>(system: string, prompt: string, schema: Schema): Promise<T> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: this.temperature, responseMimeType: "application/json", responseSchema: schema },
    });
    let lastError = "";
    // Each key gets up to two tries; rate limits and server errors rotate to the next key.
    for (let attempt = 0; attempt < this.keys.length * 2; attempt++) {
      const key = this.keys[this.current]!;
      let res: Response;
      try {
        res = await this.fetchFn(`${this.baseUrl}/models/${this.model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body,
          signal: AbortSignal.timeout(120_000),
        });
      } catch (err) {
        lastError = `network: ${(err as Error).message}`;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const raw = await res.text();
      if (res.status === 429 || res.status >= 500 || res.status === 403) {
        lastError = `HTTP ${res.status}: ${raw.slice(0, 200)}`;
        this.current = (this.current + 1) % this.keys.length;
        await sleep(attempt < this.keys.length ? 500 : 3000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 300)}`);
      const data = JSON.parse(raw) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) {
        lastError = `empty response (${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? "unknown"})`;
        continue;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        lastError = `invalid JSON: ${text.slice(0, 200)}`;
      }
    }
    throw new Error(`Gemini failed after retries — ${lastError}`);
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns scripted answers in order. For tests and offline demos. */
export class ScriptedLLM implements LLM {
  readonly name = "scripted";
  readonly calls: { system: string; prompt: string }[] = [];
  constructor(private answers: unknown[]) {}
  async json<T>(system: string, prompt: string): Promise<T> {
    this.calls.push({ system, prompt });
    if (this.answers.length === 0) throw new Error("ScriptedLLM: no answers left");
    return this.answers.shift() as T;
  }
}
