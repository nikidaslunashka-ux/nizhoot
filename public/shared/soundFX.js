/**
 * Nizhoot Audio & Sound Engine
 * Mendukung pemutaran Web Audio API Synthesizer bawaan (tanpa perlu download MP3 eksternal)
 * dan secara otomatis menggunakan file MP3 asli jika sudah tersedia di /assets/sounds/.
 */

class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.lobbyInterval = null;
    this.countdownInterval = null;
    this.isInitialized = false;

    // Cache file MP3 opsional jika ada
    this.audioFiles = {
      lobby: new Audio('/assets/sounds/lobby.mp3'),
      countdown: new Audio('/assets/sounds/countdown.mp3'),
      correct: new Audio('/assets/sounds/correct.mp3'),
      wrong: new Audio('/assets/sounds/wrong.mp3'),
      fanfare: new Audio('/assets/sounds/fanfare.mp3'),
      pop: new Audio('/assets/sounds/pop.mp3')
    };

    // Set loop untuk background music
    this.audioFiles.lobby.loop = true;
    this.audioFiles.countdown.loop = true;

    // Deteksi apakah file MP3 berhasil di-load
    this.hasCustomFiles = {
      lobby: false,
      countdown: false,
      correct: false,
      wrong: false,
      fanfare: false,
      pop: false
    };

    this.checkCustomAudioFiles();
  }

  /**
   * Inisialisasi AudioContext saat ada interaksi user (klik pertama)
   */
  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.isInitialized = true;
  }

  checkCustomAudioFiles() {
    for (const [key, audio] of Object.entries(this.audioFiles)) {
      audio.addEventListener('canplaythrough', () => {
        this.hasCustomFiles[key] = true;
      }, { once: true });
      // Diamkan error jika 404
      audio.addEventListener('error', () => {
        this.hasCustomFiles[key] = false;
      });
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopLobby();
      this.stopCountdown();
    }
    return this.isMuted;
  }

  /**
   * Helper: Bunyikan nada synthesizer
   */
  playTone(freq, type = 'sine', duration = 0.2, startTime = 0, gainLevel = 0.15) {
    if (this.isMuted || !this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + startTime);

      gain.gain.setValueAtTime(gainLevel, this.audioCtx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(this.audioCtx.currentTime + startTime);
      osc.stop(this.audioCtx.currentTime + startTime + duration);
    } catch (e) {
      // Ignored
    }
  }

  /**
   * 1. Efek Pemain Join (Pop)
   */
  playJoin() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.pop) {
      this.audioFiles.pop.currentTime = 0;
      this.audioFiles.pop.play().catch(() => {});
      return;
    }

    // Synth Bubble Pop
    this.playTone(440, 'sine', 0.08, 0, 0.2);
    this.playTone(880, 'sine', 0.12, 0.04, 0.25);
  }

  /**
   * 2. Musik Lobby (Upbeat Arpeggio Loop)
   */
  startLobby() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.lobby) {
      this.audioFiles.lobby.currentTime = 0;
      this.audioFiles.lobby.play().catch(() => {});
      return;
    }

    if (this.lobbyInterval) return;

    // Chords: C - G - Am - F
    const chords = [
      [261.63, 329.63, 392.00, 523.25], // C
      [196.00, 246.94, 293.66, 392.00], // G
      [220.00, 261.63, 329.63, 440.00], // Am
      [174.61, 220.00, 261.63, 349.23]  // F
    ];

    let chordIdx = 0;
    let noteIdx = 0;

    this.lobbyInterval = setInterval(() => {
      if (this.isMuted || !this.audioCtx) return;
      const currentChord = chords[chordIdx];
      const freq = currentChord[noteIdx % currentChord.length];

      this.playTone(freq, 'triangle', 0.18, 0, 0.08);

      noteIdx++;
      if (noteIdx >= 8) {
        noteIdx = 0;
        chordIdx = (chordIdx + 1) % chords.length;
      }
    }, 220);
  }

  stopLobby() {
    if (this.audioFiles.lobby) {
      this.audioFiles.lobby.pause();
    }
    if (this.lobbyInterval) {
      clearInterval(this.lobbyInterval);
      this.lobbyInterval = null;
    }
  }

  /**
   * 3. Musik Tegang Countdown (Ticking Suspense)
   */
  startCountdown() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.countdown) {
      this.audioFiles.countdown.currentTime = 0;
      this.audioFiles.countdown.play().catch(() => {});
      return;
    }

    if (this.countdownInterval) return;

    let tick = 0;
    this.countdownInterval = setInterval(() => {
      if (this.isMuted || !this.audioCtx) return;

      // Bass heartbeat pulse
      this.playTone(110, 'sine', 0.15, 0, 0.2);
      if (tick % 2 === 0) {
        this.playTone(440, 'square', 0.05, 0.05, 0.05);
      } else {
        this.playTone(550, 'square', 0.05, 0.05, 0.06);
      }
      tick++;
    }, 500);
  }

  stopCountdown() {
    if (this.audioFiles.countdown) {
      this.audioFiles.countdown.pause();
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * 4. Efek Jawaban Benar (Chime)
   */
  playCorrect() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.correct) {
      this.audioFiles.correct.currentTime = 0;
      this.audioFiles.correct.play().catch(() => {});
      return;
    }

    // Melodi Mayor Sukses: E5 -> G#5 -> B5 -> E6
    this.playTone(659.25, 'sine', 0.12, 0, 0.2);
    this.playTone(830.61, 'sine', 0.12, 0.09, 0.2);
    this.playTone(987.77, 'sine', 0.15, 0.18, 0.22);
    this.playTone(1318.51, 'sine', 0.4, 0.28, 0.25);
  }

  /**
   * 5. Efek Jawaban Salah (Buzzer)
   */
  playWrong() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.wrong) {
      this.audioFiles.wrong.currentTime = 0;
      this.audioFiles.wrong.play().catch(() => {});
      return;
    }

    // Dissonant Low Sawtooth
    this.playTone(160, 'sawtooth', 0.25, 0, 0.2);
    this.playTone(150, 'sawtooth', 0.35, 0.05, 0.25);
  }

  /**
   * 6. Selebrasi Podium Juara (Fanfare)
   */
  playFanfare() {
    if (this.isMuted) return;
    this.init();

    if (this.hasCustomFiles.fanfare) {
      this.audioFiles.fanfare.currentTime = 0;
      this.audioFiles.fanfare.play().catch(() => {});
      return;
    }

    // Grand Triumphant Fanfare
    const notes = [
      { f: 523.25, t: 0, d: 0.15 },
      { f: 523.25, t: 0.15, d: 0.15 },
      { f: 523.25, t: 0.30, d: 0.15 },
      { f: 659.25, t: 0.45, d: 0.35 },
      { f: 587.33, t: 0.85, d: 0.15 },
      { f: 659.25, t: 1.00, d: 0.15 },
      { f: 783.99, t: 1.15, d: 0.60 }
    ];

    notes.forEach(n => {
      this.playTone(n.f, 'triangle', n.d, n.t, 0.25);
      this.playTone(n.f / 2, 'sine', n.d, n.t, 0.2);
    });
  }
}

// Export singleton ke global window
window.soundFX = new SoundEngine();
