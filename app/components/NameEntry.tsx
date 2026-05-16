'use client';

import { useState } from 'react';

interface NameEntryProps {
  onSubmit: (name: string) => void;
}

export default function NameEntry({ onSubmit }: NameEntryProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="spotlight" />

      <div className="ticket mb-8 animate-fade-in-up">
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
        First Time
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--neon-pink)] animate-flicker" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="poster-frame max-w-xl w-full px-8 py-12 md:px-12 md:py-14 text-center animate-fade-in-scale"
      >
        <p className="font-marquee text-sm tracking-[0.4em] text-[var(--maroon)]">Filmistan Presents</p>
        <div className="marquee-divider my-4 max-w-xs mx-auto" />

        <h1 className="title-poster text-5xl md:text-6xl leading-[1]">
          Ek naam,<span className="block">ek pehchaan</span>
        </h1>

        <div className="marquee-divider my-4 max-w-xs mx-auto" />
        <p className="font-display italic text-lg md:text-xl text-[var(--maroon-deep)] mb-8">
          What do we call you, champion?
        </p>

        <input
          type="text"
          value={name}
          maxLength={20}
          autoFocus
          placeholder="Your name…"
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          className="name-input"
        />
        <div className="flex items-center justify-between mt-2 px-2">
          <span className={`font-marquee text-xs tracking-widest ${error ? 'text-[#a4151f]' : 'text-[var(--maroon)]/70'}`}>
            {error ?? 'Max 20 characters'}
          </span>
          <span className="font-marquee text-xs tracking-widest text-[var(--maroon)]/70">{name.length}/20</span>
        </div>

        <button type="submit" className="bulb-btn mt-8">
          ▶ Enter the Arena
        </button>
      </form>

      <div className="absolute top-16 left-10 text-3xl text-[var(--gold)] twinkle">✦</div>
      <div className="absolute bottom-16 right-12 text-2xl text-[var(--neon-teal)] twinkle" style={{ animationDelay: '1s' }}>✦</div>
    </div>
  );
}
