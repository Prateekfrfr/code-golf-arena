import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import { problems } from '../data/problems.js';
import { runCode } from './executor.js';

const app = express();
const port = 3001;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const rooms = {};
const ROOM_CLEANUP_MS = 30 * 60 * 1000;

const addConnectedPlayer = (room, socketId) => {
  room.connectedPlayers = room.connectedPlayers || [];

  if (!room.connectedPlayers.includes(socketId)) {
    room.connectedPlayers.push(socketId);
  }
};

const createRoomState = (firstPlayerId) => ({
  players: [firstPlayerId],
  connectedPlayers: [firstPlayerId],
  replay: {
    [firstPlayerId]: []
  },
  scores: {},
  problem: null,
  startTime: null,
  cleanupTimer: null
});

const serializeInput = (input) => {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
};

const normalizeOutput = (value) => {
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
};

const outputsMatch = (actual, expected) => {
  if (actual == null) return false;

  const actualText = String(actual).trim();
  const expectedText = normalizeOutput(expected);

  if (actualText === expectedText) return true;

  try {
    return JSON.stringify(JSON.parse(actualText)) === JSON.stringify(expected);
  } catch {
    return false;
  }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];

      room.connectedPlayers = (room.connectedPlayers || []).filter(
        (id) => id !== socket.id
      );

      if (room.connectedPlayers.length === 0 && !room.cleanupTimer) {
        room.cleanupTimer = setTimeout(() => {
          delete rooms[roomCode];
        }, ROOM_CLEANUP_MS);
      }
    }

    console.log('User disconnected');
  });

  socket.on('createRoom', () => {
    const roomCode = crypto.randomUUID()
      .replace(/-/g, '')
      .substring(0, 6)
      .toUpperCase();

    if (rooms[roomCode]) {
      socket.emit('roomExists', roomCode);
      return;
    }

    rooms[roomCode] = createRoomState(socket.id);
    socket.join(roomCode);
    socket.emit('roomCreated', roomCode);
  });

  socket.on('join-room', (roomCodeInput) => {
    const roomCode = String(roomCodeInput || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('error', 'room not found');
      return;
    }

    if (room.players.length >= 2 && !room.players.includes(socket.id)) {
      socket.emit('error', 'room is full');
      return;
    }

    if (!room.players.includes(socket.id)) {
      room.players.push(socket.id);
      room.replay[socket.id] = [];
    }

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    addConnectedPlayer(room, socket.id);
    socket.join(roomCode);

    if (room.players.length === 2 && !room.problem) {
      room.problem = problems[Math.floor(Math.random() * problems.length)];
      room.startTime = Date.now();
    }

    if (room.players.length === 2) {
      io.to(roomCode).emit('room-ready', {
        roomCode,
        problem: room.problem
      });
    }
  });

  socket.on('rejoin-room', (roomCodeInput) => {
    const roomCode = String(roomCodeInput || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('error', 'room not found');
      return;
    }

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    addConnectedPlayer(room, socket.id);
    socket.join(roomCode);

    if (room.problem) {
      socket.emit('problem', room.problem);
    }

    socket.emit('leaderboard-update', room.scores || {});
  });

  socket.on('code-update', (data) => {
    const { roomCode, code } = data;
    const room = rooms[roomCode];

    socket.to(roomCode).emit('code-update', code);

    if (room?.replay?.[socket.id] !== undefined) {
      room.replay[socket.id].push({
        code,
        timestamp: Date.now() - room.startTime
      });
    }
  });

  socket.on('get-problem', (roomCodeInput) => {
    const roomCode = String(roomCodeInput || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (room?.problem) {
      socket.emit('problem', room.problem);
    }
  });

  socket.on('submit-code', async (data) => {
    console.log('submit-code received', data.roomCode);
    const { roomCode, code, language } = data;
    const room = rooms[roomCode];

    if (!room?.problem) {
      socket.emit('submission-result', {
        output: 'Problem not found for this room.',
        characterCount: code.length,
        success: false
      });
      return;
    }

    const { testCases } = room.problem;

    let lastOutput = '';
    let allPassed = true;

    for (const testCase of testCases) {
      const input = serializeInput(testCase.input);

      lastOutput = await runCode(
        code,
        language,
        input
      );

      if (!outputsMatch(lastOutput, testCase.expectedOutput)) {
        allPassed = false;
        break;
      }
    }

    socket.emit('submission-result', {
      output: lastOutput,
      characterCount: code.length,
      success: allPassed
    });

    if (!allPassed) return;

    const existingScore = room.scores[socket.id];
    let leaderboardChanged = false;

    if (!existingScore || code.length < existingScore.score) {
      room.scores[socket.id] = {
        score: code.length,
        language,
        submittedAt: Date.now()
      };

      leaderboardChanged = true;
    }

    if (leaderboardChanged) {
      io.to(roomCode).emit('leaderboard-update', room.scores);
    }
  });

  socket.on('get-replay', (roomCodeInput) => {
    const roomCode = String(roomCodeInput || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('replay-data', null);
      return;
    }

    socket.emit('replay-data', {
      replay: room.replay,
      problem: room.problem,
      players: room.players,
      scores: room.scores || {},
      startTime: room.startTime
    });
  });
});

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
