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
      roundHistories: [],
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

    const cleanSeed = `${cleanNick}_${socketId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`;
    const avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(cleanSeed)}`;

    const player = {
      id: socketId,
      socketId,
      nickname: cleanNick,
      avatar: avatarUrl,
      score: 0,
      previousScore: 0,
      rank: 0,
      previousRank: 0,
      totalCorrect: 0,
      streak: 0,
      currentAnswer: null, // 'a' | 'b' | 'c' | 'd'
      answeredAt: 0,
      currentResponseTime: 0,
      lastPointsEarned: 0,
      lastAnswerCorrect: false,
      answersHistory: []
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
      score: p.score,
      avatar: p.avatar
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

    // Reset status jawaban pemain untuk soal ini dan simpan skor ronde tuntas sebelumnya
    for (const player of room.players.values()) {
      player.completedRoundScore = player.score;
      player.completedRoundTotalCorrect = player.totalCorrect;
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
    player.currentResponseTime = Number(timeElapsedSeconds.toFixed(2));

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

    // Simpan riwayat jawaban tiap pemain untuk nomor ini
    for (const p of room.players.values()) {
      const answered = !!p.currentAnswer;
      p.answersHistory.push({
        questionIndex: room.currentQuestionIndex,
        questionText: currentQ.question,
        selectedOption: answered ? p.currentAnswer.toUpperCase() : '-',
        isCorrect: answered ? p.lastAnswerCorrect : false,
        pointsEarned: answered ? p.lastPointsEarned : 0,
        responseTimeSeconds: answered ? (p.currentResponseTime || 0) : room.questionDuration
      });
    }

    // Hitung statistik dan analisis butir soal
    const totalParticipants = room.players.size;
    let correctCount = 0;
    let totalResponseTime = 0;
    for (const p of room.players.values()) {
      if (p.lastAnswerCorrect) correctCount++;
      totalResponseTime += (p.currentAnswer ? (p.currentResponseTime || 0) : room.questionDuration);
    }
    const accuracyPercentage = totalParticipants > 0 ? Math.round((correctCount / totalParticipants) * 100) : 0;
    const avgResponseTime = totalParticipants > 0 ? Number((totalResponseTime / totalParticipants).toFixed(2)) : 0;

    // Cari opsi salah yang paling banyak dipilih (distraktor terkuat)
    const wrongCounts = { ...room.answerCounts };
    delete wrongCounts[currentQ.correct_answer.toLowerCase()];
    let topDistractor = '-';
    let maxDistractorCount = 0;
    for (const [opt, count] of Object.entries(wrongCounts)) {
      if (count > maxDistractorCount) {
        maxDistractorCount = count;
        topDistractor = opt.toUpperCase();
      }
    }

    let difficulty = 'Sedang';
    if (accuracyPercentage >= 75) difficulty = 'Mudah';
    else if (accuracyPercentage < 50) difficulty = 'Sulit';

    room.roundHistories.push({
      questionIndex: room.currentQuestionIndex,
      questionText: currentQ.question,
      correctAnswer: currentQ.correct_answer.toUpperCase(),
      answerCounts: { ...room.answerCounts },
      totalParticipants,
      correctCount,
      wrongCount: totalParticipants - correctCount,
      accuracyPercentage,
      averageResponseTimeSeconds: avgResponseTime,
      topDistractor: maxDistractorCount > 0 ? topDistractor : '-',
      difficulty
    });

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
      avatar: p.avatar,
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
        streak: p.streak,
        avatar: p.avatar
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
        first: playerList[0] ? { nickname: playerList[0].nickname, avatar: playerList[0].avatar, score: playerList[0].score, totalCorrect: playerList[0].totalCorrect } : null,
        second: playerList[1] ? { nickname: playerList[1].nickname, avatar: playerList[1].avatar, score: playerList[1].score, totalCorrect: playerList[1].totalCorrect } : null,
        third: playerList[2] ? { nickname: playerList[2].nickname, avatar: playerList[2].avatar, score: playerList[2].score, totalCorrect: playerList[2].totalCorrect } : null
      },
      rankings: playerList.map((p, idx) => ({
        rank: idx + 1,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        totalCorrect: p.totalCorrect
      }))
    };
  }

  /**
   * Mengakhiri sesi kuis di tengah jalan secara paksa
   */
  forceEndGame(pin) {
    const room = this.rooms.get(pin);
    if (!room) return null;

    // Jika dihentikan saat soal sedang aktif (QUESTION),
    // kembalikan skor dan total correct pemain ke skor ronde sebelumnya yang tuntas
    if (room.state === 'QUESTION') {
      for (const player of room.players.values()) {
        if (player.completedRoundScore !== undefined) {
          player.score = player.completedRoundScore;
        }
        if (player.completedRoundTotalCorrect !== undefined) {
          player.totalCorrect = player.completedRoundTotalCorrect;
        }
      }
    }

    return this.getFinalPodium(pin);
  }

  /**
   * Mengambil data terstruktur lengkap untuk laporan analisis & ekspor Excel
   */
  getSessionReportData(pin) {
    const room = this.rooms.get(pin);
    if (!room) return null;

    const playerList = Array.from(room.players.values());
    playerList.sort((a, b) => b.score - a.score);

    const totalQuestions = room.questions.length;
    const totalParticipants = playerList.length;

    // Hitung rata-rata skor
    const totalScores = playerList.reduce((sum, p) => sum + p.score, 0);
    const averageScore = totalParticipants > 0 ? Math.round(totalScores / totalParticipants) : 0;

    // Hitung rata-rata akurasi keseluruhan
    const completedRounds = room.roundHistories.length;
    const totalAnswersCount = room.roundHistories.reduce((sum, r) => sum + r.totalParticipants, 0);
    const totalCorrectCount = room.roundHistories.reduce((sum, r) => sum + r.correctCount, 0);
    const overallAccuracy = totalAnswersCount > 0 ? Math.round((totalCorrectCount / totalAnswersCount) * 100) : 0;

    // Hitung rata-rata waktu respons keseluruhan
    const totalTimeSum = room.roundHistories.reduce((sum, r) => sum + r.averageResponseTimeSeconds, 0);
    const averageTimeOverall = completedRounds > 0 ? Number((totalTimeSum / completedRounds).toFixed(2)) : 0;

    // Soal tersulit & paling lambat dijawab
    let hardestQuestion = null;
    let slowestQuestion = null;
    let lowestAccuracy = 101;
    let maxTime = -1;

    room.roundHistories.forEach(r => {
      if (r.accuracyPercentage < lowestAccuracy) {
        lowestAccuracy = r.accuracyPercentage;
        hardestQuestion = {
          number: r.questionIndex + 1,
          question: r.questionText,
          accuracy: r.accuracyPercentage,
          correctAnswer: r.correctAnswer
        };
      }
      if (r.averageResponseTimeSeconds > maxTime) {
        maxTime = r.averageResponseTimeSeconds;
        slowestQuestion = {
          number: r.questionIndex + 1,
          question: r.questionText,
          duration: r.averageResponseTimeSeconds
        };
      }
    });

    // Evaluasi dan klasifikasi per peserta
    const evaluatedPlayers = playerList.map((p, idx) => {
      const correct = p.totalCorrect || 0;
      const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

      let totalPTime = 0;
      const history = p.answersHistory || [];
      history.forEach(ans => {
        totalPTime += (ans.responseTimeSeconds || 0);
      });
      const avgPTime = history.length > 0 ? Number((totalPTime / history.length).toFixed(2)) : 0;

      let mastery = 'Perlu Remedial';
      if (accuracy >= 80) mastery = 'Sangat Paham';
      else if (accuracy >= 50) mastery = 'Cukup Paham';

      return {
        rank: idx + 1,
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        totalCorrect: correct,
        totalWrong: Math.max(0, totalQuestions - correct),
        accuracy,
        averageResponseTime: avgPTime,
        mastery,
        answers: history
      };
    });

    return {
      pin: room.pin,
      quizSet: room.quizSet,
      createdAt: room.createdAt,
      state: room.state,
      totalQuestions,
      completedQuestions: completedRounds,
      totalParticipants,
      overview: {
        averageScore,
        overallAccuracy,
        averageResponseTime: averageTimeOverall,
        hardestQuestion: hardestQuestion || { number: '-', question: '-', accuracy: 0, correctAnswer: '-' },
        slowestQuestion: slowestQuestion || { number: '-', question: '-', duration: 0 }
      },
      questionsAnalysis: room.roundHistories,
      players: evaluatedPlayers
    };
  }
}

module.exports = new GameStateManager();
