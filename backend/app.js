const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const app = express();

const server = http.createServer(app);
app.use(cors());

// Use environment variable for allowed frontend origins in production
// Supports comma-separated list. Defaults include localhost and Netlify wildcard.
const ORIGIN_ENV = process.env.FRONTEND_ORIGIN || '';
const ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /\.netlify\.(app|dev)$/,
];
if (ORIGIN_ENV) {
  ORIGIN_ENV.split(',').map(s => s.trim()).filter(Boolean).forEach(v => ORIGINS.unshift(v));
}

const io = socketIo(server, {
  cors: {
    origin: ORIGINS,
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

const questions = [
  {
    question: "What is the SI unit of force?",
    answers: [
      { text: "Newton (N)", correct: true },
      { text: "Joule (J)", correct: false },
      { text: "Watt (W)", correct: false },
      { text: "Pascal (Pa)", correct: false },
    ],
  },
  {
    question: "Which of Newton's Laws is also known as the 'Law of Inertia'?",
    answers: [
      { text: "First Law", correct: true },
      { text: "Second Law", correct: false },
      { text: "Third Law", correct: false },
      { text: "Law of Gravitation", correct: false },
    ],
  },
  {
    question: "What happens to the acceleration of an object if the force acting on it is doubled?",
    answers: [
      { text: "It doubles", correct: true },
      { text: "It halves", correct: false },
      { text: "It remains the same", correct: false },
      { text: "It becomes zero", correct: false },
    ],
  },
  {
    question: "Which of these is an example of balanced forces?",
    answers: [
      { text: "A book at rest on a table", correct: true },
      { text: "A ball rolling down a hill", correct: false },
      { text: "A car speeding up", correct: false },
      { text: "A rocket taking off", correct: false },
    ],
  },
  {
    question: "What is the relationship between force, mass, and acceleration according to Newton's Second Law?",
    answers: [
      { text: "F = m × a", correct: true },
      { text: "F = m + a", correct: false },
      { text: "F = m / a", correct: false },
      { text: "F = m - a", correct: false },
    ],
  },
  {
    question: "Which of these is an example of Newton's Third Law of Motion?",
    answers: [
      { text: "A swimmer pushing water backward and moving forward", correct: true },
      { text: "A ball rolling to a stop on the ground", correct: false },
      { text: "A book sitting on a table", correct: false },
      { text: "A car turning a corner", correct: false },
    ],
  },
  {
    question: "What is inertia?",
    answers: [
      { text: "The tendency of an object to resist changes in its state of motion", correct: true },
      { text: "The force that attracts objects to each other", correct: false },
      { text: "The speed of an object in a particular direction", correct: false },
      { text: "The energy an object has due to its motion", correct: false },
    ],
  },
  {
    question: "What is the net force acting on an object moving at constant velocity?",
    answers: [
      { text: "Zero", correct: true },
      { text: "Equal to its mass", correct: false },
      { text: "Equal to its acceleration", correct: false },
      { text: "Equal to its velocity", correct: false },
    ],
  },
  {
    question: "Which of these would have the greatest inertia?",
    answers: [
      { text: "A truck", correct: true },
      { text: "A bicycle", correct: false },
      { text: "A baseball", correct: false },
      { text: "A feather", correct: false },
    ],
  },
  {
    question: "What is the reaction force when you push against a wall?",
    answers: [
      { text: "The wall pushes back with equal force", correct: true },
      { text: "The wall doesn't push back", correct: false },
      { text: "The wall pushes back with less force", correct: false },
      { text: "The wall absorbs the force", correct: false },
    ],
  }
];

const rooms = {};

// ===== Escape Treasure Hunt puzzle bank (Force & Newton's Laws) =====
// Types: 'mcq', 'scenario', 'match'
const escapePuzzles = [
  {
    type: 'mcq',
    time: 25,
    prompt: "Which law is known as the Law of Inertia?",
    options: ["First Law", "Second Law", "Third Law", "Universal Gravitation"],
    answer: 0,
    hint: "Objects resist changes in motion.",
  },
  {
    type: 'scenario',
    time: 25,
    prompt: "A cart accelerates at 'a' when a force F is applied to mass m. If mass doubles (2m) and force F is unchanged, the acceleration becomes? (type: a/2, a, 2a)",
    answerText: 'a/2',
    hint: 'F = m a ⇒ a = F/m',
  },
  {
    type: 'mcq',
    time: 25,
    prompt: 'Action and reaction forces are equal and opposite and act on different bodies. Which law? ',
    options: ['First', 'Second', 'Third'],
    answer: 2,
    hint: 'Think of rocket thrust vs exhaust.',
  },
  {
    type: 'match',
    time: 30,
    prompt: 'Match the law to the example',
    left: ['First Law', 'Second Law', 'Third Law'],
    right: ['Rocket launches', 'Object at rest stays at rest', 'F = m×a'],
    // mapping is from left index to right index
    mapping: { '0': 1, '1': 2, '2': 0 },
    hint: 'Try pairing the statement to each law.',
  },
  {
    type: 'scenario',
    time: 20,
    prompt: 'SI unit of force? (type the word)',
    answerText: 'newton',
    hint: 'Named after Isaac Newton',
  },
];

io.on("connection", (socket) => {
  console.log("A user connected");

  // ===== Escape Game helpers (connection scope) =====
  function ensureEscape(room) {
    if (!rooms[room]) return null;
    if (!rooms[room].escape) {
      rooms[room].escape = {
        players: {}, // id -> { name, pos: {x,y,z} }
        completed: false,
        // staged hunt state
        stage: 0,
        totalStages: 5,
        currentPuzzleIndex: 0,
        deadline: null,
        scores: {}, // id -> points
        keys: {},   // id -> key count
        timerHandle: null,
        // console progress state for door unlock
        consoleSolved: {}, // consoleId -> true
        solvedCount: 0,
        requiredToUnlock: 3,
        // treasure boxes state
        treasure: { boxes: [] }, // [{hasKey:boolean, opened:boolean} x6]
      };
    }
    return rooms[room].escape;
  }

// ===== Escape Treasure Hunt helpers =====
function startEscapeStage(room) {
  const esc = rooms[room]?.escape;
  if (!esc) return;
  // choose puzzle
  const idx = esc.currentPuzzleIndex % escapePuzzles.length;
  const p = escapePuzzles[idx];
  const seconds = Number(p.time) || 25;
  esc.deadline = Date.now() + seconds * 1000;
  // notify clients of new stage
  const payload = {
    stage: esc.stage + 1,
    totalStages: esc.totalStages,
    type: p.type,
    prompt: p.prompt,
    options: p.options || null,
    left: p.left || null,
    right: p.right || null,
    deadline: esc.deadline,
    hint: p.hint || null,
  };
  io.to(room).emit('escapeStage', payload);

  // clear any previous timer
  if (esc.timerHandle) clearTimeout(esc.timerHandle);
  esc.timerHandle = setTimeout(() => {
    // time up for this stage
    io.to(room).emit('escapeProgress', { ok: false, msg: 'Time up! Moving on.', scores: esc.scores, keys: esc.keys });
    esc.stage += 1;
    esc.currentPuzzleIndex += 1;
    if (esc.stage >= esc.totalStages) {
      finishEscape(room);
    } else {
      startEscapeStage(room);
    }
  }, seconds * 1000);
}

function finishEscape(room) {
  const esc = rooms[room]?.escape;
  if (!esc) return;
  esc.completed = true;
  if (esc.timerHandle) clearTimeout(esc.timerHandle);
  // compute winner by score
  const entries = Object.entries(esc.scores);
  entries.sort((a,b) => (b[1]||0) - (a[1]||0));
  const podium = entries.map(([id, score]) => {
    const player = rooms[room].players.find(p => p.id === id);
    return { id, name: player ? player.name : 'Player', score };
  });
  io.to(room).emit('escapeFinished', { podium, keys: esc.keys });
}

  socket.on("checkRoom", (room) => {
    if (rooms[room]) {
      socket.emit("participantList", {
        participants: rooms[room].players.map(player => ({ name: player.name, isHost: player.isHost })),
        count: rooms[room].players.length,
        hostId: rooms[room].host,
        isYouHost: false
      });
    } else {
      socket.emit("participantList", {
        participants: [],
        count: 0,
        hostId: null,
        isYouHost: false
      });
    }
  });

  socket.on("startGame", (room) => {
    if (rooms[room] && !rooms[room].gameStarted) {
      rooms[room].gameStarted = true;
      io.to(room).emit("gameStarting");
      askNewQuestion(room);
    }
  });

  socket.on("joinRoom", (room, name) => {
    socket.join(room);
    io.to(room).emit("message", `${name} has joined the game!`);
    if (!rooms[room]) {
      rooms[room] = {
        players: [],
        host: null,
        currentQuestion: null,
        correctAnswer: null,
        questionTimeout: null,
        shouldAskNewQuestion: true,
        gameStarted: false,
      };
    }
    // to make score zero
  //   if(rooms[room]){
  //   rooms[room].players.forEach((player) => {
  //     player.score = 0;
  //   });
  // }
  // rooms[room].players.push({ id: socket.id, name,score: 0  });
    // Set first player as host
    const isHost = rooms[room].players.length === 0;
    if (isHost) {
      rooms[room].host = socket.id;
    }
    
    rooms[room].players.push({ id: socket.id, name, isHost });

    // Emit updated participant list and host info to all players in the room
    io.to(room).emit("participantList", {
      participants: rooms[room].players.map(player => ({ name: player.name, isHost: player.isHost })),
      count: rooms[room].players.length,
      hostId: rooms[room].host,
      isYouHost: socket.id === rooms[room].host
    });

    // Don't start questions automatically - wait for host to start
    // if (!rooms[room].currentQuestion && !rooms[room].gameStarted) {
    //   askNewQuestion(room);
    // }
  });

  socket.on("submitAnswer", (room, answerIndex) => {
    const currentPlayer = rooms[room].players.find(
      (player) => player.id === socket.id
    );

    if (currentPlayer) {
      const correctAnswer = rooms[room].correctAnswer;
      const isCorrect = correctAnswer !== null && correctAnswer === answerIndex;
      currentPlayer.score = isCorrect
        ? (currentPlayer.score || 0) + 1
        : (currentPlayer.score || 0) - 1;

      clearTimeout(rooms[room].questionTimeout);

      io.to(room).emit("answerResult", {
        playerName: currentPlayer.name,
        isCorrect,
        correctAnswer,
        scores: rooms[room].players.map((player) => ({
          name: player.name,
          score: player.score || 0,
        })),
      });

      const winningThreshold = 5;
      const winner = rooms[room].players.find(
        (player) => (player.score || 0) >= winningThreshold
      );

      if (winner) {
        io.to(room).emit("gameOver", { winner: winner.name });
        delete rooms[room];
      } else {
        askNewQuestion(room);
      }
    }
  });

  // ===== Escape Game Events (connection scope) =====
  socket.on("escapeJoin", (room, name, avatar) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    const safeAvatar = typeof avatar === 'string' && avatar.length <= 24 ? avatar : 'rogue';
    esc.players[socket.id] = { name, pos: { x: 0, y: 0.9, z: 0 }, avatar: safeAvatar };
    socket.join(room);
    socket.emit("escapeWelcome", {
      id: socket.id,
      players: Object.entries(esc.players).map(([id, p]) => ({ id, pos: p.pos, name: p.name, avatar: p.avatar || 'rogue' })),
      state: { completed: esc.completed, solvedCount: esc.solvedCount || 0, requiredToUnlock: esc.requiredToUnlock || 3 },
    });
    socket.to(room).emit("escapePlayerJoined", { id: socket.id, pos: esc.players[socket.id].pos, name, avatar: safeAvatar });
  });

  socket.on("escapeMove", (room, pos) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    const p = esc.players[socket.id];
    if (!p) return;
    const safe = {
      x: Math.max(-19, Math.min(19, Number(pos.x) || 0)),
      y: 0.9,
      z: Math.max(-19, Math.min(19, Number(pos.z) || 0)),
    };
    p.pos = safe;
    socket.to(room).emit("escapePlayerMoved", { id: socket.id, pos: safe });
  });

  socket.on("escapePuzzleSolved", (room) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    // Legacy event retained for compatibility with older clients.
    // Do NOT unlock immediately here to ensure 3 puzzles are required.
    // Optionally, we could emit feedback, but avoid changing unlock state.
  });

  socket.on("escapeLeave", (room) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    if (esc.players[socket.id]) {
      delete esc.players[socket.id];
      socket.to(room).emit("escapePlayerLeft", socket.id);
    }
  });

  // Start the escape game across the room
  socket.on("escapeStart", (room) => {
    if (!rooms[room]) return;
    io.to(room).emit("escapeStarted");
  });

  // Mark an individual console as solved (visual sync only) - no longer affects unlock progress
  socket.on("escapeConsoleSolved", (room, consoleId) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    // Broadcast visual update first
    io.to(room).emit("escapeConsoleSolved", { consoleId });
    // Previously incremented progress; now keys come from treasure boxes.
  });

  // Player attempts to open a treasure box by index (0..5)
  socket.on("escapeOpenBox", (room, index) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc || esc.completed) return;
    const i = Number(index);
    if (!esc.treasure || !Array.isArray(esc.treasure.boxes)) return;
    if (i < 0 || i >= esc.treasure.boxes.length) return;
    const box = esc.treasure.boxes[i];
    if (box.opened) {
      // Already opened, just echo result
      io.to(room).emit('escapeBoxResult', { index: i, found: box.hasKey });
      return;
    }
    box.opened = true;
    const found = !!box.hasKey;
    if (found) {
      // Count towards room keys progress
      esc.solvedCount = (esc.solvedCount || 0) + 1;
      // Optional per-player keys
      esc.keys[socket.id] = (esc.keys[socket.id] || 0) + 1;
      io.to(room).emit('escapeKeyProgress', { solvedCount: esc.solvedCount, requiredToUnlock: esc.requiredToUnlock || 3 });
      if (esc.solvedCount >= (esc.requiredToUnlock || 3)) {
        esc.completed = true;
        io.to(room).emit('escapeState', { completed: true });
      }
    }
    io.to(room).emit('escapeBoxResult', { index: i, found });
  });

  // Begin staged treasure hunt (host/anyone can trigger for MVP)
  socket.on("escapeStartGame", (room) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc) return;
    esc.stage = 0;
    esc.currentPuzzleIndex = 0;
    esc.completed = false;
    esc.deadline = null;
    esc.timerHandle && clearTimeout(esc.timerHandle);
    // reset scores/keys for players present
    Object.keys(esc.players).forEach(id => {
      esc.scores[id] = 0;
      esc.keys[id] = 0;
    });
    // reset console solve tracking
    esc.consoleSolved = {};
    esc.solvedCount = 0;
    // initialize treasure boxes: 6 boxes, randomly place 3 keys
    const boxes = new Array(6).fill(null).map(() => ({ hasKey: false, opened: false }));
    // choose 3 unique indices
    const idxs = new Set();
    while (idxs.size < 3) {
      idxs.add(Math.floor(Math.random() * 6));
    }
    Array.from(idxs).forEach(i => { boxes[i].hasKey = true; });
    esc.treasure = { boxes };
    // notify clients to reset visuals/locks
    io.to(room).emit('escapeState', { completed: false, reset: true });
    // send initial unopened boxes state (do not reveal key locations)
    io.to(room).emit('escapeBoxes', { opened: boxes.map(b => b.opened) });
    // also broadcast reset progress 0/N
    io.to(room).emit('escapeKeyProgress', { solvedCount: 0, requiredToUnlock: esc.requiredToUnlock || 3 });
    // broadcast 5s countdown
    const deadline = Date.now() + 5000;
    io.to(room).emit('escapeCountdown', { deadline });
    setTimeout(() => {
      // Start after countdown
      if (rooms[room] && rooms[room].escape && !rooms[room].escape.completed) {
        startEscapeStage(room);
      }
    }, 5000);
  });

  // Player submits an answer for current stage
  socket.on("escapeSubmitAnswer", (room, payload) => {
    if (!rooms[room]) return;
    const esc = ensureEscape(room);
    if (!esc || esc.completed) return;
    const pIndex = esc.currentPuzzleIndex % escapePuzzles.length;
    const puzzle = escapePuzzles[pIndex];
    if (!puzzle) return;

    const now = Date.now();
    if (esc.deadline && now > esc.deadline) {
      // too late
      socket.emit('escapeProgress', { ok: false, msg: 'Time up!', scores: esc.scores, keys: esc.keys });
      return;
    }

    let correct = false;
    if (puzzle.type === 'mcq') {
      const ans = Number(payload?.answer);
      correct = (ans === puzzle.answer);
    } else if (puzzle.type === 'scenario') {
      const txt = String(payload?.answer || '').trim().toLowerCase();
      correct = (txt === String(puzzle.answerText).toLowerCase());
    } else if (puzzle.type === 'match') {
      // payload: mapping object of leftIndex -> rightIndex
      const map = payload?.mapping || {};
      correct = ['0','1','2'].every(k => Number(map[k]) === Number(puzzle.mapping[k]));
    }

    if (correct) {
      esc.scores[socket.id] = (esc.scores[socket.id] || 0) + 10;
      esc.keys[socket.id] = (esc.keys[socket.id] || 0) + 1;
      io.to(room).emit('escapeProgress', { ok: true, msg: 'Correct! A key was found.', scores: esc.scores, keys: esc.keys });
      // advance to next stage
      esc.stage += 1;
      esc.currentPuzzleIndex += 1;
      esc.timerHandle && clearTimeout(esc.timerHandle);
      if (esc.stage >= esc.totalStages) {
        finishEscape(room);
      } else {
        startEscapeStage(room);
      }
    } else {
      // wrong answer penalty: broadcast feedback
      io.to(room).emit('escapeProgress', { ok: false, msg: 'Wrong answer! Try again.', scores: esc.scores, keys: esc.keys });
    }
  });

  // Chat: broadcast per-room messages (ported to match maths-final-git)
  socket.on("chatMessage", (payload) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { room, name, text, ts, type } = payload;
      if (!room || !rooms[room]) return;
      const cleanName = String(name || 'Anon').slice(0, 32);
      const cleanText = String(text || '').trim().slice(0, 300);
      if (!cleanText) return;
      const safeType = type === 'preset' ? 'preset' : 'text';
      const message = { name: cleanName, text: cleanText, ts: ts || Date.now(), type: safeType };
      io.to(room).emit('chatMessage', message);
    } catch (e) {
      console.error('chatMessage error', e);
    }
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      const oldPlayerCount = rooms[room].players.length;
      rooms[room].players = rooms[room].players.filter(
        (player) => player.id !== socket.id
      );
      
      // Emit updated participant list if someone left
      if (rooms[room].players.length !== oldPlayerCount) {
        // If host left, assign new host
        if (rooms[room].host === socket.id && rooms[room].players.length > 0) {
          rooms[room].host = rooms[room].players[0].id;
          rooms[room].players[0].isHost = true;
        }
        
        io.to(room).emit("participantList", {
          participants: rooms[room].players.map(player => ({ name: player.name, isHost: player.isHost })),
          count: rooms[room].players.length,
          hostId: rooms[room].host,
          isYouHost: false // Will be updated on client side
        });
      }
    }

    console.log("A user disconnected");
  });
});

function askNewQuestion(room) {
  if (rooms[room].players.length === 0) {
    clearTimeout(rooms[room].questionTimeout);
    delete rooms[room];
    return;
  }

  const randomIndex = Math.floor(Math.random() * questions.length);
  const question = questions[randomIndex];
  rooms[room].currentQuestion = question;

  // Create a shuffled copy of answers so correct option is not always first
  const shuffledAnswers = question.answers
    .map((a) => ({ ...a }))
    .sort(() => Math.random() - 0.5);

  // Determine the correct index after shuffling
  const correctAnswerIndex = shuffledAnswers.findIndex((answer) => answer.correct);

  rooms[room].correctAnswer = correctAnswerIndex;
  rooms[room].shouldAskNewQuestion = true;
  io.to(room).emit("newQuestion", {
    question: question.question,
    answers: shuffledAnswers.map((answer) => answer.text),
    timer: 20,
  });

  rooms[room].questionTimeout = setTimeout(() => {
    io.to(room).emit("answerResult", {
      playerName: "No one",
      isCorrect: false,
      correctAnswer: rooms[room].correctAnswer,
      scores: rooms[room].players.map((player) => ({
        name: player.name,
        score: player.score || 0,
      })),
    });

    askNewQuestion(room);
  }, 20000);
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
