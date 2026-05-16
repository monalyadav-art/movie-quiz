// ─── Player progression (localStorage; will move to Supabase later) ─────────
export const PLAYER_KEY = 'moviequiz_player';

export type LevelNumber = 1 | 2 | 3 | 4 | 5;

export interface Player {
  name: string;
  level: LevelNumber;
  gamesCompleted: number;
  totalScoreAllTime: number;
  bestScore: number;
  createdAt: string;
  usedFilms: string[];
  usedActors: string[];
  usedDirectors: string[];
  usedDialogues: string[];
  usedConnections: string[];
  usedTopics: string[];
}

export const LEVEL_NAMES: Record<LevelNumber, string> = {
  1: 'Naya Hero',
  2: 'Supporting Actor',
  3: 'Parallel Cinema',
  4: 'Industry Insider',
  5: 'Filmistan Legend',
};

// Cumulative games-completed required to BE at a given level.
// L1 = 0+, L2 = 3+, L3 = 3+5=8, L4 = 8+7=15, L5 = 15+10=25
export const LEVEL_THRESHOLDS: Record<LevelNumber, number> = {
  1: 0,
  2: 3,
  3: 8,
  4: 15,
  5: 25,
};

export interface LevelConfig {
  level: LevelNumber;
  name: string;
  timer: number;
  difficultyRange: [number, number]; // both 1-5, mapped from Q1..Q5
  era: string;
  perks: string[];
  rules: string[];
  hintSkipsPerMode: number;
}

export const LEVEL_CONFIG: Record<LevelNumber, LevelConfig> = {
  1: {
    level: 1,
    name: LEVEL_NAMES[1],
    timer: 30,
    difficultyRange: [1, 2],
    era: 'mostly 2000-2024',
    perks: ['30s timer', 'Mostly 2000-2024 films', '1 skip per round'],
    rules: ['Difficulty: easy → medium', 'Skip 1 question per round (scores 0)'],
    hintSkipsPerMode: 1,
  },
  2: {
    level: 2,
    name: LEVEL_NAMES[2],
    timer: 25,
    difficultyRange: [1, 3],
    era: '1990-2024',
    perks: ['25s timer', '1990-2024 films', 'No hints'],
    rules: ['Difficulty: easy → hard', 'No skips'],
    hintSkipsPerMode: 0,
  },
  3: {
    level: 3,
    name: LEVEL_NAMES[3],
    timer: 20,
    difficultyRange: [2, 4],
    era: '1975-2024',
    perks: ['20s timer', '1975-2024 films'],
    rules: ['Difficulty: medium → expert'],
    hintSkipsPerMode: 0,
  },
  4: {
    level: 4,
    name: LEVEL_NAMES[4],
    timer: 15,
    difficultyRange: [3, 5],
    era: '1960-2024',
    perks: ['15s timer', '1960-2024 films', 'Tighter Box Office Battle'],
    rules: ['Difficulty: hard → legendary', 'Box Office Battle: films within ₹20 cr'],
    hintSkipsPerMode: 0,
  },
  5: {
    level: 5,
    name: LEVEL_NAMES[5],
    timer: 10,
    difficultyRange: [4, 5],
    era: 'any era (1950s-2024)',
    perks: ['10s timer', 'Any era incl. 1950s-60s', 'Production-trivia Connections'],
    rules: ['Difficulty: expert → legendary', 'The Connection: production trivia only'],
    hintSkipsPerMode: 0,
  },
};

export function levelForGamesCompleted(games: number): LevelNumber {
  if (games >= LEVEL_THRESHOLDS[5]) return 5;
  if (games >= LEVEL_THRESHOLDS[4]) return 4;
  if (games >= LEVEL_THRESHOLDS[3]) return 3;
  if (games >= LEVEL_THRESHOLDS[2]) return 2;
  return 1;
}

export function gamesUntilNextLevel(player: Pick<Player, 'level' | 'gamesCompleted'>): number | null {
  if (player.level >= 5) return null;
  const next = (player.level + 1) as LevelNumber;
  return Math.max(0, LEVEL_THRESHOLDS[next] - player.gamesCompleted);
}

export function levelProgressPct(player: Pick<Player, 'level' | 'gamesCompleted'>): number {
  if (player.level >= 5) return 100;
  const current = LEVEL_THRESHOLDS[player.level];
  const next = LEVEL_THRESHOLDS[(player.level + 1) as LevelNumber];
  const span = next - current;
  const done = Math.max(0, player.gamesCompleted - current);
  return Math.min(100, Math.round((done / span) * 100));
}

// ─── Storage ─────────────────────────────────────────────────────────────
export function loadPlayer(): Player | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Player>;
    if (!parsed || typeof parsed.name !== 'string') return null;
    // Backfill any missing arrays so the rest of the app is safe
    return {
      name: parsed.name,
      level: (parsed.level ?? 1) as LevelNumber,
      gamesCompleted: parsed.gamesCompleted ?? 0,
      totalScoreAllTime: parsed.totalScoreAllTime ?? 0,
      bestScore: parsed.bestScore ?? 0,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      usedFilms: parsed.usedFilms ?? [],
      usedActors: parsed.usedActors ?? [],
      usedDirectors: parsed.usedDirectors ?? [],
      usedDialogues: parsed.usedDialogues ?? [],
      usedConnections: parsed.usedConnections ?? [],
      usedTopics: parsed.usedTopics ?? [],
    };
  } catch {
    return null;
  }
}

export function savePlayer(player: Player): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  } catch {
    /* ignore */
  }
}

export function createPlayer(name: string): Player {
  return {
    name: name.trim(),
    level: 1,
    gamesCompleted: 0,
    totalScoreAllTime: 0,
    bestScore: 0,
    createdAt: new Date().toISOString(),
    usedFilms: [],
    usedActors: [],
    usedDirectors: [],
    usedDialogues: [],
    usedConnections: [],
    usedTopics: [],
  };
}

// Append items to a player's used trackers (dedup, normalized)
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}
function mergeUnique(list: string[], incoming: string[]): string[] {
  const set = new Set(list.map((s) => s.toLowerCase()));
  const result = [...list];
  for (const item of incoming) {
    const norm = normalize(item);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (!set.has(key)) {
      set.add(key);
      result.push(norm);
    }
  }
  return result;
}

export interface SessionAdds {
  films?: string[];
  actors?: string[];
  directors?: string[];
  dialogues?: string[];
  connections?: string[];
  topics?: string[];
}

export function mergeSessionAdds(player: Player, adds: SessionAdds): Player {
  return {
    ...player,
    usedFilms: mergeUnique(player.usedFilms, adds.films ?? []),
    usedActors: mergeUnique(player.usedActors, adds.actors ?? []),
    usedDirectors: mergeUnique(player.usedDirectors, adds.directors ?? []),
    usedDialogues: mergeUnique(player.usedDialogues, adds.dialogues ?? []),
    usedConnections: mergeUnique(player.usedConnections, adds.connections ?? []),
    usedTopics: mergeUnique(player.usedTopics, adds.topics ?? []),
  };
}

export interface GameCompletedResult {
  newPlayer: Player;
  leveledUp: boolean;
  oldLevel: LevelNumber;
  newLevel: LevelNumber;
}

export function recordGameCompleted(player: Player, finalScore: number): GameCompletedResult {
  const oldLevel = player.level;
  const gamesCompleted = player.gamesCompleted + 1;
  const newLevel = levelForGamesCompleted(gamesCompleted);
  const newPlayer: Player = {
    ...player,
    gamesCompleted,
    totalScoreAllTime: player.totalScoreAllTime + finalScore,
    bestScore: Math.max(player.bestScore, finalScore),
    level: newLevel,
  };
  return { newPlayer, leveledUp: newLevel > oldLevel, oldLevel, newLevel };
}

// Map a question index (0..4) within the current player's difficulty range
// to a difficulty integer (1..5) used by the API.
export function difficultyForQuestion(level: LevelNumber, qIndex: number): number {
  const [min, max] = LEVEL_CONFIG[level].difficultyRange;
  const t = qIndex / 4; // 0..1
  return Math.round(min + t * (max - min));
}
