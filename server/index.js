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

const serializeInput = (input) => {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
};

const normalizeOutput = (value) => {
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
};

const outputsMatch = (actual, expected) => {
  if (actual == null ) return false;

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
    for(const roomCode in rooms){
      const room = rooms[roomCode];
      room.players = room.players.filter(
        id => id !== socket.id
      );
      if(room.players.length === 0){
        delete rooms[roomCode];
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
    } else {
      rooms[roomCode] = { players: [] };
      socket.join(roomCode);
      rooms[roomCode].players.push(socket.id);
      socket.emit('roomCreated', roomCode);
    }
  });

  socket.on('join-room', (roomCode) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('error', 'room not found');
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error', 'room is full');
      return;
    }

    room.players.push(socket.id);
    socket.join(roomCode);

    const problem = problems[Math.floor(Math.random() * problems.length)];
    room.problem = problem;

    io.to(roomCode).emit('room-ready', {
      roomCode,
      problem
    });
  });

  socket.on('code-update', (data) => {
    const { roomCode, code } = data;
    socket.to(roomCode).emit('code-update', code);
  });

  socket.on('get-problem', (roomCode) => {
    const room = rooms[roomCode];

    if (room && room.problem) {
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

      
      if (
        !outputsMatch(
          lastOutput,
          testCase.expectedOutput
        )
      ) {
        allPassed = false;
        break;
      }
    }

    socket.emit('submission-result', {
      output: lastOutput,
      characterCount: code.length,
      success: allPassed
    });

    if (allPassed) {
      room.scores = room.scores || {};
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
        io.to(roomCode).emit(
          'leaderboard-update',
          room.scores
        );
      }}
          
        });
});


httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});