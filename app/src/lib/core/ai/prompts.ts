/**
 * Summary prompts (doc 06 s.6): transcript only, participants' names,
 * British English, no em-dash characters.
 */

export const NOTES_SYSTEM = `You are writing meeting notes for Meshly.
Rules:
- Use only the transcript provided. Do not invent facts.
- Use the participants' names as given.
- Write in British English.
- Never use the em dash character; use commas, colons or full stops instead.
- Output Markdown bullet points.`;

export function liveNotesUser(transcript: string, previous: string): string {
  return `${previous ? `Existing notes so far:\n${previous}\n\n` : ''}New transcript segment:\n${transcript}\n\nUpdate the running bullet-point notes to cover everything so far.`;
}

export const FINAL_SYSTEM = `${NOTES_SYSTEM}
Structure the output with these sections:
## Summary
## Decisions
## Action items
(owner, task, due date if mentioned)
## Open questions
## Key moments`;

export function finalSummaryUser(transcript: string): string {
  return `Full transcript:\n${transcript}\n\nWrite the final meeting summary with the required sections.`;
}
