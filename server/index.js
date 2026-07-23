import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { SocketEvents, AntiCheatEventTypes } from '../shared/events.js';
import {
  ANTI_CHEAT_CONFIG,
  getAntiCheatSummary,
  recordAntiCheatEvent
} from './antiCheat.js';
import {
  AntiCheatActions,
  createAntiCheatSession,
  createDefaultAntiCheatRuleEngine,
  isSessionInvalidated
} from './antiCheat/index.js';
import { buildSubmissionAnalytics } from './analytics/summaryBuilder.js';
import { createDefaultCompressionAnalyzerRegistry } from './compression/index.js';
import { isAllowedOrigin, serverConfig } from './config.js';
import { createExecutionQueue } from './execution/executionQueue.js';
import { judgeSubmission } from './judge.js';
import { createProblemProvider } from './problemProviders/index.js';
import { toPublicProblem } from './problems/problemProjection.js';
import { createSocketRateLimiter } from './rateLimit/socketRateLimiter.js';
import { createReplayRepository } from './repositories/replayRepository.js';
import { createInMemoryRoomRepository } from './repositories/roomRepository.js';
import { createScoreRepository } from './repositories/scoreRepository.js';
import { createSubmissionRepository } from './repositories/submissionRepository.js';
import { buildScoreBreakdown } from './scoring/scoreBreakdown.js';
import { calculateScore } from './scoring/scoreEngine.js';
import {
  PayloadValidationError,
  parseAntiCheatEvent,
  parseCodeUpdate,
  parseRoomCode,
  parseTopic
} from './validation/payloads.js';

const app = express();
app.disable('x-powered-by');
app.use(
  cors({
    origin(origin, callback) {
      callback(
        isAllowedOrigin(origin) ? null : new Error('Origin is not allowed.'),
        isAllowedOrigin(origin)
      );
    },
    methods: ['GET']
  })
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: serverConfig.maxCodeBytes + 16 * 1024,
  cors: {
    origin: serverConfig.corsOrigins,
    methods: ['GET', 'POST']
  }
});

const roomRepository = createInMemoryRoomRepository();
const replayRepository = createReplayRepository();
const scoreRepository = createScoreRepository();
const submissionRepository = createSubmissionRepository({
  maxPerRoom: serverConfig.maxSubmissionRecordsPerRoom
});
const problemProvider = createProblemProvider();
const executionQueue = createExecutionQueue({
  concurrency: serverConfig.executionConcurrency
});
const socketRateLimiter = createSocketRateLimiter();
const compressionAnalyzers = createDefaultCompressionAnalyzerRegistry();
const antiCheatRuleEngine = createDefaultAntiCheatRuleEngine();
const allowedAntiCheatTypes = new Set([
  AntiCheatEventTypes.FOCUS_LOST,
  AntiCheatEventTypes.FOCUS_GAINED,
  AntiCheatEventTypes.FOCUS_CHECK,
  AntiCheatEventTypes.TAB_SWITCH,
  AntiCheatEventTypes.PASTE,
  AntiCheatEventTypes.LARGE_PASTE,
  AntiCheatEventTypes.DROP_INSERT
]);

const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const getPlayerId = (socket) => socket.data.playerId;

const createRoomCode = () => {
  let roomCode;

  do {
    roomCode = Array.from({ length: 8 }, () =>
      ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]
    ).join('');
  } while (roomRepository.has(roomCode));

  return roomCode;
};

const emitRoomError = (socket, message) => {
  socket.emit(SocketEvents.ROOM_ERROR, message);
};

const emitRateLimitError = (socket, retryAfterMs) => {
  emitRoomError(
    socket,
    `Too many requests. Try again in ${Math.max(
      1,
      Math.ceil(retryAfterMs / 1000)
    )}s.`
  );
};

const consumeRateLimit = (socket, ruleName) => {
  const identity = `${socket.handshake.address}:${getPlayerId(socket)}`;
  const result = socketRateLimiter.consume(identity, ruleName);
  if (!result.allowed) emitRateLimitError(socket, result.retryAfterMs);
  return result.allowed;
};

const getRoomOrError = (socket, roomCodeInput, { requireMember = true } = {}) => {
  let roomCode;

  try {
    roomCode = parseRoomCode(roomCodeInput);
  } catch (error) {
    emitRoomError(socket, error.message);
    return { roomCode: '', room: null };
  }

  const room = roomRepository.get(roomCode);
  if (!room) {
    emitRoomError(socket, 'Room not found.');
    return { roomCode, room: null };
  }

  if (requireMember && !room.players.includes(getPlayerId(socket))) {
    emitRoomError(socket, 'This session is not a member of the room.');
    return { roomCode, room: null };
  }

  return { roomCode, room };
};

const getPublicRoomPayload = (roomCode, room) => ({
  roomCode,
  problem: room.problem ? toPublicProblem(room.problem) : null,
  players: [...room.players],
  connectedPlayers: [...room.connectedPlayers],
  mode: room.mode,
  topic: room.topic,
  status: room.status
});

const loadJudgeProblem = async (topic) => {
  const candidate = await problemProvider.getRandomProblem(topic);
  if (!candidate) throw new Error('No problem matched this topic.');

  const judgeProblem = await problemProvider.getJudgeProblem(candidate.slug);
  if (!judgeProblem) throw new Error('Problem judge bundle was not found.');
  return judgeProblem;
};

const scheduleCleanup = (roomCode, room) => {
  if (room.connectedPlayers.length > 0 || room.cleanupTimer) return;

  room.cleanupTimer = setTimeout(() => {
    roomRepository.delete(roomCode);
    submissionRepository.deleteRoom(roomCode);
  }, serverConfig.roomCleanupMs);
};

const getAntiCheatSession = (roomCode, room, playerId) => {
  const existing = room.antiCheatSessions[playerId];
  if (existing) return existing;

  const session = createAntiCheatSession({
    sessionId: `${roomCode}:${playerId}`,
    playerId,
    startedAt: Date.now()
  });
  room.antiCheatSessions[playerId] = session;
  return session;
};

const recordIntegrityEvent = (
  roomCode,
  room,
  playerId,
  type,
  metadata = {}
) => {
  const currentSession = getAntiCheatSession(roomCode, room, playerId);
  const outcome = antiCheatRuleEngine.processEvent(currentSession, {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    metadata
  });
  room.antiCheatSessions[playerId] = outcome.session;

  const legacyType =
    type === 'submission_attempt' &&
    outcome.decision.violationsAdded > 0
      ? AntiCheatEventTypes.SUBMISSION_SPAM
      : type;
  const { stats } = recordAntiCheatEvent(
    room,
    playerId,
    legacyType,
    metadata
  );
  if (room.antiCheatEvents.length > 200) {
    room.antiCheatEvents.splice(0, room.antiCheatEvents.length - 200);
  }

  if (outcome.decision.action !== AntiCheatActions.NONE) {
    io.to(roomCode).emit(SocketEvents.ANTI_CHEAT_WARNING, {
      playerId,
      type,
      stats,
      metadata,
      decision: outcome.decision,
      session: {
        status: outcome.session.status,
        violationCount: outcome.session.violationCount,
        invalidatedAt: outcome.session.invalidatedAt,
        invalidationReason: outcome.session.invalidationReason
      }
    });
  }

  return outcome;
};

const buildAntiCheatSummary = (room) => ({
  ...getAntiCheatSummary(room),
  sessions: Object.fromEntries(
    Object.entries(room.antiCheatSessions || {}).map(([playerId, session]) => [
      playerId,
      {
        status: session.status,
        violationCount: session.violationCount,
        warningCount: session.warningCount,
        invalidatedAt: session.invalidatedAt,
        invalidationReason: session.invalidationReason
      }
    ])
  )
});

const handleCreateRoom = (socket, options = {}) => {
  if (!consumeRateLimit(socket, 'roomMutation')) return;

  const roomCode = createRoomCode();
  roomRepository.create(
    roomCode,
    getPlayerId(socket),
    'multiplayer',
    parseTopic(options?.topic)
  );
  socket.join(roomCode);
  socket.emit(SocketEvents.ROOM_CREATED, roomCode);
};

const handleStartSolo = async (socket, options = {}) => {
  if (!consumeRateLimit(socket, 'roomMutation')) return;

  const roomCode = createRoomCode();
  const room = roomRepository.create(
    roomCode,
    getPlayerId(socket),
    'solo',
    parseTopic(options?.topic)
  );
  socket.join(roomCode);

  try {
    room.problem = await loadJudgeProblem(room.topic);
    room.startTime = Date.now();
    room.status = 'active';
  } catch (error) {
    roomRepository.delete(roomCode);
    throw error;
  }

  io.to(roomCode).emit(
    SocketEvents.ROOM_READY,
    getPublicRoomPayload(roomCode, room)
  );
};

const handleJoinRoom = async (socket, roomCodeInput) => {
  if (!consumeRateLimit(socket, 'roomMutation')) return;

  const { roomCode, room } = getRoomOrError(socket, roomCodeInput, {
    requireMember: false
  });
  if (!room) return;

  const playerId = getPlayerId(socket);
  if (room.mode === 'solo' && !room.players.includes(playerId)) {
    emitRoomError(socket, 'Room is a solo practice session.');
    return;
  }

  if (room.players.length >= 2 && !room.players.includes(playerId)) {
    emitRoomError(socket, 'Room is full.');
    return;
  }

  roomRepository.clearCleanup(room);
  roomRepository.addPlayer(room, playerId);
  roomRepository.markConnected(room, playerId);
  socket.join(roomCode);

  if (room.players.length === 2 && !room.problem) {
    room.problem = await loadJudgeProblem(room.topic);
    room.startTime = Date.now();
    room.status = 'active';
  }

  if (room.players.length === 2) {
    io.to(roomCode).emit(
      SocketEvents.ROOM_READY,
      getPublicRoomPayload(roomCode, room)
    );
  }
};

const handleRejoinRoom = (socket, roomCodeInput) => {
  if (!consumeRateLimit(socket, 'roomRead')) return;

  const { roomCode, room } = getRoomOrError(socket, roomCodeInput);
  if (!room) return;

  roomRepository.clearCleanup(room);
  roomRepository.markConnected(room, getPlayerId(socket));
  socket.join(roomCode);

  if (room.problem) {
    socket.emit(SocketEvents.PROBLEM, toPublicProblem(room.problem));
    socket.emit(
      SocketEvents.ROOM_READY,
      getPublicRoomPayload(roomCode, room)
    );
  }

  socket.emit(SocketEvents.LEADERBOARD_UPDATE, scoreRepository.getScores(room));
  socket.emit(SocketEvents.ANTI_CHEAT_SUMMARY, buildAntiCheatSummary(room));
};

const handleSubmitCode = async (socket, payload) => {
  if (!consumeRateLimit(socket, 'submission')) return;

  const submission = parseCodeUpdate(payload, serverConfig.maxCodeBytes);
  const { roomCode, room } = getRoomOrError(socket, submission.roomCode);
  if (!room) return;

  const playerId = getPlayerId(socket);
  const antiCheatSession = getAntiCheatSession(roomCode, room, playerId);
  if (isSessionInvalidated(antiCheatSession)) {
    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: 'This submission session has been invalidated.',
      characterCount: [...submission.code].length,
      characterBytes: Buffer.byteLength(submission.code, 'utf8'),
      success: false,
      invalidated: true
    });
    return;
  }

  if (!room.problem) {
    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: 'Problem not found for this room.',
      characterCount: [...submission.code].length,
      characterBytes: Buffer.byteLength(submission.code, 'utf8'),
      success: false
    });
    return;
  }

  const integrityOutcome = recordIntegrityEvent(
    roomCode,
    room,
    playerId,
    'submission_attempt'
  );
  if (integrityOutcome.decision.violationsAdded > 0) {
    const remainingMs =
      integrityOutcome.decision.ruleResults.find(
        (result) => result.ruleId === 'submission_rate'
      )?.details?.remainingMs ?? ANTI_CHEAT_CONFIG.submissionCooldownMs;
    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: `Submission cooldown active. Try again in ${Math.max(
        1,
        Math.ceil(remainingMs / 1000)
      )}s.`,
      characterCount: [...submission.code].length,
      characterBytes: Buffer.byteLength(submission.code, 'utf8'),
      success: false,
      rateLimited: true,
      cooldownMs: remainingMs,
      invalidated: isSessionInvalidated(integrityOutcome.session)
    });
    return;
  }

  const judgeResult = await executionQueue.run(() =>
    judgeSubmission({
      code: submission.code,
      language: submission.language,
      problem: room.problem
    })
  );
  const scoreResult = calculateScore({
    characterCount: judgeResult.characterBytes,
    runtimeMs: Math.round(judgeResult.runtimeMs)
  });
  const scoreBreakdown = buildScoreBreakdown(scoreResult);
  const compression = judgeResult.success
    ? compressionAnalyzers.analyze(submission.language, submission.code)
    : null;
  const storedSubmission = submissionRepository.add(roomCode, {
    playerId,
    userId: playerId,
    problemId: room.problem.slug,
    language: submission.language,
    success: judgeResult.success,
    status: judgeResult.success ? 'accepted' : 'rejected',
    characterCount: judgeResult.characterBytes,
    characterBytes: judgeResult.characterBytes,
    codePointCount: judgeResult.characterCount,
    runtimeMs: judgeResult.runtimeMs,
    memoryBytes: judgeResult.memoryBytes,
    score: scoreResult.score,
    scoreBreakdown,
    compression,
    compressionScore: compression
      ? Math.round(
          (compression.estimatedSavings * 1_000_000) /
            Math.max(1, compression.sourceLength)
        )
      : null
  });
  const analytics = buildSubmissionAnalytics(
    submissionRepository.list(roomCode),
    {
      userId: playerId,
      problemId: room.problem.slug,
      submissionId: storedSubmission.id
    }
  );
  const result = {
    ...judgeResult,
    submissionId: storedSubmission.id,
    score: scoreResult.score,
    maxScore: scoreResult.maxScore,
    scoreBreakdown,
    compression,
    analytics
  };

  socket.emit(SocketEvents.SUBMISSION_RESULT, result);
  if (!judgeResult.success) return;

  const leaderboardChanged = scoreRepository.updateBestScore(
    room,
    playerId,
    {
      submissionId: storedSubmission.id,
      score: scoreResult.score,
      characterCount: judgeResult.characterBytes,
      runtimeMs: judgeResult.runtimeMs,
      memoryBytes: judgeResult.memoryBytes,
      language: submission.language,
      submittedAt: storedSubmission.submittedAt,
      scoreBreakdown
    }
  );

  if (leaderboardChanged) {
    io.to(roomCode).emit(
      SocketEvents.LEADERBOARD_UPDATE,
      scoreRepository.getScores(room)
    );
  }
};

const runSocketHandler = (socket, label, handler) => {
  Promise.resolve()
    .then(handler)
    .catch((error) => {
      if (error instanceof PayloadValidationError) {
        emitRoomError(socket, error.message);
        return;
      }

      console.error(`${label} failed:`, error);
      emitRoomError(socket, 'The request could not be completed.');
    });
};

io.use((socket, next) => {
  const guestId = String(socket.handshake.auth?.guestId || '').trim();
  socket.data.playerId = PLAYER_ID_PATTERN.test(guestId) ? guestId : socket.id;
  next();
});

io.on('connection', (socket) => {
  socket.emit(SocketEvents.SESSION_READY, {
    playerId: getPlayerId(socket)
  });

  socket.on('disconnect', () => {
    const playerId = getPlayerId(socket);
    for (const [roomCode, room] of roomRepository.values()) {
      roomRepository.markDisconnected(room, playerId);
      scheduleCleanup(roomCode, room);
    }
  });

  socket.on(SocketEvents.CREATE_ROOM, (options) =>
    runSocketHandler(socket, 'create-room', () =>
      handleCreateRoom(socket, options)
    )
  );
  socket.on(SocketEvents.START_SOLO, (options) =>
    runSocketHandler(socket, 'start-solo', () =>
      handleStartSolo(socket, options)
    )
  );
  socket.on(SocketEvents.JOIN_ROOM, (roomCode) =>
    runSocketHandler(socket, 'join-room', () =>
      handleJoinRoom(socket, roomCode)
    )
  );
  socket.on(SocketEvents.REJOIN_ROOM, (roomCode) =>
    runSocketHandler(socket, 'rejoin-room', () =>
      handleRejoinRoom(socket, roomCode)
    )
  );

  socket.on(SocketEvents.GET_PROBLEM, (roomCodeInput) => {
    if (!consumeRateLimit(socket, 'roomRead')) return;
    const { room } = getRoomOrError(socket, roomCodeInput);
    if (room?.problem) {
      socket.emit(SocketEvents.PROBLEM, toPublicProblem(room.problem));
    }
  });

  socket.on(SocketEvents.CODE_UPDATE, (payload) =>
    runSocketHandler(socket, 'code-update', () => {
      if (!consumeRateLimit(socket, 'codeUpdate')) return;
      const update = parseCodeUpdate(payload, serverConfig.maxCodeBytes);
      const { roomCode, room } = getRoomOrError(socket, update.roomCode);
      if (!room) return;

      socket.to(roomCode).emit(SocketEvents.CODE_UPDATE, {
        playerId: getPlayerId(socket),
        code: update.code,
        language: update.language
      });
      replayRepository.addFrame(room, getPlayerId(socket), update);
    })
  );

  socket.on(SocketEvents.SUBMIT_CODE, (payload) =>
    runSocketHandler(socket, 'submit-code', () =>
      handleSubmitCode(socket, payload)
    )
  );

  socket.on(SocketEvents.GET_REPLAY, (roomCodeInput) => {
    if (!consumeRateLimit(socket, 'roomRead')) return;
    const { room } = getRoomOrError(socket, roomCodeInput);
    socket.emit(
      SocketEvents.REPLAY_DATA,
      room ? replayRepository.getPayload(room) : null
    );
  });

  socket.on(SocketEvents.GET_ANTI_CHEAT_SUMMARY, (roomCodeInput) => {
    if (!consumeRateLimit(socket, 'roomRead')) return;
    const { room } = getRoomOrError(socket, roomCodeInput);
    if (room) {
      socket.emit(
        SocketEvents.ANTI_CHEAT_SUMMARY,
        buildAntiCheatSummary(room)
      );
    }
  });

  socket.on(SocketEvents.ANTI_CHEAT_EVENT, (payload = {}) =>
    runSocketHandler(socket, 'anti-cheat-event', () => {
      if (!consumeRateLimit(socket, 'telemetry')) return;
      const event = parseAntiCheatEvent(payload, allowedAntiCheatTypes);
      const { roomCode, room } = getRoomOrError(socket, event.roomCode);
      if (!room) return;
      recordIntegrityEvent(
        roomCode,
        room,
        getPlayerId(socket),
        event.type,
        event.metadata
      );
    })
  );
});

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'code-golf-arena',
    executionQueue: executionQueue.getStats(),
    problemProvider: 'local'
  });
});

app.get('/api/problems', async (request, response, next) => {
  try {
    const result = await problemProvider.listProblems({
      search: request.query.search,
      topic: request.query.topic,
      difficulty: request.query.difficulty,
      language: request.query.language,
      tag: request.query.tag,
      cursor: request.query.cursor,
      limit: request.query.limit
    });
    response.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  void _next;
  console.error('HTTP request failed:', error);
  response.status(500).json({ error: 'Internal server error.' });
});

const pruneInterval = setInterval(() => socketRateLimiter.prune(), 60_000);
pruneInterval.unref();

httpServer.listen(serverConfig.port, () => {
  console.log(`Server running on port ${serverConfig.port}`);
});

const shutdown = () => {
  clearInterval(pruneInterval);
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
