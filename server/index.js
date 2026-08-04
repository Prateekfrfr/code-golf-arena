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
import { createPostgresDatabase } from './db/postgres.js';
import {
  createPostgresProblemRepository,
  createPostgresSubmissionRepository,
  createPostgresAuthRepository,
  createPostgresLeaderboardRepository
} from './db/repositories/index.js';
import { AppError, ValidationError } from './errors/index.js';
import {
  AuthenticationError,
  createAuthService
} from './auth/index.js';
import {
  createSessionClearCookie,
  createSessionSetCookie,
  readSessionCookie
} from './auth/httpCookies.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/betterAuth.js';
import {
  createDatabaseProblemProvider,
  createProblemProvider
} from './problemProviders/index.js';
import { createCorrelationId, logger } from './observability/logger.js';
import { toPublicProblem } from './problems/problemProjection.js';
import { createSocketRateLimiter } from './rateLimit/socketRateLimiter.js';
import { createRedisSocketRateLimiter } from './rateLimit/redisSocketRateLimiter.js';
import { createReplayRepository } from './repositories/replayRepository.js';
import { createInMemoryRoomRepository } from './repositories/roomRepository.js';
import { createRedisRoomRepository } from './repositories/redisRoomRepository.js';
import { createScoreRepository } from './repositories/scoreRepository.js';
import { createSubmissionRepository } from './repositories/submissionRepository.js';
import { buildScoreBreakdown } from './scoring/scoreBreakdown.js';
import { calculateScore } from './scoring/scoreEngine.js';
import {
  createRedisClientBoundary,
  wireSocketIoRedisAdapter
} from './redis/redisSocketAdapter.js';
import {
  parseAntiCheatEvent,
  parseCodeUpdate,
  parseRoomCode,
  parseTopic
} from './validation/payloads.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb', strict: true }));
app.use((request, response, next) => {
  const correlationId = createCorrelationId();
  request.correlationId = correlationId;
  response.set('X-Correlation-Id', correlationId);
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      callback(
        isAllowedOrigin(origin) ? null : new Error('Origin is not allowed.'),
        isAllowedOrigin(origin)
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  })
);
app.use((request, response, next) => {
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const origin = request.get('origin');
  const fetchSite = request.get('sec-fetch-site');
  if (
    isStateChanging &&
    (fetchSite === 'cross-site' || (origin && !isAllowedOrigin(origin)))
  ) {
    response.status(403).json({ error: 'Cross-site requests are not allowed.' });
    return;
  }
  next();
});
app.use('/api/auth', (request, response, next) => {
  toNodeHandler(auth)(request, response)
    .then(() => {
      if (!response.headersSent) next();
    })
    .catch(next);
});

app.use(async (request, _response, next) => {
  request.authUser = null;
  try {
    const sessionRes = await auth.api.getSession({ headers: request.headers });
    if (sessionRes?.user) {
      request.authUser = {
        id: sessionRes.user.id,
        email: sessionRes.user.email,
        username: sessionRes.user.username || sessionRes.user.name || sessionRes.user.email.split('@')[0],
        displayName: sessionRes.user.name || sessionRes.user.display_name || sessionRes.user.email,
        avatar: sessionRes.user.image || sessionRes.user.avatar_url || null,
        provider: sessionRes.user.provider || 'credentials',
        role: sessionRes.user.role || 'user',
        createdAt: sessionRes.user.createdAt ? new Date(sessionRes.user.createdAt).getTime() : Date.now()
      };
      next();
      return;
    }
  } catch (_err) {
    // Fall back to legacy session lookup
  }

  const sessionSecret = readSessionCookie(
    request.get('cookie'),
    serverConfig.auth.sessionCookieName
  );
  if (!authService || !sessionSecret) {
    next();
    return;
  }
  try {
    request.authUser = await authService.getSessionUser(sessionSecret);
    next();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      next();
      return;
    }
    next(error);
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: serverConfig.maxCodeBytes + 16 * 1024,
  cors: {
    origin: serverConfig.corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const redisBoundary = serverConfig.ephemeralStateMode === 'redis'
  ? createRedisClientBoundary({
      url: serverConfig.redis.url,
      namespace: serverConfig.redis.keyPrefix,
      requireTls: process.env.NODE_ENV === 'production',
      reconnect: { maxDelayMs: serverConfig.redis.reconnectMaxDelayMs }
    })
  : null;
const redisSocketAdapter = redisBoundary
  ? await wireSocketIoRedisAdapter({ io, redis: redisBoundary })
  : null;
const roomRepository = redisBoundary
  ? createRedisRoomRepository({
      client: redisBoundary.publisher,
      namespace: `${serverConfig.redis.keyPrefix}:room`,
      ttlSeconds: Math.floor(serverConfig.redis.roomTtlMs / 1000)
    })
  : createInMemoryRoomRepository();
const replayRepository = createReplayRepository();
const scoreRepository = createScoreRepository();
const database = serverConfig.persistenceMode === 'postgres'
  ? createPostgresDatabase({
      connectionString: serverConfig.database.url,
      max: serverConfig.database.poolMax,
      idleTimeoutMs: serverConfig.database.idleTimeoutMs,
      connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
    })
  : null;
const postgresProblemRepository = database
  ? createPostgresProblemRepository({ database })
  : null;
const authRepository = database
  ? createPostgresAuthRepository({ database })
  : null;
const authService = authRepository
  ? createAuthService({
      repository: authRepository,
      sessionTtlMs: serverConfig.auth.sessionTtlMs,
      bootstrapAdminEmail: serverConfig.auth.bootstrapAdminEmail || undefined
    })
  : null;
const leaderboardRepository = database
  ? createPostgresLeaderboardRepository({ database })
  : null;
const submissionRepository = database
  ? createPostgresSubmissionRepository({ database })
  : createSubmissionRepository({
      maxPerRoom: serverConfig.maxSubmissionRecordsPerRoom
    });
const problemProvider = postgresProblemRepository
  ? createDatabaseProblemProvider({ repository: postgresProblemRepository })
  : createProblemProvider();
const executionQueue = createExecutionQueue({
  concurrency: serverConfig.executionConcurrency
});
const socketRateLimiter = redisBoundary
  ? createRedisSocketRateLimiter({
      client: redisBoundary.publisher,
      namespace: `${serverConfig.redis.keyPrefix}:socket-rate-limit`,
      onError: (error) => logger.error('redis.rate_limit.failed', { error })
    })
  : createSocketRateLimiter();
const authRateLimiter = createSocketRateLimiter({
  rules: {
    authentication: { limit: 10, windowMs: 15 * 60_000 }
  }
});
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
const getAccountId = (socket) => socket.data.accountId || null;

const createRoomCode = async () => {
  let roomCode;

  do {
    roomCode = Array.from({ length: 8 }, () =>
      ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]
    ).join('');
  } while (await roomRepository.has(roomCode));

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

const consumeRateLimit = async (socket, ruleName) => {
  const identity = `${socket.handshake.address}:${getPlayerId(socket)}`;
  const result = await socketRateLimiter.consume(identity, ruleName);
  if (!result.allowed) emitRateLimitError(socket, result.retryAfterMs);
  return result.allowed;
};

const getRoomOrError = async (socket, roomCodeInput, { requireMember = true } = {}) => {
  let roomCode;

  try {
    roomCode = parseRoomCode(roomCodeInput);
  } catch (error) {
    emitRoomError(socket, error.message);
    return { roomCode: '', room: null };
  }

  const room = await roomRepository.get(roomCode);
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

const scheduleCleanup = async (roomCode, room) => {
  if (room.connectedPlayers.length > 0 || room.cleanupTimer) return;

  room.cleanupTimer = setTimeout(async () => {
    await roomRepository.delete(roomCode);
    Promise.resolve(submissionRepository.deleteRoom(roomCode)).catch((error) => {
      logger.error('submission.cleanup.failed', { roomCode, error });
    });
  }, serverConfig.roomCleanupMs);
  await roomRepository.save(roomCode, room);
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

const recordIntegrityEvent = async (
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

  await roomRepository.save(roomCode, room);
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

const handleCreateRoom = async (socket, options = {}) => {
  if (!getAccountId(socket)) {
    emitRoomError(socket, 'Sign in to create a competitive room.');
    return;
  }
  if (!(await consumeRateLimit(socket, 'roomMutation'))) return;

  const roomCode = await createRoomCode();
  await roomRepository.create(
    roomCode,
    getPlayerId(socket),
    'multiplayer',
    parseTopic(options?.topic)
  );
  socket.join(roomCode);
  socket.emit(SocketEvents.ROOM_CREATED, roomCode);
};

const handleStartSolo = async (socket, options = {}) => {
  if (!(await consumeRateLimit(socket, 'roomMutation'))) return;

  const roomCode = await createRoomCode();
  const room = await roomRepository.create(
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
    await roomRepository.save(roomCode, room);
  } catch (error) {
    await roomRepository.delete(roomCode);
    throw error;
  }

  io.to(roomCode).emit(
    SocketEvents.ROOM_READY,
    getPublicRoomPayload(roomCode, room)
  );
};

const handleJoinRoom = async (socket, roomCodeInput) => {
  if (!getAccountId(socket)) {
    emitRoomError(socket, 'Sign in to join a competitive room.');
    return;
  }
  if (!(await consumeRateLimit(socket, 'roomMutation'))) return;

  const { roomCode, room } = await getRoomOrError(socket, roomCodeInput, {
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

  await roomRepository.clearCleanup(room);
  await roomRepository.addPlayer(room, playerId);
  await roomRepository.markConnected(room, playerId);
  socket.join(roomCode);

  if (room.players.length === 2 && !room.problem) {
    room.problem = await loadJudgeProblem(room.topic);
    room.startTime = Date.now();
    room.status = 'active';
    await roomRepository.save(roomCode, room);
  }

  if (room.players.length === 2) {
    io.to(roomCode).emit(
      SocketEvents.ROOM_READY,
      getPublicRoomPayload(roomCode, room)
    );
  }
};

const handleRejoinRoom = async (socket, roomCodeInput) => {
  if (!(await consumeRateLimit(socket, 'roomRead'))) return;

  const { roomCode, room } = await getRoomOrError(socket, roomCodeInput);
  if (!room) return;

  await roomRepository.clearCleanup(room);
  await roomRepository.markConnected(room, getPlayerId(socket));
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
  if (!(await consumeRateLimit(socket, 'submission'))) return;

  const submission = parseCodeUpdate(payload, serverConfig.maxCodeBytes);
  const { roomCode, room } = await getRoomOrError(socket, submission.roomCode);
  if (!room) return;

  const playerId = getPlayerId(socket);
  const accountId = getAccountId(socket);
  if (!accountId) {
    socket.emit(SocketEvents.SUBMISSION_RESULT, {
      output: 'Sign in to submit code. Your editor remains available in guest mode.',
      characterCount: [...submission.code].length,
      characterBytes: Buffer.byteLength(submission.code, 'utf8'),
      success: false
    });
    return;
  }
  const antiCheatSession = getAntiCheatSession(roomCode, room, playerId);
  // A session may be created before an invalid/no-problem return. Persist it
  // immediately so that a subsequent request handled by another process sees
  // the same anti-cheat state.
  await roomRepository.save(roomCode, room);
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

  const integrityOutcome = await recordIntegrityEvent(
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
  const submissionId = crypto.randomUUID();
  const submittedAt = Date.now();
  const submissionRecord = {
    id: submissionId,
    submittedAt,
    playerId,
    userId: accountId || playerId,
    ...(accountId ? { accountId } : {}),
    problemId: room.problem.slug,
    problemVersion: Number(room.problem.version || 1),
    sourceCode: submission.code,
    language: submission.language,
    success: judgeResult.success,
    status: judgeResult.success ? 'accepted' : 'rejected',
    characterCount: judgeResult.characterBytes,
    characterBytes: judgeResult.characterBytes,
    codePointCount: judgeResult.characterCount,
    runtimeMs: judgeResult.runtimeMs,
    memoryBytes: judgeResult.memoryBytes,
    score: scoreResult.score,
    maxScore: scoreResult.maxScore,
    scoreBreakdown,
    compression,
    compressionScore: compression
      ? Math.round(
          (compression.estimatedSavings * 1_000_000) /
            Math.max(1, compression.sourceLength)
        )
      : null
  };
  const analytics = buildSubmissionAnalytics(
    [...(await submissionRepository.list(roomCode)), submissionRecord],
    {
      userId: accountId || playerId,
      problemId: room.problem.slug,
      submissionId
    }
  );
  const storedSubmission = await submissionRepository.add(roomCode, {
    ...submissionRecord,
    analytics
  });
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
  await roomRepository.save(roomCode, room);

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
      if (error instanceof ValidationError) {
        emitRoomError(socket, error.message);
        return;
      }

      logger.error('socket.handler.failed', {
        correlationId: socket.data.correlationId,
        handler: label,
        error
      });
      emitRoomError(socket, 'The request could not be completed.');
    });
};

io.use((socket, next) => {
  const sessionSecret = readSessionCookie(
    socket.handshake.headers.cookie,
    serverConfig.auth.sessionCookieName
  );
  Promise.resolve()
    .then(async () => {
      try {
        const sessionRes = await auth.api.getSession({ headers: socket.handshake.headers });
        if (sessionRes?.user) {
          return {
            id: sessionRes.user.id,
            email: sessionRes.user.email,
            username: sessionRes.user.username || sessionRes.user.name || sessionRes.user.email.split('@')[0],
            displayName: sessionRes.user.name || sessionRes.user.display_name || sessionRes.user.email,
            avatar: sessionRes.user.image || sessionRes.user.avatar_url || null,
            provider: sessionRes.user.provider || 'credentials',
            role: sessionRes.user.role || 'user'
          };
        }
      } catch (_e) {
        // Fall back to legacy lookup
      }
      if (!authService || !sessionSecret) return null;
      try {
        return await authService.getSessionUser(sessionSecret);
      } catch (error) {
        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          return null;
        }
        throw error;
      }
    })
    .then((account) => {
      const guestId = String(socket.handshake.auth?.guestId || '').trim();
      socket.data.playerId = account?.id ||
        (PLAYER_ID_PATTERN.test(guestId) ? guestId : socket.id);
      socket.data.accountId = account?.id || null;
      socket.data.correlationId = createCorrelationId();
      next();
    })
    .catch((error) => {
      logger.error('socket.authentication.failed', { error });
      next(new Error('Socket authentication is unavailable.'));
    });
});

io.on('connection', (socket) => {
  socket.emit(SocketEvents.SESSION_READY, {
    playerId: getPlayerId(socket)
  });

  socket.on('disconnect', () =>
    runSocketHandler(socket, 'disconnect', async () => {
      const playerId = getPlayerId(socket);
      for (const [roomCode, room] of await roomRepository.values()) {
        await roomRepository.markDisconnected(room, playerId);
        await scheduleCleanup(roomCode, room);
      }
    })
  );

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

  socket.on(SocketEvents.GET_PROBLEM, (roomCodeInput) =>
    runSocketHandler(socket, 'get-problem', async () => {
      if (!(await consumeRateLimit(socket, 'roomRead'))) return;
      const { room } = await getRoomOrError(socket, roomCodeInput);
      if (room?.problem) {
        socket.emit(SocketEvents.PROBLEM, toPublicProblem(room.problem));
      }
    })
  );

  socket.on(SocketEvents.CODE_UPDATE, (payload) =>
    runSocketHandler(socket, 'code-update', async () => {
      if (!(await consumeRateLimit(socket, 'codeUpdate'))) return;
      const update = parseCodeUpdate(payload, serverConfig.maxCodeBytes);
      const { roomCode, room } = await getRoomOrError(socket, update.roomCode);
      if (!room) return;

      socket.to(roomCode).emit(SocketEvents.CODE_UPDATE, {
        playerId: getPlayerId(socket),
        code: update.code,
        language: update.language
      });
      replayRepository.addFrame(room, getPlayerId(socket), update);
      await roomRepository.save(roomCode, room);
    })
  );

  socket.on(SocketEvents.SUBMIT_CODE, (payload) =>
    runSocketHandler(socket, 'submit-code', () =>
      handleSubmitCode(socket, payload)
    )
  );

  socket.on(SocketEvents.GET_REPLAY, (roomCodeInput) =>
    runSocketHandler(socket, 'get-replay', async () => {
      if (!(await consumeRateLimit(socket, 'roomRead'))) return;
      const { room } = await getRoomOrError(socket, roomCodeInput);
      socket.emit(
        SocketEvents.REPLAY_DATA,
        room ? replayRepository.getPayload(room) : null
      );
    })
  );

  socket.on(SocketEvents.GET_ANTI_CHEAT_SUMMARY, (roomCodeInput) =>
    runSocketHandler(socket, 'get-anti-cheat-summary', async () => {
      if (!(await consumeRateLimit(socket, 'roomRead'))) return;
      const { room } = await getRoomOrError(socket, roomCodeInput);
      if (room) {
        socket.emit(
          SocketEvents.ANTI_CHEAT_SUMMARY,
          buildAntiCheatSummary(room)
        );
      }
    })
  );

  socket.on(SocketEvents.ANTI_CHEAT_EVENT, (payload = {}) =>
    runSocketHandler(socket, 'anti-cheat-event', async () => {
      if (!(await consumeRateLimit(socket, 'telemetry'))) return;
      const event = parseAntiCheatEvent(payload, allowedAntiCheatTypes);
      const { roomCode, room } = await getRoomOrError(socket, event.roomCode);
      if (!room) return;
      await recordIntegrityEvent(
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
    problemProvider: serverConfig.persistenceMode === 'postgres' ? 'postgres' : 'local',
    persistence: serverConfig.persistenceMode,
    authentication: authService ? 'postgres-session' : 'guest-only',
    ephemeralState: serverConfig.ephemeralStateMode
  });
});

const requireAuthenticatedUser = (request, response, next) => {
  if (!request.authUser) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  next();
};

const requireProblemAuthor = (request, response, next) => {
  if (!request.authUser) {
    response.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  if (!['problem_setter', 'moderator', 'admin'].includes(request.authUser.role)) {
    response.status(403).json({ error: 'Problem setter access is required.' });
    return;
  }
  next();
};

app.get('/api/auth/me', requireAuthenticatedUser, (request, response) => {
  response.json({ user: request.authUser });
});

app.patch('/api/auth/me', requireAuthenticatedUser, async (request, response, next) => {
  try {
    if (!authService) {
      response.status(503).json({ error: 'Profile updates require database persistence.' });
      return;
    }
    const user = await authService.updateProfile(request.authUser.id, request.body);
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

const requirePersistentLeaderboards = (_request, response, next) => {
  if (!leaderboardRepository) {
    response.status(503).json({ error: 'Leaderboards require PostgreSQL persistence.' });
    return;
  }
  next();
};

app.get('/api/leaderboards/global', requirePersistentLeaderboards, async (request, response, next) => {
  try {
    response.json(await leaderboardRepository.getGlobalLeaderboard(request.query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboards/problems/:slug', requirePersistentLeaderboards, async (request, response, next) => {
  try {
    response.json(await leaderboardRepository.getProblemLeaderboard(request.params.slug, request.query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboards/languages/:language', requirePersistentLeaderboards, async (request, response, next) => {
  try {
    response.json(await leaderboardRepository.getLanguageLeaderboard(request.params.language, request.query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboards/me', requirePersistentLeaderboards, requireAuthenticatedUser, async (request, response, next) => {
  try {
    response.json(await leaderboardRepository.getPersonalLeaderboard(request.authUser.id, request.query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/progress', requirePersistentLeaderboards, requireAuthenticatedUser, async (request, response, next) => {
  try {
    response.json(await leaderboardRepository.getProgress(request.authUser.id, request.query));
  } catch (error) {
    next(error);
  }
});

const problemQueryForRequest = (request) => {
  const solved = String(request.query.solved || '').trim().toLowerCase();
  if (solved && !request.authUser) {
    throw new AuthenticationError('Authentication is required for solved filtering.');
  }
  return {
    search: request.query.search,
    topic: request.query.topic,
    difficulty: request.query.difficulty,
    language: request.query.language,
    tag: request.query.tag,
    solved,
    userId: request.authUser?.id,
    cursor: request.query.cursor,
    limit: request.query.limit
  };
};

app.get('/api/problems', async (request, response, next) => {
  try {
    const result = await problemProvider.listProblems(problemQueryForRequest(request));
    response.set(
      'Cache-Control',
      request.query.solved
        ? 'private, max-age=0'
        : 'public, max-age=30, stale-while-revalidate=120'
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/problems/search', async (request, response, next) => {
  try {
    const result = await problemProvider.listProblems(problemQueryForRequest(request));
    response.set(
      'Cache-Control',
      request.query.solved
        ? 'private, max-age=0'
        : 'public, max-age=30, stale-while-revalidate=120'
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/problems/:slug', async (request, response, next) => {
  try {
    const slug = String(request.params.slug || '').trim().toLowerCase();
    const problem = await problemProvider.getBySlug(slug);
    if (!problem) {
      response.status(404).json({ error: 'Problem not found.' });
      return;
    }
    response.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    response.json(problem);
  } catch (error) {
    next(error);
  }
});

const requireProblemAuthoring = (request, response, next) => {
  if (!postgresProblemRepository) {
    response.status(503).json({ error: 'Problem authoring requires PostgreSQL persistence.' });
    return;
  }
  requireProblemAuthor(request, response, next);
};

const managedProblem = async (slug) =>
  postgresProblemRepository.getBySlug(slug, {
    includeArchived: true,
    includeUnpublished: true
  });

app.get('/api/admin/problems', requireProblemAuthoring, async (request, response, next) => {
  try {
    const result = await postgresProblemRepository.listProblems({
      search: request.query.search,
      difficulty: request.query.difficulty,
      topic: request.query.topic,
      status: request.query.status,
      cursor: request.query.cursor,
      limit: request.query.limit,
      includeNonPublic: true
    });
    response.json({
      ...result,
      items: result.items.map((entry) => entry.problem)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/problems/tags', requireProblemAuthoring, async (_request, response, next) => {
  try {
    response.json({ items: await postgresProblemRepository.listTags() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/problems/:slug', requireProblemAuthoring, async (request, response, next) => {
  try {
    const stored = await managedProblem(request.params.slug);
    if (!stored) {
      response.status(404).json({ error: 'Problem not found.' });
      return;
    }
    response.json({
      problem: stored.problem,
      versions: await postgresProblemRepository.getVersionHistory(stored.slug),
      draft: await postgresProblemRepository.getDraft(stored.slug, request.authUser.id)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/problems', requireProblemAuthoring, async (request, response, next) => {
  try {
    const problem = await postgresProblemRepository.saveAuthoredProblem(
      request.body,
      request.authUser.id
    );
    logger.info('problem.authoring.created', {
      correlationId: request.correlationId,
      userId: request.authUser.id,
      slug: problem.slug
    });
    response.status(201).json({ problem });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/problems/:slug', requireProblemAuthoring, async (request, response, next) => {
  try {
    const slug = String(request.params.slug || '').trim().toLowerCase();
    const stored = await managedProblem(slug);
    if (!stored) {
      response.status(404).json({ error: 'Problem not found.' });
      return;
    }
    const problem = await postgresProblemRepository.saveAuthoredProblem(
      { ...request.body, slug },
      request.authUser.id
    );
    logger.info('problem.authoring.updated', {
      correlationId: request.correlationId,
      userId: request.authUser.id,
      slug,
      version: problem.version
    });
    response.json({ problem });
  } catch (error) {
    next(error);
  }
});

const changeProblemStatus = (status) =>
  async (request, response, next) => {
    try {
      const stored = await managedProblem(request.params.slug);
      if (!stored) {
        response.status(404).json({ error: 'Problem not found.' });
        return;
      }
      const problem = await postgresProblemRepository.saveAuthoredProblem(
        {
          ...stored.problem,
          status,
          visibility: status === 'published'
            ? (request.body?.visibility || stored.problem.visibility || 'public')
            : stored.problem.visibility
        },
        request.authUser.id
      );
      response.json({ problem });
    } catch (error) {
      next(error);
    }
  };

app.post(
  '/api/admin/problems/:slug/publish',
  requireProblemAuthoring,
  changeProblemStatus('published')
);
app.post(
  '/api/admin/problems/:slug/archive',
  requireProblemAuthoring,
  changeProblemStatus('archived')
);

app.put('/api/admin/problems/:slug/draft', requireProblemAuthoring, async (request, response, next) => {
  try {
    const problem = await postgresProblemRepository.saveDraft(
      { ...request.body, slug: String(request.params.slug || '').trim().toLowerCase() },
      request.authUser.id
    );
    response.json({ problem, savedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/problems/:slug', requireProblemAuthoring, async (request, response, next) => {
  try {
    await postgresProblemRepository.softDeleteProblem(request.params.slug);
    logger.info('problem.authoring.deleted', {
      correlationId: request.correlationId,
      userId: request.authUser.id,
      slug: String(request.params.slug || '').trim().toLowerCase()
    });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, _next) => {
  void _next;
  const appError = error instanceof AppError ? error : null;
  logger.error('http.request.failed', {
    correlationId: request.correlationId,
    method: request.method,
    path: request.path,
    error
  });
  response.status(appError?.statusCode ?? 500).json({
    error: appError?.expose ? appError.message : 'Internal server error.'
  });
});

const pruneInterval = typeof socketRateLimiter.prune === 'function'
  ? setInterval(() => socketRateLimiter.prune(), 60_000)
  : null;
pruneInterval?.unref();

const start = async () => {
  httpServer.listen(serverConfig.port, () => {
    logger.info('server.listening', { port: serverConfig.port });
  });
};

start().catch((error) => {
  console.error("\n========== STARTUP ERROR ==========");
  console.error(error);
  console.error(error?.stack);
  console.error("===================================\n");
  process.exit(1);
});

const shutdown = () => {
  if (pruneInterval) clearInterval(pruneInterval);
  io.close(() => {
    httpServer.close(() => {
      Promise.all([database?.close(), redisSocketAdapter?.close()])
        .catch((error) => {
          logger.error('server.shutdown.failed', { error });
        })
        .finally(() => process.exit(0));
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
