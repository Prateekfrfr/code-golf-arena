import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import { SocketEvents, AntiCheatEventTypes } from '../shared/events.js';
import {
  ANTI_CHEAT_CONFIG,
  getAntiCheatSummary,
  recordAntiCheatEvent
} from './antiCheat.js';
import { judgeSubmission } from './judge.js';
import { createProblemProvider } from './problemProviders/index.js';
import { createReplayRepository } from './repositories/replayRepository.js';
import { createInMemoryRoomRepository } from './repositories/roomRepository.js';
import { createScoreRepository } from './repositories/scoreRepository.js';

const app = express();
const port = 3001;
const ROOM_CLEANUP_MS = 30 * 60 * 1000;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const roomRepository = createInMemoryRoomRepository();
const replayRepository = createReplayRepository();
const scoreRepository = createScoreRepository();
const problemProvider = createProblemProvider();

const normalizeRoomCode = (roomCodeInput) =>
  String(roomCodeInput || '').trim().toUpperCase();

const normalizeTopic = (topicInput) =>
  String(topicInput || 'random').trim().toLowerCase() || 'random';

const createRoomCode = () => {
  let roomCode;

  do {
    roomCode = crypto.randomUUID()
      .replace(/-/g, '')
      .substring(0, 6)
      .toUpperCase();
  } while (roomRepository.has(roomCode));

  return roomCode;
};

const emitRoomError = (socket, message) => {
  socket.emit(SocketEvents.ROOM_ERROR, message);
  socket.emit('error', message);
};

const getRoomOrError = (socket, roomCodeInput) => {
  const roomCode = normalizeRoomCode(roomCodeInput);
  const room = roomRepository.get(roomCode);

  if (!room) {
    emitRoomError(socket, 'room not found');
    return { roomCode, room: null };
  }

  return { roomCode, room };
};

const scheduleCleanup = (roomCode, room) => {
  if (room.connectedPlayers.length > 0 || room.cleanupTimer) return;

  room.cleanupTimer = setTimeout(() => {
    roomRepository.delete(roomCode);
  }, ROOM_CLEANUP_MS);
};

const broadcastAntiCheatWarning = (roomCode, playerId, type, metadata = {}) => {
  const room = roomRepository.get(roomCode);
  if (!room) return;

  const { stats } = recordAntiCheatEvent(room, playerId, type, metadata);

  io.to(roomCode).emit(SocketEvents.ANTI_CHEAT_WARNING, {
    playerId,
    type,
    stats,
    metadata
  });
};

const handleCreateRoom = (socket, options = {}) => {
  const roomCode = createRoomCode();
  roomRepository.create(
    roomCode,
    socket.id,
    'multiplayer',
    normalizeTopic(options.topic)
  );
  socket.join(roomCode);

  socket.emit(SocketEvents.ROOM_CREATED, roomCode);
  socket.emit('roomCreated', roomCode);
};

const handleStartSolo = async (socket, options = {}) => {
  const roomCode = createRoomCode();
  const room = roomRepository.create(
    roomCode,
    socket.id,
    'solo',
    normalizeTopic(options.topic)
  );
  socket.join(roomCode);

  room.problem = await problemProvider.getRandomProblem(room.topic);
  room.startTime = Date.now();
  room.status = 'active';

  io.to(roomCode).emit(SocketEvents.ROOM_READY, {
    roomCode,
    problem: room.problem,
    players: room.players,
    mode: room.mode,
    topic: room.topic
  });
};

const handleJoinRoom = async (socket, roomCodeInput) => {
  const { roomCode, room } = getRoomOrError(socket, roomCodeInput);
  if (!room) return;

  if (room.mode === 'solo' && !room.players.includes(socket.id)) {
    emitRoomError(socket, 'room is a solo practice session');
    return;
  }

  if (room.players.length >= 2 && !room.players.includes(socket.id)) {
    emitRoomError(socket, 'room is full');
    return;
  }

  roomRepository.clearCleanup(room);
  roomRepository.addPlayer(room, socket.id);
  roomRepository.markConnected(room, socket.id);
  socket.join(roomCode);

  if (room.players.length === 2 && !room.problem) {
    room.problem = await problemProvider.getRandomProblem(room.topic);
    room.startTime = Date.now();
    room.status = 'active';
  }

  if (room.players.length === 2) {
    io.to(roomCode).emit(SocketEvents.ROOM_READY, {
      roomCode,
      problem: room.problem,
      players: room.players,
      mode: room.mode,
      topic: room.topic
    });
  }
};

const handleRejoinRoom = (socket, roomCodeInput) => {
  const { roomCode, room } = getRoomOrError(socket, roomCodeInput);
  if (!room) return;

  roomRepository.clearCleanup(room);
  roomRepository.markConnected(room, socket.id);
  socket.join(roomCode);

  if (room.problem) {
    socket.emit(SocketEvents.PROBLEM, room.problem);
    socket.emit(SocketEvents.ROOM_READY, {
      roomCode,
      problem: room.problem,
      players: room.players,
      mode: room.mode,
      topic: room.topic
    });
  }

  socket.emit(SocketEvents.LEADERBOARD_UPDATE, scoreRepository.getScores(room));
  socket.emit(
    SocketEvents.ANTI_CHEAT_SUMMARY,
    getAntiCheatSummary(room)
  );
};

const handleSubmitCode = async (socket, data) => {
  const { roomCode, room } = getRoomOrError(socket, data?.roomCode);
  if (!room) return;

  const code = String(data?.code || '');
  const language = data?.language || 'python';

  if (!room.problem) {
    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: 'Problem not found for this room.',
      characterCount: code.length,
      success: false
    });
    return;
  }

  const now = Date.now();
  const lastSubmissionAt = room.lastSubmissionAt[socket.id] || 0;
  const elapsed = now - lastSubmissionAt;

  if (elapsed < ANTI_CHEAT_CONFIG.submissionCooldownMs) {
    const cooldownMs = ANTI_CHEAT_CONFIG.submissionCooldownMs - elapsed;

    broadcastAntiCheatWarning(
      roomCode,
      socket.id,
      AntiCheatEventTypes.SUBMISSION_SPAM,
      { cooldownMs }
    );

    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: `Submission cooldown active. Try again in ${Math.ceil(
        cooldownMs / 1000
      )}s.`,
      characterCount: code.length,
      success: false,
      rateLimited: true,
      cooldownMs
    });
    return;
  }

  room.lastSubmissionAt[socket.id] = now;

  const result = await judgeSubmission({
    code,
    language,
    problem: room.problem
  });

  socket.emit(SocketEvents.SUBMISSION_RESULT, result);

  if (!result.success) return;

  const leaderboardChanged = scoreRepository.updateBestScore(room, socket.id, {
    score: code.length,
    language,
    submittedAt: Date.now()
  });

  if (leaderboardChanged) {
    io.to(roomCode).emit(
      SocketEvents.LEADERBOARD_UPDATE,
      scoreRepository.getScores(room)
    );
  }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    for (const [roomCode, room] of roomRepository.values()) {
      roomRepository.markDisconnected(room, socket.id);
      scheduleCleanup(roomCode, room);
    }

    console.log(`User disconnected: ${socket.id}`);
  });

  socket.on(SocketEvents.CREATE_ROOM, (options) => handleCreateRoom(socket, options));
  socket.on('createRoom', () => handleCreateRoom(socket));

  socket.on(SocketEvents.JOIN_ROOM, (roomCode) => {
    handleJoinRoom(socket, roomCode).catch((error) => {
      console.error('join-room failed:', error);
      emitRoomError(socket, 'failed to join room');
    });
  });

  socket.on(SocketEvents.REJOIN_ROOM, (roomCode) => {
    handleRejoinRoom(socket, roomCode);
  });

  socket.on(SocketEvents.GET_PROBLEM, (roomCodeInput) => {
    const { room } = getRoomOrError(socket, roomCodeInput);
    if (room?.problem) {
      socket.emit(SocketEvents.PROBLEM, room.problem);
    }
  });

  socket.on(SocketEvents.CODE_UPDATE, (data) => {
    const { roomCode, room } = getRoomOrError(socket, data?.roomCode);
    if (!room) return;

    const code = String(data?.code || '');
    const language = data?.language || 'python';

    socket.to(roomCode).emit(SocketEvents.CODE_UPDATE, {
      playerId: socket.id,
      code,
      language
    });

    replayRepository.addFrame(room, socket.id, { code, language });
  });

  socket.on(SocketEvents.SUBMIT_CODE, (data) => {
    handleSubmitCode(socket, data).catch((error) => {
      console.error('submit-code failed:', error);
      socket.emit(SocketEvents.SUBMISSION_RESULT, {
        output: 'Internal judging error.',
        characterCount: String(data?.code || '').length,
        success: false
      });
    });
  });

  socket.on(SocketEvents.GET_REPLAY, (roomCodeInput) => {
    const { room } = getRoomOrError(socket, roomCodeInput);
    socket.emit(SocketEvents.REPLAY_DATA, room ? replayRepository.getPayload(room) : null);
  });

  socket.on(SocketEvents.GET_ANTI_CHEAT_SUMMARY, (roomCodeInput) => {
    const { room } = getRoomOrError(socket, roomCodeInput);
    if (room) {
      socket.emit(SocketEvents.ANTI_CHEAT_SUMMARY, getAntiCheatSummary(room));
    }
  });

  socket.on(SocketEvents.ANTI_CHEAT_EVENT, (payload = {}) => {
    const { roomCode, room } = getRoomOrError(socket, payload.roomCode);
    if (!room) return;

    const type = payload.type;
    const metadata = payload.metadata || {};

    if (
      type === AntiCheatEventTypes.TAB_SWITCH ||
      type === AntiCheatEventTypes.LARGE_PASTE
    ) {
      broadcastAntiCheatWarning(roomCode, socket.id, type, metadata);
    }
  });

  socket.on('tab-switch', ({ roomCode }) => {
    broadcastAntiCheatWarning(
      normalizeRoomCode(roomCode),
      socket.id,
      AntiCheatEventTypes.TAB_SWITCH
    );
  });
  socket.on(SocketEvents.START_SOLO, (options) => handleStartSolo(socket, options).catch((error) => {
    console.error('start-solo failed:', error);
    emitRoomError(socket, 'failed to start solo session');
}));
});

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
