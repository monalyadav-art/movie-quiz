'use client';

import { useState, useEffect } from 'react';
import Game from './components/Game';
import NameEntry from './components/NameEntry';
import {
  Player,
  SessionAdds,
  GameCompletedResult,
  LEVEL_NAMES,
  LevelNumber,
  loadPlayer,
  savePlayer,
  createPlayer,
  mergeSessionAdds,
  recordGameCompleted,
  gamesUntilNextLevel,
  levelProgressPct,
} from './utils/player';

const GAME_STATE_KEY = 'movieQuizGameState';

interface SavedGame {
  phase: 'mode-intro' | 'question';
  modes: { id: number; name: string; explanation: string }[];
  currentModeIndex: number;
  currentQuestionIndex: number;
  totalScore: number;
  modeScore: number;
  streak: number;
  correctCount: number;
  maxSpeedCount: number;
  sessionAdds: SessionAdds;
  hintsUsedThisMode: number;
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [resumeState, setResumeState] = useState<SavedGame | null>(null);
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPlayer(loadPlayer());
    try {
      const raw = localStorage.getItem(GAME_STATE_KEY);
      if (raw) {
        const parsed: SavedGame = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.modes) && parsed.modes.length === 5) {
          setSavedGame(parsed);
        }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-marquee text-[var(--gold)] tracking-widest text-xl">Loading…</div>
      </div>
    );
  }

  // ─── Name entry (first time) ─────────────────────────────────
  if (!player) {
    return (
      <NameEntry
        onSubmit={(name) => {
          const fresh = createPlayer(name);
          savePlayer(fresh);
          setPlayer(fresh);
        }}
      />
    );
  }

  // ─── Game in progress / starting ─────────────────────────────
  const startFresh = () => {
    try { localStorage.removeItem(GAME_STATE_KEY); } catch { /* ignore */ }
    setSavedGame(null);
    setResumeState(null);
    setGameStarted(true);
  };

  const continueGame = () => {
    if (!savedGame) return;
    setResumeState(savedGame);
    setGameStarted(true);
  };

  const handleCommit = (sessionAdds: SessionAdds, finalScore: number): GameCompletedResult => {
    const withUsed = mergeSessionAdds(player, sessionAdds);
    const result = recordGameCompleted(withUsed, finalScore);
    savePlayer(result.newPlayer);
    setPlayer(result.newPlayer);
    return result;
  };

  const handleExit = () => {
    try { localStorage.removeItem(GAME_STATE_KEY); } catch { /* ignore */ }
    setSavedGame(null);
    setResumeState(null);
    setGameStarted(false);
  };

  if (gameStarted) {
    return (
      <Game
        player={player}
        onCommit={handleCommit}
        onExit={handleExit}
        resumeState={resumeState}
      />
    );
  }

  // ─── Homepage ────────────────────────────────────────────────
  return <HomeScreen player={player} savedGame={savedGame} onStartFresh={startFresh} onContinue={continueGame} />;
}

// ─── Home screen ───────────────────────────────────────────────
function HomeScreen({
  player,
  savedGame,
  onStartFresh,
  onContinue,
}: {
  player: Player;
  savedGame: SavedGame | null;
  onStartFresh: () => void;
  onContinue: () => void;
}) {
  const isMax = player.level >= 5;
  const remaining = gamesUntilNextLevel(player);
  const pct = levelProgressPct(player);
  const nextLevel = isMax ? null : (player.level + 1) as LevelNumber;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="spotlight" />

      <div className="ticket mb-6 animate-fade-in-up">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
        Welcome back, {player.name}
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
      </div>

      <div className="poster-frame max-w-3xl w-full px-8 py-10 md:px-12 md:py-12 text-center animate-fade-in-scale">
        <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">A Filmistan Production</p>
        <div className="marquee-divider my-3 max-w-xs mx-auto" />
        <h1 className="title-poster text-6xl md:text-8xl leading-[0.95]">
          Movie<span className="block">Quiz</span>
        </h1>
        <div className="marquee-divider my-3 max-w-xs mx-auto" />

        {/* Level + progress */}
        <div className="mt-2">
          <p className="font-marquee tracking-[0.3em] text-[var(--maroon-deep)] text-base">
            Level {player.level} — {LEVEL_NAMES[player.level]}
          </p>
          <div className="mt-3 max-w-md mx-auto">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="font-marquee text-xs tracking-widest text-[var(--maroon)] mt-2">
              {isMax
                ? 'Maximum Level — Filmistan Legend'
                : `${remaining} game${remaining === 1 ? '' : 's'} until Level ${nextLevel} — ${LEVEL_NAMES[nextLevel!]}`}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="player-stats max-w-md mx-auto">
          <div className="player-stat">
            <div className="stat-label">Best Score</div>
            <div className="stat-value">{player.bestScore.toLocaleString()}</div>
          </div>
          <div className="player-stat">
            <div className="stat-label">Games Played</div>
            <div className="stat-value">{player.gamesCompleted}</div>
          </div>
          <div className="player-stat">
            <div className="stat-label">All-Time</div>
            <div className="stat-value">{player.totalScoreAllTime.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <button onClick={onStartFresh} className="bulb-btn mt-10 animate-fade-in-up">
        ▶ Play Now
      </button>

      <div className="mt-6 flex flex-wrap gap-3 justify-center animate-fade-in-up">
        <span className="ticket text-xs">5 Modes</span>
        <span className="ticket text-xs">25 Questions</span>
        <span className="ticket text-xs">Timer scales with level</span>
      </div>

      <div className="absolute top-16 left-10 text-3xl text-[var(--gold)] twinkle">✦</div>
      <div className="absolute bottom-16 right-12 text-2xl text-[var(--neon-teal)] twinkle" style={{ animationDelay: '1s' }}>✦</div>
      <div className="absolute top-1/3 right-8 text-xl text-[var(--neon-pink)] twinkle" style={{ animationDelay: '2s' }}>✦</div>

      {savedGame && (
        <div className="pause-overlay">
          <div className="poster-frame px-8 py-10 max-w-md w-full text-center animate-fade-in-scale">
            <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Unfinished Reel</p>
            <div className="marquee-divider my-3 max-w-[8rem] mx-auto" />
            <h2 className="title-poster text-4xl md:text-5xl">Resume?</h2>
            <p className="font-display italic text-[var(--maroon-deep)] mt-2">
              You left mid-game on Mode {savedGame.currentModeIndex + 1}, Q {savedGame.currentQuestionIndex + 1}.
              Score so far: <strong>{savedGame.totalScore.toLocaleString()}</strong>.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              <button onClick={onContinue} className="bulb-btn">▶ Continue Game</button>
              <button onClick={onStartFresh} className="outline-btn" style={{ color: 'var(--maroon-deep)', borderColor: 'var(--maroon-deep)' }}>
                ← Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

