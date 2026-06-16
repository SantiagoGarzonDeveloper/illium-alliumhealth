const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'llama-3.1-70b-versatile';

/**
 * The Groq API key is read from the build-time env var `VITE_GROQ_API_KEY`.
 * Set it in a local `.env` file (see `.env.example`) — never hardcode it here,
 * so the key is not committed to the repository.
 */
export function getGroqApiKey(): string {
  return (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim() || '';
}

export async function groqChatCompletion(
  messages: { role: string; content: string }[],
  opts?: { temperature?: number },
): Promise<string> {
  const key = getGroqApiKey();
  if (!key) {
    throw new Error('Groq API key is not configured.');
  }

  const fetchModel = (model: string) =>
    fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        // Low temperature for deterministic, faithful output (protocols must NOT
        // invent or approximate numbers). Defaults to the model's standard when omitted.
        ...(typeof opts?.temperature === 'number' ? { temperature: opts.temperature } : {}),
      }),
    });

  let res = await fetchModel(PRIMARY_MODEL);
  let data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error?.message?.includes('Model')) {
    res = await fetchModel(FALLBACK_MODEL);
    data = (await res.json()) as typeof data;
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(data.error?.message || 'No response from AI');
  }
  return text;
}
