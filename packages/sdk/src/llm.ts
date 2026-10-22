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
  /** Tried in order when the main model is overloaded on every key. */
  fallbackModels?: string[];
  temperature?: number;
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
  /** For tests: base delay between retries in ms. */
  retryDelayMs?: number;
}

export const DEFAULT_GEMINI_FALLBACKS = ["gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemma-4-26b-a4b-it", "gemma-4-31b-it"];

export class GeminiLLM implements LLM {
  readonly name: string;
  /** Model that answered the last request. */
  lastModel?: string;
  private keys: string[];
  private current = 0;
  /** "key|model" pairs that hit their daily quota. */
  private exhausted = new Set<string>();
  private models: string[];
  private temperature: number;
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private delay: number;

  constructor(opts: GeminiOptions) {
    this.keys = opts.apiKeys.map((k) => k.trim()).filter(Boolean);
    if (this.keys.length === 0) throw new Error("GeminiLLM needs at least one API key");
    const main = opts.model ?? "gemini-flash-latest";
    this.models = [main, ...(opts.fallbackModels ?? DEFAULT_GEMINI_FALLBACKS).filter((m) => m !== main)];
    this.temperature = opts.temperature ?? 0.2;
    this.baseUrl = opts.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = opts.fetch ?? fetch;
    this.delay = opts.retryDelayMs ?? 1000;
    this.name = `gemini:${main}`;
  }

  async json<T>(system: string, prompt: string, schema: Schema): Promise<T> {
    const errors: string[] = [];
    for (const model of this.models) {
      const body = requestBody(model, system, prompt, schema, this.temperature);
      // Each model gets two rounds over all keys before moving to the next model.
      for (let attempt = 0; attempt < this.keys.length * 2; attempt++) {
        const live = this.keys.filter((k) => !this.exhausted.has(`${k}|${model}`));
        if (live.length === 0) break;
        if (this.exhausted.has(`${this.keys[this.current]}|${model}`)) this.current = this.keys.indexOf(live[0]!);
        const key = this.keys[this.current]!;
        const r = await this.call(model, key, body);
        if (r.ok) {
          this.lastModel = model;
          return r.value as T;
        }
        errors.push(`${model}: ${r.error}`);
        if (r.fatal) throw new Error(`Gemini ${model}: ${r.error}`);
        if (r.skipModel) break;
        if (r.dailyLimit) {
          this.exhausted.add(`${key}|${model}`);
          continue;
        }
        if (r.rotate) this.current = (this.current + 1) % this.keys.length;
        await sleep(this.delay * (attempt + 1));
      }
    }
    throw new Error(`Gemini failed on all models — last error ${errors[errors.length - 1] ?? "unknown"}`);
  }

  private async call(model: string, key: string, body: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string; rotate?: boolean; fatal?: boolean; skipModel?: boolean; dailyLimit?: boolean }> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      return { ok: false, error: `network: ${(err as Error).message}` };
    }
    const raw = await res.text();
    const msg = () => {
      try {
        return (JSON.parse(raw) as { error?: { message?: string } }).error?.message?.slice(0, 160) ?? raw.slice(0, 160);
      } catch {
        return raw.slice(0, 160);
      }
    };
    // "PerDay" quota: this key is done with this model until tomorrow.
    if (res.status === 429 && raw.includes("PerDay")) return { ok: false, error: `HTTP 429 daily quota used up`, dailyLimit: true };
    if (res.status === 429 || res.status === 403) return { ok: false, error: `HTTP ${res.status} ${msg()}`, rotate: true };
    if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504) return { ok: false, error: `HTTP ${res.status} ${msg()}`, rotate: true };
    if (res.status === 404) return { ok: false, error: `HTTP 404 ${msg()}`, skipModel: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${msg()}`, fatal: true };
    const data = JSON.parse(raw) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) return { ok: false, error: `empty response (${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? "unknown"})` };
    const value = parseJsonLoose(text);
    return value === undefined ? { ok: false, error: `invalid JSON: ${text.slice(0, 120)}` } : { ok: true, value };
  }
}

/**
 * Gemini models get native JSON mode with a schema. Gemma models (open
 * weights, separate free quota) support neither system instructions nor
 * schemas, so they get everything in one prompt and we parse the JSON out.
 */
function requestBody(model: string, system: string, prompt: string, schema: Schema, temperature: number): string {
  if (model.startsWith("gemma")) {
    const text = `${system}\n\n${prompt}\n\nAnswer with ONLY a JSON object matching this JSON schema, no prose, no code fences:\n${JSON.stringify(schema)}`;
    return JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature } });
  }
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
  });
}

/** Parses JSON, also when wrapped in ```json fences or surrounded by text. */
export function parseJsonLoose(text: string): unknown {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(text.trim());
  if (direct !== undefined) return direct;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) {
    const v = tryParse(fenced[1]!.trim());
    if (v !== undefined) return v;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? tryParse(text.slice(start, end + 1)) : undefined;
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

/**
 * Gemini embeddings (gemini-embedding-001) at 1536 dims, rotating keys on quota
 * errors. Used for Walrus Memory manual mode.
 */
export function geminiEmbedder(apiKeys: string[], opts: { model?: string; dims?: number; fetch?: typeof fetch } = {}): (text: string) => Promise<number[]> {
  const model = opts.model ?? "gemini-embedding-001";
  const f = opts.fetch ?? fetch;
  let next = 0;
  return async (text: string) => {
    let last = "";
    for (let attempt = 0; attempt < apiKeys.length * 2; attempt++) {
      const key = apiKeys[next % apiKeys.length]!;
      const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: opts.dims ?? 1536 }),
      });
      if (res.ok) {
        const j = (await res.json()) as { embedding?: { values?: number[] } };
        if (!j.embedding?.values?.length) throw new Error("Gemini embedding returned no values");
        return j.embedding.values;
      }
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) throw new Error(`Gemini embedding failed: ${last} ${(await res.text()).slice(0, 200)}`);
      next++;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    throw new Error(`Gemini embedding failed on every key: ${last}`);
  };
}
