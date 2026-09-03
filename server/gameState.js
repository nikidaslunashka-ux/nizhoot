/**
 * Nizhoot Game State Manager
 * Mengelola room in-memory, state transisi, pemain, timer, dan scoring formula.
 */

class GameStateManager {
  constructor() {
    this.rooms = new Map(); // PIN -> RoomObject
  }

  /**
   * Generate 5-digit random PIN yang belum terpakai
   */
  generatePin() {
    let pin;
    let attempts = 0;
    do {
      pin = Math.floor(10000 + Math.random() * 90000).toString();
      attempts++;
    } while (this.rooms.has(pin) && attempts < 100);
    return pin;
  }

  /**
   * Buat Room baru
   */
  createRoom(pin, quizSetName, questions, hostSocketId) {
    const room = {
      pin,
      quizSet: quizSetName,
      questions: questions || [],
      hostSocketId,
      state: 'LOBBY', // LOBBY, QUESTION, ROUND_SUMMARY, FINAL_PODIUM
      currentQuestionIndex: -1,
      players: new Map(), // socketId -> Player
      questionStartTime: 0,
      questionDuration: 20,
      timerHandle: null,
      autoplayTimer: null,
      autoplay: false,
      skipWhenAllAnswered: false,
      answerCounts: { a: 0, b: 0, c: 0, d: 0 },
      createdAt: Date.now()
    };

    this.rooms.set(pin, room);
    return room;
  }

  getRoom(pin) {
    return this.rooms.get(pin);
  }

  deleteRoom(pin) {
    const room = this.rooms.get(pin);
    if (room) {
      if (room.timerHandle) clearInterval(room.timerHandle);
      if (room.autoplayTimer) clearTimeout(room.autoplayTimer);
    }
    return this.rooms.delete(pin);
  }

  setAutoplay(pin, enabled, skipWhenAllAnswered = false) {
    const room = this.rooms.get(pin);
    if (room) {
      room.autoplay = !!enabled;
      room.skipWhenAllAnswered = !!skipWhenAllAnswered;
      if (!room.autoplay && room.autoplayTimer) {
        clearTimeout(room.autoplayTimer);
        room.autoplayTimer = null;
      }
    }
    return room;
  }

  /**
   * Tambah pemain ke room
   */
  addPlayer(pin, socketId, nickname) {
    const room = this.rooms.get(pin);
    if (!room) {
      return { success: false, message: 'Kode PIN room tidak ditemukan.' };
    }

    if (room.state !== 'LOBBY' && room.state !== 'QUESTION' && room.state !== 'ROUND_SUMMARY') {
      return { success: false, message: 'Game sudah berakhir.' };
    }

    // Cek duplikasi nickname dalam room
    const cleanNick = (nickname || 'Peserta').toString().trim().slice(0, 18);
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === cleanNick.toLowerCase() && p.socketId !== socketId) {
        return { success: false, message: 'Nama sudah dipakai di room ini. Pilih nama lain.' };
      }
    }

    const player = {
      id: socketId,
      socketId,
      nickname: cleanNick,
      score: 0,
      previousScore: 0,
      rank: 0,
      previousRank: 0,
      totalCorrect: 0,
      streak: 0,
      currentAnswer: null, // 'a' | 'b' | 'c' | 'd'
      answeredAt: 0,
      lastPointsEarned: 0,
      lastAnswerCorrect: false
    };

    room.players.set(socketId, player);
    return { success: true, player, room };
  }

  /**
   * Hapus pemain jika disconnect
   */
  removePlayer(socketId) {
    for (const [pin, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const removed = room.players.get(socketId);
        room.players.delete(socketId);
        return { pin, player: removed, remainingCount: room.players.size };
      }
    }
    return null;
  }

  /**
   * Dapatkan list pemain sederhana untuk lobby
   */
  getPlayerList(pin) {
    const room = this.rooms.get(pin);
    if (!room) return [];
    return Array.from(room.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score
    }));
  }

  /**
   * Mulai soal (bisa soal pertama atau berikutnya)
   */
  startQuestion(pin, questionIndex) {
    const room = this.rooms.get(pin);
    if (!room) return null;

    if (questionIndex >= room.questions.length) {
      room.state = 'FINAL_PODIUM';
      return { state: 'FINAL_PODIUM' };
    }

    room.currentQuestionIndex = questionIndex;
    room.state = 'QUESTION';
    const q = room.questions[questionIndex];
    room.questionDuration = q.duration_seconds || 20;
    room.questionStartTime = Date.now();
    room.answerCounts = { a: 0, b: 0, c: 0, d: 0 };

    // Reset status jawaban pemain untuk soal ini
    for (const player of room.players.values()) {
      player.currentAnswer = null;
      player.answeredAt = 0;
      player.lastPointsEarned = 0;
      player.lastAnswerCorrect = false;
    }

    // Sanitasi data soal untuk host dan player:
    // Host mendapatkan teks soal + pilihan + media (tanpa bocoran correct_answer di client)
    const hostQuestionData = {
      index: questionIndex,
      total: room.questions.length,
      question: q.question,
      options: q.options,
      duration: room.questionDuration,
      image_url: q.image_url || '',
      video_url: q.video_url || '',
      quiz_set: room.quizSet
    };

    // Player sekarang mendapatkan teks pertanyaan, opsi jawaban, dan media gambar/video
    const playerQuestionData = {
      index: questionIndex,
      total: room.questions.length,
      duration: room.questionDuration,
      question: q.question,
      options: q.options,
      image_url: q.image_url || '',
      video_url: q.video_url || ''
    };

    return {
      hostQuestionData,
      playerQuestionData,
      correctAnswer: q.correct_answer
    };
  }

  /**
   * Pemain submit jawaban
   */
  submitAnswer(pin, socketId, selectedOption) {
    const room = this.rooms.get(pin);
    if (!room || room.state !== 'QUESTION') {
      return { success: false, message: 'Soal sedang tidak aktif.' };
    }

    const player = room.players.get(socketId);
    if (!player) {
      return { success: false, message: 'Pemain tidak terdaftar.' };
    }

    if (player.currentAnswer) {
      return { success: false, message: 'Anda sudah menjawab soal ini.' };
    }

    const cleanOption = (selectedOption || '').toString().trim().toLowerCase();
    if (!['a', 'b', 'c', 'd'].includes(cleanOption)) {
      return { success: false, message: 'Opsi jawaban tidak valid.' };
    }

    const currentQ = room.questions[room.currentQuestionIndex];
    const now = Date.now();
    const timeElapsedSeconds = Math.max(0, (now - room.questionStartTime) / 1000);
    const duration = room.questionDuration;

    player.currentAnswer = cleanOption;
    player.answeredAt = now;

    // Tambah counter agregat jawaban
    if (room.answerCounts[cleanOption] !== undefined) {
      room.answerCounts[cleanOption]++;
    }

    // Cek kebenaran jawaban
    const isCorrect = (cleanOption === currentQ.correct_answer.toLowerCase());
    let points = 0;

    if (isCorrect) {
      player.streak++;
      player.totalCorrect++;

      // Kahoot-style scoring formula:
      // Poin dasar: 1000 dikurangi pinalti waktu (maks 50% pinalti)
      const speedRatio = Math.min(1, timeElapsedSeconds / duration);
      const basePoints = Math.round(1000 * (1 - (speedRatio / 2)));
      
      // Bonus streak hingga 250 poin (5x streak)
      const streakBonus = Math.min(player.streak - 1, 5) * 50;

      points = Math.max(500, basePoints + streakBonus);
      player.lastAnswerCorrect = true;
    } else {
      player.streak = 0;
      player.lastAnswerCorrect = false;
      points = 0;
    }

    player.previousScore = player.score;
    player.score += points;
    player.lastPointsEarned = points;

    // Hitung berapa pemain yang sudah menjawab
    let answeredCount = 0;
    for (const p of room.players.values()) {
      if (p.currentAnswer) answeredCount++;
    }

    const allAnswered = (answeredCount >= room.players.size && room.players.size > 0);

    return {
      success: true,
      answeredCount,
      totalPlayers: room.players.size,
      allAnswered
    };
  }

  /**
   * Akhiri soal dan hitung leaderboard & statistik
   */
  finishQuestion(pin) {
    const room = this.rooms.get(pin);
    if (!room) return null;

    room.state = 'ROUND_SUMMARY';
    const currentQ = room.questions[room.currentQuestionIndex];

    // Simpan rank sebelumnya lalu urutkan pemain berdasarkan skor
    const playerList = Array.from(room.players.values());
    
    // Sort descending by score
    playerList.sort((a, b) => b.score - a.score);

    // Update rank
    playerList.forEach((player, index) => {
      player.previousRank = player.rank || (index + 1);
      player.rank = index + 1;
    });

    // Top 5 untuk layar proyektor
    const top5 = playerList.slice(0, 5).map(p => ({
      nickname: p.nickname,
      score: p.score,
      pointsEarned: p.lastPointsEarned,
      rank: p.rank,
      rankDelta: p.previousRank - p.rank, // positif jika naik rank
      isCorrect: p.lastAnswerCorrect
    }));

    // Data hasil per pemain untuk dikirim ke masing-masing socket player
    const playerResults = new Map();
    for (const p of room.players.values()) {
      playerResults.set(p.socketId, {
        isCorrect: p.lastAnswerCorrect,
        correctAnswer: currentQ.correct_answer,
        pointsEarned: p.lastPointsEarned,
        totalScore: p.score,
        rank: p.rank,
        totalPlayers: room.players.size,
        streak: p.streak
      });
    }

    return {
      questionIndex: room.currentQuestionIndex,
      isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1,
      correctAnswer: currentQ.correct_answer,
      answerCounts: { ...room.answerCounts },
      totalAnswers: Object.values(room.answerCounts).reduce((a, b) => a + b, 0),
      totalPlayers: room.players.size,
      leaderboard: top5,
      playerResults
    };
  }

  /**
   * Data final podium
   */
  getFinalPodium(pin) {
    const room = this.rooms.get(pin);
    if (!room) return null;

    room.state = 'FINAL_PODIUM';

    const playerList = Array.from(room.players.values());
    playerList.sort((a, b) => b.score - a.score);

    return {
      quizSet: room.quizSet,
      totalQuestions: room.questions.length,
      totalParticipants: playerList.length,
      podium: {
        first: playerList[0] ? { nickname: playerList[0].nickname, score: playerList[0].score, totalCorrect: playerList[0].totalCorrect } : null,
        second: playerList[1] ? { nickname: playerList[1].nickname, score: playerList[1].score, totalCorrect: playerList[1].totalCorrect } : null,
        third: playerList[2] ? { nickname: playerList[2].nickname, score: playerList[2].score, totalCorrect: playerList[2].totalCorrect } : null
      },
      rankings: playerList.map((p, idx) => ({
        rank: idx + 1,
        nickname: p.nickname,
        score: p.score,
        totalCorrect: p.totalCorrect
      }))
    };
  }
}

module.exports = new GameStateManager();
