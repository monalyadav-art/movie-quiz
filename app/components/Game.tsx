'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Confetti from './Confetti';
import LevelUp from './LevelUp';
import { soundEffects } from '../utils/sounds';
import {
  Player,
  LEVEL_CONFIG,
  difficultyForQuestion,
  SessionAdds,
  GameCompletedResult,
  LevelNumber,
} from '../utils/player';

// ─── Types ──────────────────────────────────────────────────────
interface Mode {
  id: number;
  name: string;
  explanation: string;
}

interface QuestionMetadata {
  films?: string[];
  actors?: string[];
  directors?: string[];
  dialogue?: string;
  connection?: string;
  topic?: string;
}

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  metadata?: QuestionMetadata;
}

type GamePhase =
  | 'loading'
  | 'intro'
  | 'mode-intro'
  | 'question'
  | 'mode-score'
  | 'final-score'
  | 'level-up';

interface SavedGame {
  phase: 'mode-intro' | 'question';
  modes: Mode[];
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

interface GameProps {
  player: Player;
  onCommit: (sessionAdds: SessionAdds, finalScore: number) => GameCompletedResult;
  onExit: () => void;
  resumeState?: SavedGame | null;
}

const STORAGE_KEY = 'movieQuizGameState';
const BASE_POINTS = [100, 200, 300, 400, 500];

// ─── Component ──────────────────────────────────────────────────
export default function Game({ player, onCommit, onExit, resumeState }: GameProps) {
  const cfg = LEVEL_CONFIG[player.level];

  const [modes, setModes] = useState<Mode[]>(resumeState?.modes ?? []);
  const [currentModeIndex, setCurrentModeIndex] = useState(resumeState?.currentModeIndex ?? 0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(resumeState?.currentQuestionIndex ?? 0);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [timeLeft, setTimeLeft] = useState(cfg.timer);
  const [gamePhase, setGamePhase] = useState<GamePhase>(resumeState ? 'mode-intro' : 'loading');
  const [totalScore, setTotalScore] = useState(resumeState?.totalScore ?? 0);
  const [modeScore, setModeScore] = useState(resumeState?.modeScore ?? 0);
  const [streak, setStreak] = useState(resumeState?.streak ?? 0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [sessionAdds, setSessionAdds] = useState<SessionAdds>(resumeState?.sessionAdds ?? {});
  const [correctCount, setCorrectCount] = useState(resumeState?.correctCount ?? 0);
  const [maxSpeedCount, setMaxSpeedCount] = useState(resumeState?.maxSpeedCount ?? 0);
  const [hintsUsedThisMode, setHintsUsedThisMode] = useState(resumeState?.hintsUsedThisMode ?? 0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<GameCompletedResult | null>(null);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackModes: Mode[] = [
    { id: 7, name: 'The Connection', explanation: 'Four films, one thread. What links them?' },
    { id: 4, name: 'When Was This Released', explanation: 'Test your Bollywood calendar — pinpoint the release year.' },
    { id: 5, name: 'Box Office Battle', explanation: 'Two films, one box-office crown — who took the bigger bite?' },
    { id: 6, name: "Director's Fingerprint", explanation: 'Spot the auteur behind the frame.' },
    { id: 1, name: 'Hear the Dialogue, Name the Film', explanation: 'A famous dialogue echoes — name the film it belongs to.' },
  ];

  // ─── Persistence ─────────────────────────────────────────────
  const persist = useCallback(
    (overrides: Partial<SavedGame> = {}) => {
      try {
        const snapshot: SavedGame = {
          phase: 'mode-intro',
          modes,
          currentModeIndex,
          currentQuestionIndex,
          totalScore,
          modeScore,
          streak,
          correctCount,
          maxSpeedCount,
          sessionAdds,
          hintsUsedThisMode,
          ...overrides,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch { /* ignore */ }
    },
    [modes, currentModeIndex, currentQuestionIndex, totalScore, modeScore, streak, correctCount, maxSpeedCount, sessionAdds, hintsUsedThisMode],
  );

  const clearPersisted = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ─── Bootstrap ───────────────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (resumeState) {
      setGamePhase('mode-intro');
      return;
    }
    fetchModes();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fetchModes = async () => {
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getModes' }),
      });
      if (!response.ok) throw new Error(`Mode fetch failed: ${response.status}`);
      const data = await response.json();
      const fetched: Mode[] = Array.isArray(data?.modes) && data.modes.length === 5 ? data.modes : fallbackModes;
      setModes(fetched);
      setGamePhase('intro');
    } catch (error) {
      console.error('fetchModes failed:', error);
      setModes(fallbackModes);
      setGamePhase('intro');
    }
  };

  // Merge player's permanent + session adds for the API call
  const buildBannedPayload = () => {
    const merge = (a: string[], b: string[] = []) => Array.from(new Set([...a, ...b]));
    return {
      usedFilms: merge(player.usedFilms, sessionAdds.films),
      usedActors: merge(player.usedActors, sessionAdds.actors),
      usedDirectors: merge(player.usedDirectors, sessionAdds.directors),
      usedDialogues: merge(player.usedDialogues, sessionAdds.dialogues),
      usedConnections: merge(player.usedConnections, sessionAdds.connections),
      usedTopics: merge(player.usedTopics, sessionAdds.topics),
    };
  };

  const fetchQuestion = async (mode: Mode, questionIdx: number) => {
    setFetchError(null);
    const difficulty = difficultyForQuestion(player.level, questionIdx);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getQuestions',
          modeId: mode.id,
          difficulty,
          level: player.level,
          ...buildBannedPayload(),
        }),
      });
      if (!response.ok) throw new Error(`Question fetch failed: ${response.status}`);
      const question: Question = await response.json();
      setCurrentQuestion(question);
      setTimeLeft(cfg.timer);
      setStartTime(Date.now());
      setSelectedAnswer(null);
      setShowAnswer(false);
      setTimeUp(false);
      setSkipped(false);
      setGamePhase('question');
    } catch (error) {
      console.error('fetchQuestion failed:', error);
      setFetchError('Could not load the next question. Please try again.');
    }
  };

  // ─── Mode-intro countdown ────────────────────────────────────
  const startCountdown = useCallback(() => setCountdown(3), []);

  useEffect(() => {
    if (gamePhase !== 'mode-intro' || countdown === null || paused) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (currentQuestionIndex === 0) setModeScore(0);
      fetchQuestion(modes[currentModeIndex], currentQuestionIndex);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, gamePhase, paused]);

  // ─── Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'question' || showAnswer || paused) return;
    if (timeLeft <= 0) {
      setTimeUp(true);
      setShowAnswer(true);
      setStreak(0);
      soundEffects.playWrong();
      return;
    }
    const t = setTimeout(() => {
      const next = timeLeft - 1;
      setTimeLeft(next);
      if (next === Math.min(10, Math.floor(cfg.timer / 3))) soundEffects.playTimerWarning();
    }, 1000);
    return () => clearTimeout(t);
  }, [timeLeft, gamePhase, showAnswer, paused, cfg.timer]);

  // ─── Auto-advance after feedback ─────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'question' || !showAnswer) return;
    const isCorrect = !timeUp && !skipped && selectedAnswer === currentQuestion?.correctAnswer;
    const delay = isCorrect ? 1500 : 2000;
    advanceTimerRef.current = setTimeout(() => goNextQuestion(), delay);
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnswer, gamePhase]);

  // ─── Pause on tab hidden ─────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (gamePhase === 'question' && !showAnswer) {
          setPaused(true);
          persist();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [gamePhase, showAnswer, persist]);

  // ─── Commit on entering final-score ──────────────────────────
  useEffect(() => {
    if (gamePhase !== 'final-score' || commitResult) return;
    const result = onCommit(sessionAdds, totalScore);
    setCommitResult(result);
    clearPersisted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  // ─── Handlers ────────────────────────────────────────────────
  const beginGame = () => {
    setCurrentModeIndex(0);
    setCurrentQuestionIndex(0);
    setTotalScore(0);
    setModeScore(0);
    setStreak(0);
    setSessionAdds({});
    setCorrectCount(0);
    setMaxSpeedCount(0);
    setHintsUsedThisMode(0);
    setGamePhase('mode-intro');
  };

  const handleAnswerSelect = (answer: string) => {
    if (showAnswer) return;
    setSelectedAnswer(answer);
    setShowAnswer(true);

    const timeTaken = startTime ? (Date.now() - startTime) / 1000 : cfg.timer;
    const isCorrect = answer === currentQuestion?.correctAnswer;

    if (isCorrect) soundEffects.playCorrect();
    else soundEffects.playWrong();

    let points = 0;
    if (isCorrect) {
      points = BASE_POINTS[currentQuestionIndex];
      if (timeTaken <= 10) {
        points += points * 0.5;
        setMaxSpeedCount((c) => c + 1);
      } else if (timeTaken <= 20) {
        points += points * 0.25;
      }
      const newStreak = streak + 1;
      setStreak(newStreak);
      setCorrectCount((c) => c + 1);
      if (newStreak === 3) points += 100;
      else if (newStreak === 5) points += 250;
      else if (newStreak === 10) points += 500;
    } else {
      setStreak(0);
    }

    setModeScore((s) => s + Math.round(points));
  };

  const handleSkip = () => {
    if (showAnswer || hintsUsedThisMode >= cfg.hintSkipsPerMode) return;
    setHintsUsedThisMode((n) => n + 1);
    setSkipped(true);
    setShowAnswer(true);
    setStreak(0);
    soundEffects.playWrong();
  };

  const goNextQuestion = () => {
    // Merge metadata of the answered question into sessionAdds
    if (currentQuestion) {
      const md = currentQuestion.metadata ?? {};
      const optionFilms = currentQuestion.options
        .map((o) => o.replace(/^[A-D]\)\s*/, '').trim())
        .filter(Boolean);
      const filmsFromMeta = md.films ?? [];
      const films = Array.from(new Set([...filmsFromMeta, ...optionFilms]));
      setSessionAdds((prev) => ({
        films: Array.from(new Set([...(prev.films ?? []), ...films])),
        actors: Array.from(new Set([...(prev.actors ?? []), ...(md.actors ?? [])])),
        directors: Array.from(new Set([...(prev.directors ?? []), ...(md.directors ?? [])])),
        dialogues: Array.from(new Set([
          ...(prev.dialogues ?? []),
          ...(md.dialogue ? [md.dialogue] : []),
        ])),
        connections: Array.from(new Set([
          ...(prev.connections ?? []),
          ...(md.connection ? [md.connection] : []),
        ])),
        topics: Array.from(new Set([
          ...(prev.topics ?? []),
          ...(md.topic ? [md.topic] : []),
        ])),
      }));
    }

    setSelectedAnswer(null);
    setShowAnswer(false);
    setTimeUp(false);
    setSkipped(false);

    if (currentQuestionIndex < 4) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      persist({ phase: 'question', currentQuestionIndex: nextIdx });
      fetchQuestion(modes[currentModeIndex], nextIdx);
    } else {
      const nextTotal = totalScore + modeScore;
      setTotalScore(nextTotal);
      setGamePhase('mode-score');
      persist({ phase: 'mode-intro', totalScore: nextTotal, modeScore: 0, currentQuestionIndex: 0 });
    }
  };

  const goNextMode = () => {
    if (currentModeIndex < 4) {
      soundEffects.playModeComplete();
      const nextMode = currentModeIndex + 1;
      setCurrentModeIndex(nextMode);
      setCurrentQuestionIndex(0);
      setModeScore(0);
      setHintsUsedThisMode(0);
      setGamePhase('mode-intro');
      persist({ phase: 'mode-intro', currentModeIndex: nextMode, currentQuestionIndex: 0, modeScore: 0, hintsUsedThisMode: 0 });
    } else {
      soundEffects.playGameComplete();
      setGamePhase('final-score');
    }
  };

  const shareOnWhatsApp = () => {
    const verdict = getVerdict(totalScore);
    const appUrl = window.location.origin;
    const message = `🎬 Movie Quiz Score: ${totalScore.toLocaleString()} points! ${verdict} 🏆\n\nCome check your Bollywood knowledge at ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const resumeFromPause = () => {
    setPaused(false);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setTimeUp(false);
    setSkipped(false);
    fetchQuestion(modes[currentModeIndex], currentQuestionIndex);
  };

  const abandonFromPause = () => {
    clearPersisted();
    setPaused(false);
    onExit();
  };

  const handleFinalContinue = () => {
    if (commitResult?.leveledUp) {
      setGamePhase('level-up');
    } else {
      onExit();
    }
  };

  const handleLevelUpContinue = () => onExit();

  const getVerdict = (score: number) => {
    const perfectIndustry = correctCount === 25 && maxSpeedCount === 25;
    if (perfectIndustry) return 'INDUSTRY ka BAAP!';
    if (score <= 2000) return 'Bewakoof!';
    if (score <= 4000) return 'Theek hai yaar';
    if (score <= 6000) return 'Ek dum mast!';
    if (score < 7500) return 'Almost Legend!';
    if (score === 7500) return 'Legend ho tum!';
    return 'INDUSTRY ka BAAP!';
  };

  // ─── Render helpers ──────────────────────────────────────────
  const StatusBar = () => {
    if (gamePhase === 'loading' || gamePhase === 'intro' || gamePhase === 'final-score' || gamePhase === 'level-up') return null;
    const mode = modes[currentModeIndex];
    if (!mode) return null;
    const liveTotal = totalScore + modeScore;
    return (
      <div className="status-bar">
        <div className="status-left">
          <span className="font-marquee tracking-[0.15em] text-[var(--gold)] text-sm md:text-base">
            Mode {currentModeIndex + 1}: {mode.name}
          </span>
          <span className="status-divider" />
          <span className="font-marquee tracking-[0.15em] text-[var(--paper-warm)]/80 text-xs md:text-sm">
            Q {Math.min(currentQuestionIndex + 1, 5)} / 5
          </span>
          <span className="status-divider hidden sm:inline" />
          <span className="font-marquee tracking-[0.15em] text-[var(--paper-warm)]/80 text-xs md:text-sm hidden sm:inline">
            Round {currentModeIndex + 1} / 5
          </span>
        </div>
        <div className="status-right">
          {streak >= 2 && <span className="status-chip">🔥 ×{streak}</span>}
          <span className="status-chip status-score">★ {liveTotal.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  // ─── Phase: loading ──────────────────────────────────────────
  if (gamePhase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        <div className="spotlight" />
        <div className="text-center animate-fade-in-scale">
          <div className="relative w-32 h-32 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)]/30" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--neon-teal)] animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-dashed border-[var(--gold)]/60 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
          </div>
          <p className="font-marquee text-2xl tracking-widest text-[var(--gold)]">Cuing the Reel…</p>
          <p className="font-display italic text-[var(--paper-warm)]/80 mt-2">Loading your Bollywood adventure</p>
        </div>
      </div>
    );
  }

  // ─── Phase: intro ────────────────────────────────────────────
  if (gamePhase === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 py-10 relative">
        <div className="spotlight" />
        <div className="ticket mb-4 animate-fade-in-up">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
          {cfg.name} • {cfg.timer}s per Q
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
        </div>

        <h2 className="title-poster text-5xl md:text-6xl text-center leading-[1] animate-fade-in-scale">
          25 Questions.<span className="block">One Crown.</span>
        </h2>
        <p className="font-display italic text-[var(--paper-warm)]/90 text-center max-w-xl mt-3 mb-8">
          5 randomly chosen Bollywood modes • 5 questions per mode, getting harder each time.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl w-full animate-fade-in-up">
          <div className="poster-frame px-5 py-6">
            <p className="font-marquee text-sm tracking-[0.3em] text-[var(--maroon)] text-center">Base Points</p>
            <div className="marquee-divider my-3 max-w-[6rem] mx-auto" />
            <p className="font-display italic text-sm text-[var(--maroon-deep)]/90 text-center mb-4">
              Each question rewards more as the heat climbs.
            </p>
            <div className="flex items-end justify-between gap-2 h-28">
              {BASE_POINTS.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-gradient-to-t from-[var(--marigold-hot)] to-[var(--gold)] animate-bar" style={{ height: `${(p / 500) * 100}%`, animationDelay: `${i * 0.12}s` }} />
                  <span className="font-marquee text-[0.7rem] text-[var(--maroon-deep)]">Q{i + 1}</span>
                  <span className="font-marquee text-[0.7rem] text-[var(--maroon-deep)]/70">{p}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="poster-frame px-5 py-6">
            <p className="font-marquee text-sm tracking-[0.3em] text-[var(--maroon)] text-center">Speed Bonus</p>
            <div className="marquee-divider my-3 max-w-[6rem] mx-auto" />
            <p className="font-display italic text-sm text-[var(--maroon-deep)]/90 text-center mb-4">
              The quicker you answer, the bigger the boost.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-full">
                <span className="font-marquee tracking-widest text-sm">≤ 10s</span>
                <span className="font-marquee tracking-widest text-[var(--neon-teal)] text-sm">+50%</span>
              </div>
              <div className="flex items-center justify-between bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-full">
                <span className="font-marquee tracking-widest text-sm">≤ 20s</span>
                <span className="font-marquee tracking-widest text-[var(--gold)] text-sm">+25%</span>
              </div>
              <div className="flex items-center justify-between bg-[var(--maroon-deep)] text-[var(--paper)]/80 px-3 py-2 rounded-full opacity-80">
                <span className="font-marquee tracking-widest text-sm">≤ 30s</span>
                <span className="font-marquee tracking-widest text-[var(--paper-warm)]/70 text-sm">+0%</span>
              </div>
            </div>
          </div>

          <div className="poster-frame px-5 py-6">
            <p className="font-marquee text-sm tracking-[0.3em] text-[var(--maroon)] text-center">Streak Bonus</p>
            <div className="marquee-divider my-3 max-w-[6rem] mx-auto" />
            <p className="font-display italic text-sm text-[var(--maroon-deep)]/90 text-center mb-4">
              String correct answers together for filmi bonuses.
            </p>
            <div className="flex flex-col gap-2">
              {[{ n: 3, b: '+100' }, { n: 5, b: '+250' }, { n: 10, b: '+500' }].map((row) => (
                <div key={row.n} className="flex items-center justify-between bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-full">
                  <span className="font-marquee tracking-widest text-sm">{row.n} in a row</span>
                  <span className="font-marquee tracking-widest text-[var(--gold)] text-sm">{row.b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={beginGame} className="bulb-btn mt-10 animate-fade-in-up">
          ▶ I&apos;m Ready, Let&apos;s Play!
        </button>
      </div>
    );
  }

  // ─── Phase: mode-intro ───────────────────────────────────────
  if (gamePhase === 'mode-intro') {
    const mode = modes[currentModeIndex];
    if (!mode) return null;
    return (
      <div className="min-h-screen flex flex-col px-4 py-6 relative">
        <StatusBar />
        <div className="spotlight" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-2xl w-full animate-fade-in-up">
            <div className="ticket mb-4">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
              Mode {currentModeIndex + 1} of 5
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
            </div>

            <div className="poster-frame px-6 py-8 md:px-10 md:py-10">
              <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Next Up</p>
              <div className="marquee-divider my-3 max-w-[10rem] mx-auto" />
              <h2 className="title-poster text-3xl md:text-5xl leading-tight">{mode.name}</h2>
              <div className="marquee-divider my-3 max-w-[10rem] mx-auto" />
              <p className="font-display italic text-base md:text-lg text-[var(--maroon-deep)] mb-4">
                {mode.explanation}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-lg">
                  <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Base</p>
                  <p className="font-marquee text-sm">Q1:100 → Q5:500</p>
                </div>
                <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-lg">
                  <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Speed</p>
                  <p className="font-marquee text-sm">≤10s +50% • ≤20s +25%</p>
                </div>
                <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-2 rounded-lg">
                  <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Streak</p>
                  <p className="font-marquee text-sm">3:+100 • 5:+250 • 10:+500</p>
                </div>
              </div>

              <p className="font-marquee text-xs tracking-[0.3em] text-[var(--maroon)] mt-5">
                Timer: <span className="text-[var(--marigold-hot)]">{cfg.timer}s</span> •
                Current Total: <span className="text-[var(--marigold-hot)]">{totalScore.toLocaleString()}</span>
              </p>
            </div>

            {countdown === null ? (
              <button onClick={startCountdown} className="bulb-btn mt-8">▶ Begin Round</button>
            ) : (
              <div className="mt-8 flex flex-col items-center">
                <p className="font-marquee tracking-[0.3em] text-[var(--paper-warm)]/80 text-sm">Starting in…</p>
                <div className="countdown-num">{countdown === 0 ? 'GO!' : countdown}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: question ─────────────────────────────────────────
  if (gamePhase === 'question') {
    const timerPct = Math.max(0, Math.min(100, (timeLeft / cfg.timer) * 100));
    const worth = BASE_POINTS[currentQuestionIndex];
    const canSkip = cfg.hintSkipsPerMode > 0 && hintsUsedThisMode < cfg.hintSkipsPerMode && !showAnswer;
    const warningThreshold = Math.min(10, Math.floor(cfg.timer / 3));

    if (fetchError && !currentQuestion) {
      return (
        <div className="min-h-screen flex flex-col px-4 py-6 relative">
          <StatusBar />
          <div className="flex-1 flex items-center justify-center">
            <div className="poster-frame px-8 py-10 text-center max-w-md">
              <p className="font-marquee tracking-widest text-[var(--maroon)] text-lg">Something glitched</p>
              <p className="font-display italic text-[var(--maroon-deep)] mt-2">{fetchError}</p>
              <button onClick={() => fetchQuestion(modes[currentModeIndex], currentQuestionIndex)} className="bulb-btn mt-6">↻ Try Again</button>
            </div>
          </div>
        </div>
      );
    }

    if (!currentQuestion) {
      return (
        <div className="min-h-screen flex flex-col px-4 py-6 relative">
          <StatusBar />
          <div className="flex-1 flex items-center justify-center">
            <div className="font-marquee text-[var(--gold)] tracking-widest text-xl animate-fade-in-up">Loading question…</div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col px-4 py-6 relative">
        <StatusBar />

        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-2xl w-full animate-fade-in-scale">
            <div className="flex justify-between items-center mb-4 gap-3">
              <span className="ticket text-xs">⭐ This question is worth {worth} points</span>
              <div className={`timer-ring ${timeLeft <= warningThreshold ? 'is-warning' : ''}`} style={{ ['--p' as string]: `${timerPct}%` }}>
                <span>{timeLeft}</span>
              </div>
            </div>

            <div className="poster-frame px-6 py-8 md:px-10 md:py-10 mb-5">
              <p className="font-marquee text-xs tracking-[0.35em] text-[var(--maroon)] text-center">
                Question {currentQuestionIndex + 1}
              </p>
              <div className="marquee-divider my-3 max-w-[8rem] mx-auto" />
              <h3 className="font-display italic text-xl md:text-2xl text-[var(--maroon-deep)] text-center leading-snug whitespace-pre-line">
                {currentQuestion.question}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {currentQuestion.options.map((option, index) => {
                const letter = option.charAt(0);
                const text = option.replace(/^[A-D]\)\s*/, '');
                const isCorrectOpt = showAnswer && letter === currentQuestion.correctAnswer;
                const isWrongOpt = showAnswer && selectedAnswer === letter && letter !== currentQuestion.correctAnswer;
                const isDim = showAnswer && !isCorrectOpt && !isWrongOpt;
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(letter)}
                    disabled={showAnswer}
                    className={`kbc-pill ${isCorrectOpt ? 'is-correct' : ''} ${isWrongOpt ? 'is-wrong' : ''} ${isDim ? 'is-dim' : ''}`}
                  >
                    <span className="pill-letter">{letter}</span>
                    <span className="flex-1">{text}</span>
                  </button>
                );
              })}
            </div>

            {/* Skip (L1 only) */}
            {canSkip && (
              <div className="flex justify-end mb-3">
                <button onClick={handleSkip} className="skip-btn" disabled={!canSkip}>
                  ↷ Skip This Question ({cfg.hintSkipsPerMode - hintsUsedThisMode} left)
                </button>
              </div>
            )}

            {/* Crisp feedback */}
            {showAnswer && (
              <div className="feedback-row animate-fade-in-up">
                {skipped ? (
                  <p className="feedback-bad">
                    ↷ Skipped. Correct answer: {currentQuestion.options.find((o) => o.startsWith(currentQuestion.correctAnswer))?.replace(/^[A-D]\)\s*/, '')}
                  </p>
                ) : timeUp ? (
                  <p className="feedback-bad">
                    ✗ Time Up! Correct answer: {currentQuestion.options.find((o) => o.startsWith(currentQuestion.correctAnswer))?.replace(/^[A-D]\)\s*/, '')}
                  </p>
                ) : selectedAnswer === currentQuestion.correctAnswer ? (
                  <p className="feedback-good">✓ Correct! {currentQuestion.explanation}</p>
                ) : (
                  <>
                    <p className="feedback-bad">
                      ✗ Wrong! Correct answer: {currentQuestion.options.find((o) => o.startsWith(currentQuestion.correctAnswer))?.replace(/^[A-D]\)\s*/, '')}
                    </p>
                    <p className="feedback-bad text-sm opacity-90">{currentQuestion.explanation}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {paused && <PauseOverlay onContinue={resumeFromPause} onAbandon={abandonFromPause} />}
      </div>
    );
  }

  // ─── Phase: mode-score ───────────────────────────────────────
  if (gamePhase === 'mode-score') {
    return (
      <div className="min-h-screen flex flex-col px-4 py-6 relative">
        <StatusBar />
        <div className="spotlight" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-2xl w-full animate-fade-in-scale">
            <div className="ticket mb-4">★ Round Complete ★</div>
            <div className="poster-frame px-8 py-10">
              <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">
                {modes[currentModeIndex].name}
              </p>
              <div className="marquee-divider my-3 max-w-[10rem] mx-auto" />
              <p className="font-display italic text-lg text-[var(--maroon-deep)] mb-1">You scored</p>
              <p className="title-poster text-6xl md:text-7xl score-pop">{modeScore.toLocaleString()}</p>
              <p className="font-marquee text-base tracking-[0.3em] text-[var(--maroon)] mt-2">points</p>
              <p className="font-marquee text-xs tracking-[0.3em] text-[var(--maroon)]/80 mt-4">
                Total so far: <span className="text-[var(--marigold-hot)]">{totalScore.toLocaleString()}</span>
              </p>
            </div>
            <button onClick={goNextMode} className="bulb-btn mt-8">
              {currentModeIndex < 4 ? '▶ Next Round' : '★ View Final Score'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: final-score ──────────────────────────────────────
  if (gamePhase === 'final-score') {
    const verdict = getVerdict(totalScore);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative">
        <Confetti active={true} />
        <div className="spotlight" />
        <div className="text-center max-w-2xl w-full animate-fade-in-scale">
          <div className="ticket mb-6 animate-flicker">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)]" />
            That&apos;s a Wrap!
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)]" />
          </div>
          <div className="poster-frame px-8 py-12">
            <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Final Score</p>
            <div className="marquee-divider my-4 max-w-[10rem] mx-auto" />
            <p className="title-poster text-7xl md:text-8xl score-pop">{totalScore.toLocaleString()}</p>
            <div className="marquee-divider my-4 max-w-[10rem] mx-auto" />
            <p className="font-display italic text-2xl md:text-3xl text-[var(--maroon-deep)]">
              &ldquo;{verdict}&rdquo;
            </p>
            <p className="font-marquee text-xs tracking-[0.3em] text-[var(--maroon)] mt-4">
              {correctCount} / 25 correct
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8 animate-fade-in-up">
            <button onClick={shareOnWhatsApp} className="share-btn">✆ Share on WhatsApp</button>
            <button onClick={handleFinalContinue} className="bulb-btn">▶ Continue</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: level-up ─────────────────────────────────────────
  if (gamePhase === 'level-up' && commitResult) {
    return <LevelUp newLevel={commitResult.newLevel as LevelNumber} onContinue={handleLevelUpContinue} />;
  }

  return null;
}

// ─── Pause overlay ────────────────────────────────────────────
function PauseOverlay({ onContinue, onAbandon }: { onContinue: () => void; onAbandon: () => void }) {
  return (
    <div className="pause-overlay">
      <div className="poster-frame px-8 py-10 max-w-md w-full text-center animate-fade-in-scale">
        <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Interval</p>
        <div className="marquee-divider my-3 max-w-[8rem] mx-auto" />
        <h2 className="title-poster text-4xl md:text-5xl">Paused</h2>
        <p className="font-display italic text-[var(--maroon-deep)] mt-2">
          Picked up where you stopped. Pick an option to continue.
        </p>
        <div className="flex flex-col gap-3 mt-6">
          <button onClick={onContinue} className="bulb-btn">▶ Continue Game</button>
          <button onClick={onAbandon} className="outline-btn" style={{ color: 'var(--maroon-deep)', borderColor: 'var(--maroon-deep)' }}>
            ← Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
