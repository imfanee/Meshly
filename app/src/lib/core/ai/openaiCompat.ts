/**
 * OpenAI-compatible adapter (doc 06 s.6): covers Groq, Gemini's
 * /v1beta/openai surface, and any user-supplied compatible endpoint.
 * Only chat/completions + models probing are needed for T4.1; the notes
 * engine calls `chat` for summaries in T4.3.
 */

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(
  baseUrl: string,
  key: string,
  model: string,
  messages: ChatMsg[],
): Promise<string> {
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });
  if (!r.ok)
    throw new Error(
      `${r.status} ${await r.text().then((t) => t.slice(0, 120))}`,
    );
  const j = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return j.choices?.[0]?.message?.content ?? '';
}

/** Cheap credential check: a 1-token completion. */
export async function testKey(
  baseUrl: string,
  key: string,
  model: string,
): Promise<string> {
  return chat(baseUrl, key, model, [
    { role: 'user', content: 'Reply with the word ok.' },
  ]);
}
