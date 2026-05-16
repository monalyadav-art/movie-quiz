import Groq from 'groq-sdk';
import { NextRequest, NextResponse } from 'next/server';

// ─── Env / clients ─────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GEMINI_API_KEY && !GROQ_API_KEY) {
  throw new Error('Either GEMINI_API_KEY or GROQ_API_KEY must be set in .env.local');
}

const groqClient = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;
const groqModel = 'llama-3.3-70b-versatile';
const geminiModel = 'gemini-1.5-flash';

type ProviderName = 'gemini' | 'groq';

// ─── Mode catalog ─────────────────────────────────────────────
export interface ModeDef {
  id: number;
  name: string;
  explanation: string;
}

const MODE_CATALOG: ModeDef[] = [
  { id: 1, name: 'Hear the Dialogue, Name the Film', explanation: 'A famous dialogue echoes — name the film it belongs to.' },
  { id: 2, name: 'Decode the Actor',                 explanation: 'Three cryptic clues, one Bollywood superstar. Crack the code.' },
  { id: 3, name: 'Picture the Scene',                explanation: 'A scene painted in words. Which film does it belong to?' },
  { id: 4, name: 'When Was This Released',           explanation: 'Test your Bollywood calendar — pinpoint the release year.' },
  { id: 5, name: 'Box Office Battle',                explanation: 'Two films, one box-office crown — who took the bigger bite?' },
  { id: 6, name: "Director's Fingerprint",           explanation: 'Spot the auteur behind the frame.' },
  { id: 7, name: 'The Connection',                   explanation: 'Four films, one thread. What links them?' },
];

const MAX_BANNED_PER_KIND = 60; // keep prompt size sane

// ─── Types ────────────────────────────────────────────────────
interface QuestionResponse {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  metadata?: {
    films?: string[];
    actors?: string[];
    directors?: string[];
    dialogue?: string;
    connection?: string;
    topic?: string;
  };
}

interface UsedTrackers {
  usedFilms?: string[];
  usedActors?: string[];
  usedDirectors?: string[];
  usedDialogues?: string[];
  usedConnections?: string[];
  usedTopics?: string[];
}

// ─── Route handler ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let requestBody: unknown = null;
  try {
    requestBody = await request.json();
  } catch (parseError) {
    console.error('API Error: Failed to parse POST body', { parseError });
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 });
  }

  const body = requestBody as {
    action?: string;
    modeId?: number;
    difficulty?: number;
    level?: number;
  } & UsedTrackers;

  if (!body.action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'getModes':
        return NextResponse.json({ modes: selectModes() });
      case 'getQuestions':
        if (!body.modeId || typeof body.difficulty !== 'number' || typeof body.level !== 'number') {
          return NextResponse.json({ error: 'Missing modeId, difficulty or level' }, { status: 400 });
        }
        return await getQuestionsForMode(body.modeId, body.difficulty, body.level, {
          usedFilms: body.usedFilms ?? [],
          usedActors: body.usedActors ?? [],
          usedDirectors: body.usedDirectors ?? [],
          usedDialogues: body.usedDialogues ?? [],
          usedConnections: body.usedConnections ?? [],
          usedTopics: body.usedTopics ?? [],
        });
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error: /api/quiz POST failed', {
      action: body.action,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Mode selection ───────────────────────────────────────────
function selectModes(): ModeDef[] {
  // Must include id 7, must include at least one of {4,5}, max 2 of {1,2,3}, exactly 5 total
  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = [...MODE_CATALOG].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 5);
    const ids = picked.map((m) => m.id);
    if (!ids.includes(7)) continue;
    if (!ids.includes(4) && !ids.includes(5)) continue;
    const count123 = ids.filter((id) => id === 1 || id === 2 || id === 3).length;
    if (count123 > 2) continue;
    // Shuffle order of the chosen 5
    return picked.sort(() => Math.random() - 0.5);
  }
  // Deterministic safe fallback satisfying all constraints
  const fallbackIds = [7, 4, 5, 6, 1];
  return fallbackIds.map((id) => MODE_CATALOG.find((m) => m.id === id)!);
}

// ─── Provider calls ───────────────────────────────────────────
class RateLimitError extends Error {}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new RateLimitError('Gemini key missing — skipping');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200, responseMimeType: 'application/json' },
    }),
  });
  if (res.status === 429) throw new RateLimitError('Gemini rate limited (429)');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text.trim();
}

async function callGroq(prompt: string): Promise<string> {
  if (!groqClient) throw new Error('Groq client not configured');
  const completion = await groqClient.chat.completions.create({
    model: groqModel,
    messages: [
      { role: 'system', content: 'You are a Bollywood quiz generator. Respond ONLY with valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });
  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty Groq response');
  return content;
}

async function generate(prompt: string): Promise<{ text: string; provider: ProviderName }> {
  try {
    const text = await callGemini(prompt);
    console.log('[quiz API] provider=gemini');
    return { text, provider: 'gemini' };
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.warn('[quiz API] Gemini rate limited → falling back to Groq.');
      const text = await callGroq(prompt);
      console.log('[quiz API] provider=groq (fallback)');
      return { text, provider: 'groq' };
    }
    throw err;
  }
}

// ─── Prompt building ──────────────────────────────────────────
const PERSONA = `You are Filmistan, a world-class Bollywood quiz master with encyclopedic knowledge of Hindi cinema from 1950 to 2024. You think like a film critic, a trade analyst, and a trivia champion combined. You only ask questions you are 100% certain about. You never invent facts.`;

const BANNED_DIALOGUES_ALWAYS = [
  'Kitne aadmi the',
  'Mogambo khush hua',
  'Bade bade deshon mein',
  'Rishte mein toh hum tumhare baap lagte hain',
];

function levelEra(level: number): string {
  switch (level) {
    case 1: return 'mostly 2000-2024';
    case 2: return '1990-2024';
    case 3: return '1975-2024';
    case 4: return '1960-2024';
    case 5: return 'any era including 1950s and 1960s';
    default: return '1990-2024';
  }
}

function difficultyName(d: number): string {
  return (['easy', 'medium', 'hard', 'expert', 'legendary'][d - 1] ?? 'medium');
}

function modeRules(modeId: number, level: number): string {
  switch (modeId) {
    case 1:
      return `MODE: Hear the Dialogue, Name the Film.
- Pick ONE famous Bollywood dialogue. Quote it in the question between double quotes.
- Question text: 'Which Bollywood film is this dialogue from?'
- correctAnswer maps to a FILM NAME.
- Wrong options: 3 OTHER real films from the same era.
- Never ask who said the dialogue. Never ask who acted in the film.
- BANNED DIALOGUES (do not use any of these, even partially): ${BANNED_DIALOGUES_ALWAYS.map((d) => `"${d}"`).join(', ')}.`;
    case 2:
      return `MODE: Decode the Actor.
- Choose ONE real Bollywood actor or actress.
- Provide EXACTLY 3 numbered clues inside the question text:
  Clue 1 — vague: era or genre they are known for.
  Clue 2 — medium: name a lesser-known film they appeared in.
  Clue 3 — specific: describe a famous role of theirs WITHOUT naming the film or the character.
- Question text MUST end with: 'Which Bollywood actor or actress am I describing?'
- correctAnswer maps to a PERSON NAME.
- Wrong options: 3 OTHER real actors from the same generation.
- Never mention the actor's name anywhere in the question or explanation before revealing it via the answer.`;
    case 3:
      return `MODE: Picture the Scene.
- Describe ONE specific scene from a real Bollywood film in 1-3 sentences.
- Focus only on setting, emotion, and action. NEVER name any actor, character, or star.
- Question text MUST end with: 'Which Bollywood film does this scene belong to?'
- correctAnswer maps to a FILM NAME.
- Wrong options: 3 OTHER films with similar themes or settings.
${level >= 3 ? '- HARDER LEVELS: Describe a scene from the opening or closing 10 minutes of the film.' : ''}`;
    case 4:
      return `MODE: When Was This Released.
- Pick ONE real Bollywood film. State the FULL official title.
- Question text MUST be exactly: 'In which year did <FILM TITLE> release in Indian cinemas?'
- correctAnswer maps to a 4-DIGIT YEAR.
- ALL four options MUST be 4-digit years.
- The three wrong years must each be within 3 years of the correct year.
- Never ask about actors, directors, or anything other than the year.`;
    case 5:
      return `MODE: Box Office Battle.
- Pick EXACTLY 2 real Bollywood films released in the SAME calendar year.
- Question text MUST be: 'Which film earned more at the Indian box office, "<FILM A>" or "<FILM B>"?'
- Options MUST be exactly:
  A) <FILM A>
  B) <FILM B>
  C) Both earned approximately the same
  D) Neither released in the same year
- correctAnswer MUST be A or B (never C, never D).
- Do not pit an obvious blockbuster against a clear flop.
${level >= 4 ? '- IMPORTANT: The two films must be within ₹20 crore of each other in Indian net box office.' : ''}`;
    case 6:
      return `MODE: Director's Fingerprint.
- Choose ONE of these two formats (pick randomly):
  Format A: Name a real director and ask which of these films they directed. correctAnswer = FILM NAME. Wrong options: 3 real films by other directors in similar genres.
  Format B: Describe 3 real films by the same director (titles only) and ask: 'Who directed these three films?' correctAnswer = DIRECTOR NAME. Wrong options: 3 OTHER real directors who work in similar genres.
- Never ask about actors or songs in this mode.`;
    case 7:
      return `MODE: The Connection.
- Pick EXACTLY 4 real Bollywood film titles. List them clearly in the question text.
- Question text MUST end with: 'What connects these four films?'
- correctAnswer maps to a SPECIFIC, VERIFIABLE, NON-OBVIOUS connection description.
- GOOD connections include: same cinematographer across all 4, all 4 featured a lead character named Raj, all 4 were remakes of South Indian films, all 4 had their release date postponed, all 4 won the same Filmfare category in different years, all 4 had the same music director.
- BAD connections to NEVER use: same actor, all romantic films, same decade, same director.
- Wrong options: 3 OTHER plausible-sounding connections that are FACTUALLY WRONG for these 4 films.
${level >= 5 ? '- LEVEL 5: only production-trivia connections allowed (e.g. same cinematographer, same music director, same editor, same DOP, postponed releases, same producer house).' : ''}`;
    default:
      return '';
  }
}

function buildBannedSection(banned: UsedTrackers): string {
  const items: string[] = [];
  const cap = (arr?: string[]) => (arr ?? []).slice(-MAX_BANNED_PER_KIND);

  const films = cap(banned.usedFilms);
  const actors = cap(banned.usedActors);
  const directors = cap(banned.usedDirectors);
  const dialogues = cap(banned.usedDialogues);
  const connections = cap(banned.usedConnections);
  const topics = cap(banned.usedTopics);

  films.forEach((f) => items.push(f));
  actors.forEach((a) => items.push(a));
  directors.forEach((d) => items.push(d));
  dialogues.forEach((d) => items.push(`"${d}"`));
  connections.forEach((c) => items.push(c));

  if (items.length === 0 && topics.length === 0) return '';

  let section = '';
  if (items.length > 0) {
    section += `\n\nBLOCKED FOR THIS SESSION — do not mention any of these anywhere in your question or options: [${items.join(' | ')}]`;
  }
  if (topics.length > 0) {
    section += `\n\nPREVIOUSLY ASKED TOPICS — do not repeat any of these question topics: [${topics.join(' | ')}]`;
  }
  return section;
}

function buildQuestionPrompt(
  modeId: number,
  difficulty: number,
  level: number,
  banned: UsedTrackers,
  retryHint?: string,
): string {
  const diffStr = difficultyName(difficulty);
  const era = levelEra(level);

  const antiRepetition = `ANTI-REPETITION RULES:
1. Never ask two questions with the same actor as the subject in one session.
2. Never ask two questions about the same film in one session.
3. Never use the same film in the options of two different questions.
4. Never use the format 'which film stars X and Y'.
5. Provide a short metadata.topic string summarising what this question asks so future questions can avoid duplicates.`;

  const responseShape = `Respond ONLY with valid JSON (no markdown, no commentary) in this exact shape:
{
  "question": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correctAnswer": "A",
  "explanation": "One clean line, max 15 words.",
  "metadata": {
    "films":     ["any real film titles referenced anywhere"],
    "actors":    ["any real actor names referenced anywhere"],
    "directors": ["any real director names referenced anywhere"],
    "dialogue":  "the exact dialogue quoted (Mode 1 only, else empty string)",
    "connection":"the connection text (Mode 7 only, else empty string)",
    "topic":     "≤15-word summary of what this question asks"
  }
}`;

  const universalRules = `STRICT UNIVERSAL RULES:
- Only use REAL, well-known Bollywood Hindi films, real actors, real directors, real years. Do not invent facts.
- Era for this question: ${era}.
- Difficulty for this question: ${diffStr}.
- Provide exactly 4 multiple choice options labelled "A) ...", "B) ...", "C) ...", "D) ...".
- The correctAnswer field must be a single letter: A, B, C, or D.
- The correct answer MUST be one of the four options exactly. Never generate a question where the answer is not one of the choices.
- Double-check before responding — is your correct answer present word-for-word in your options list? If not, fix it before responding.
- Keep the explanation under 15 words; one clean line, no fluff.`;

  const retrySection = retryHint ? `\n\nRETRY NOTE — your previous attempt failed validation: ${retryHint}\nFix the issue and try again.` : '';

  // BANNED LIST goes at the very end per spec
  const bannedSection = buildBannedSection(banned);

  return `${PERSONA}

${modeRules(modeId, level)}

${universalRules}

${antiRepetition}

${responseShape}${retrySection}${bannedSection}`;
}

// ─── JSON extraction & validation ─────────────────────────────
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return raw;
}

function baseValidate(q: unknown): q is QuestionResponse {
  if (!q || typeof q !== 'object') return false;
  const o = q as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return false;
  if (typeof o.explanation !== 'string') return false;
  if (typeof o.correctAnswer !== 'string') return false;
  if (!Array.isArray(o.options) || o.options.length !== 4) return false;
  const letters = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 4; i++) {
    const opt = o.options[i];
    if (typeof opt !== 'string') return false;
    if (!opt.trim().toUpperCase().startsWith(`${letters[i]})`)) return false;
  }
  const correct = (o.correctAnswer as string).trim().toUpperCase();
  if (!letters.includes(correct)) return false;
  const idx = letters.indexOf(correct);
  const optText = (o.options[idx] as string).replace(/^[A-D]\)\s*/i, '').trim();
  if (!optText) return false;
  return true;
}

function answerText(q: QuestionResponse): string {
  const idx = ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer.trim().toUpperCase());
  return (q.options[idx] ?? '').replace(/^[A-D]\)\s*/i, '').trim();
}

function modeValidator(modeId: number, q: QuestionResponse): { ok: boolean; reason?: string } {
  const ans = answerText(q);
  switch (modeId) {
    case 1: {
      // Mode 1: dialogue → film. Answer must be a film name (not a year, not "A./B./..."). Question should contain a quoted dialogue.
      if (/^\d{4}$/.test(ans)) return { ok: false, reason: 'Mode 1 answer is a year, expected a film name.' };
      if (!/[""].+[""]/.test(q.question) && !/".+"/.test(q.question)) {
        return { ok: false, reason: 'Mode 1 question must quote a dialogue.' };
      }
      for (const banned of BANNED_DIALOGUES_ALWAYS) {
        if (q.question.toLowerCase().includes(banned.toLowerCase())) {
          return { ok: false, reason: `Mode 1 used banned dialogue "${banned}".` };
        }
      }
      return { ok: true };
    }
    case 2: {
      if (/^\d{4}$/.test(ans)) return { ok: false, reason: 'Mode 2 answer must be a person name, not a year.' };
      if (ans.length < 3) return { ok: false, reason: 'Mode 2 answer too short to be a person.' };
      // The question should contain three numbered clues
      const hasClues = /clue\s*1/i.test(q.question) || /1[\).]/.test(q.question);
      if (!hasClues) return { ok: false, reason: 'Mode 2 must contain 3 numbered clues.' };
      return { ok: true };
    }
    case 3: {
      if (/^\d{4}$/.test(ans)) return { ok: false, reason: 'Mode 3 answer must be a film name, not a year.' };
      return { ok: true };
    }
    case 4: {
      // All 4 options must be 4-digit years
      const yearOnly = /^[A-D]\)\s*\d{4}\s*$/;
      if (!q.options.every((o) => yearOnly.test(o.trim()))) {
        return { ok: false, reason: 'Mode 4: all options must be exactly 4-digit years.' };
      }
      const years = q.options.map((o) => parseInt(o.replace(/^[A-D]\)\s*/, '').trim(), 10));
      const correctYear = parseInt(ans, 10);
      const gaps = years.filter((y) => y !== correctYear).map((y) => Math.abs(y - correctYear));
      if (gaps.some((g) => g > 3)) {
        return { ok: false, reason: 'Mode 4: wrong years must each be within 3 years of the correct year.' };
      }
      return { ok: true };
    }
    case 5: {
      const cText = q.options[2].replace(/^[A-D]\)\s*/, '').trim().toLowerCase();
      const dText = q.options[3].replace(/^[A-D]\)\s*/, '').trim().toLowerCase();
      if (!cText.startsWith('both earned approximately the same')) {
        return { ok: false, reason: 'Mode 5: Option C must be "Both earned approximately the same".' };
      }
      if (!dText.startsWith('neither released in the same year')) {
        return { ok: false, reason: 'Mode 5: Option D must be "Neither released in the same year".' };
      }
      const letter = q.correctAnswer.trim().toUpperCase();
      if (letter !== 'A' && letter !== 'B') {
        return { ok: false, reason: 'Mode 5: correctAnswer must be A or B.' };
      }
      return { ok: true };
    }
    case 6: {
      if (/^\d{4}$/.test(ans)) return { ok: false, reason: 'Mode 6 answer must be a director or film name, not a year.' };
      return { ok: true };
    }
    case 7: {
      if (ans.length < 10) return { ok: false, reason: 'Mode 7 connection answer too short — must be descriptive.' };
      // Question should contain four film titles — heuristic: multiple capitalised phrases or numbered list
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

// ─── Question generation with retry ───────────────────────────
async function getQuestionsForMode(
  modeId: number,
  difficulty: number,
  level: number,
  banned: UsedTrackers,
) {
  const maxAttempts = 3;
  let lastReason: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildQuestionPrompt(modeId, difficulty, level, banned, lastReason);
    try {
      const { text, provider } = await generate(prompt);
      const parsed = JSON.parse(extractJson(text));
      if (!baseValidate(parsed)) {
        lastReason = 'Base shape validation failed (options/correctAnswer mismatch).';
        console.warn(`[quiz API] base validation failed attempt ${attempt} via ${provider}`);
        continue;
      }
      const modeCheck = modeValidator(modeId, parsed);
      if (!modeCheck.ok) {
        lastReason = modeCheck.reason ?? 'Mode validation failed.';
        console.warn(`[quiz API] mode validation failed attempt ${attempt}: ${lastReason}`);
        continue;
      }
      console.log(`[quiz API] question OK on attempt ${attempt} via ${provider} (mode ${modeId}, level ${level}, diff ${difficulty})`);
      return NextResponse.json(parsed);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
      console.warn(`[quiz API] attempt ${attempt} threw:`, lastReason);
      // Only retry SyntaxErrors or validation issues; throw real provider errors out
      if (!(err instanceof SyntaxError)) {
        throw err;
      }
    }
  }

  console.error('[quiz API] question generation failed all attempts', { modeId, difficulty, level, lastReason });
  throw new Error(`Question generation failed after ${maxAttempts} attempts: ${lastReason}`);
}
