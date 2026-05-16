// Simple sound effects for the quiz app
export class SoundEffects {
  private audioContext: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  playCorrect() {
    // Happy ascending notes
    setTimeout(() => this.playTone(523, 0.2), 0);   // C5
    setTimeout(() => this.playTone(659, 0.2), 100); // E5
    setTimeout(() => this.playTone(784, 0.3), 200); // G5
  }

  playWrong() {
    // Sad descending notes
    setTimeout(() => this.playTone(392, 0.3), 0);   // G4
    setTimeout(() => this.playTone(330, 0.3), 150); // E4
  }

  playTimerWarning() {
    // Urgent beeps
    setTimeout(() => this.playTone(800, 0.1, 'square'), 0);
    setTimeout(() => this.playTone(800, 0.1, 'square'), 200);
    setTimeout(() => this.playTone(800, 0.1, 'square'), 400);
  }

  playModeComplete() {
    // Triumphant fanfare
    setTimeout(() => this.playTone(523, 0.2), 0);   // C5
    setTimeout(() => this.playTone(659, 0.2), 100); // E5
    setTimeout(() => this.playTone(784, 0.2), 200); // G5
    setTimeout(() => this.playTone(1047, 0.4), 300); // C6
  }

  playGameComplete() {
    // Epic finale
    setTimeout(() => this.playTone(523, 0.3), 0);   // C5
    setTimeout(() => this.playTone(587, 0.3), 150); // D5
    setTimeout(() => this.playTone(659, 0.3), 300); // E5
    setTimeout(() => this.playTone(698, 0.3), 450); // F5
    setTimeout(() => this.playTone(784, 0.5), 600); // G5
  }
}

export const soundEffects = new SoundEffects();