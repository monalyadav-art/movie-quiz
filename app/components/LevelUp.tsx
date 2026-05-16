'use client';

import Confetti from './Confetti';
import { LEVEL_CONFIG, LEVEL_NAMES, LevelNumber } from '../utils/player';

interface LevelUpProps {
  newLevel: LevelNumber;
  onContinue: () => void;
}

export default function LevelUp({ newLevel, onContinue }: LevelUpProps) {
  const cfg = LEVEL_CONFIG[newLevel];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <Confetti active={true} duration={4500} />
      <div className="spotlight" />

      <div className="ticket mb-6 animate-flicker">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)]" />
        Achievement Unlocked
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)]" />
      </div>

      <div className="poster-frame max-w-2xl w-full px-8 py-12 md:px-14 md:py-14 text-center animate-fade-in-scale">
        <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Filmistan Promotes</p>
        <div className="marquee-divider my-4 max-w-xs mx-auto" />

        <h1 className="title-poster text-6xl md:text-8xl leading-[1] level-up-pulse">LEVEL UP!</h1>
        <div className="marquee-divider my-4 max-w-xs mx-auto" />

        <p className="font-marquee text-2xl md:text-3xl tracking-widest text-[var(--maroon-deep)]">
          {LEVEL_NAMES[newLevel]}
        </p>
        <p className="font-display italic text-lg md:text-xl text-[var(--maroon-deep)] mt-2">
          You are now a {LEVEL_NAMES[newLevel]}.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-3 rounded-lg">
            <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Timer</p>
            <p className="font-marquee text-lg">{cfg.timer}s</p>
          </div>
          <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-3 rounded-lg">
            <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Era</p>
            <p className="font-marquee text-sm">{cfg.era}</p>
          </div>
          <div className="bg-[var(--maroon-deep)] text-[var(--paper)] px-3 py-3 rounded-lg">
            <p className="font-marquee text-[0.7rem] tracking-widest text-[var(--gold)]">Difficulty</p>
            <p className="font-marquee text-sm">
              {['easy','medium','hard','expert','legendary'][cfg.difficultyRange[0] - 1]} → {['easy','medium','hard','expert','legendary'][cfg.difficultyRange[1] - 1]}
            </p>
          </div>
        </div>

        {cfg.rules.length > 0 && (
          <ul className="mt-5 text-left max-w-md mx-auto space-y-1">
            {cfg.rules.map((r, i) => (
              <li key={i} className="font-display italic text-[var(--maroon-deep)] text-base">
                ★ {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={onContinue} className="bulb-btn mt-10 animate-fade-in-up">
        ▶ Continue
      </button>
    </div>
  );
}
