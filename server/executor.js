import Docker from 'dockerode';
import { PassThrough } from 'stream';
import { performance } from 'node:perf_hooks';
import { serverConfig } from './config.js';

const dockerClient = new Docker({
  socketPath: '//./pipe/docker_engine'
});

const sourceEnv = (code) => `CODE_B64=${Buffer.from(code).toString('base64')}`;
const inputEnv = (input) => `INPUT_B64=${Buffer.from(input).toString('base64')}`;

const decodeInput = 'printf "%s" "$INPUT_B64" | base64 -d';
const decodeSource = (target) =>
  `printf "%s" "$CODE_B64" | base64 -d > ${target}`;

const languageConfigs = {
  python: {
    image: process.env.EXECUTOR_PYTHON_IMAGE || 'python:3.11-alpine',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.py')} && ${decodeInput} | python /tmp/main.py`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  javascript: {
    image: process.env.EXECUTOR_JAVASCRIPT_IMAGE || 'node:22-alpine',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.js')} && ${decodeInput} | node /tmp/main.js`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  cpp: {
    image: process.env.EXECUTOR_CPP_IMAGE || 'gcc:14-bookworm',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.cpp')} && g++ /tmp/main.cpp -O2 -std=c++17 -o /tmp/main && ${decodeInput} | /tmp/main`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  java: {
    image: process.env.EXECUTOR_JAVA_IMAGE || 'eclipse-temurin:21-jdk',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/Main.java')} && javac /tmp/Main.java && ${decodeInput} | java -cp /tmp Main`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  }
};

const serializeExecutorError = (error, seen = new Set()) => {
  if (error === null || error === undefined) return null;
  if (typeof error !== 'object') return { message: String(error) };
  if (seen.has(error)) return { message: '[circular cause]' };
  seen.add(error);
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || null,
    code: error.code ?? null,
    errno: error.errno ?? null,
    signal: error.signal ?? null,
    stdout: error.stdout ?? null,
    stderr: error.stderr ?? null,
    exitCode: error.exitCode ?? error.statusCode ?? null,
    cause: serializeExecutorError(error.cause, seen)
  };
};

// The normal application logger deliberately redacts error internals. Executor
// failures need the Docker daemon's exact diagnostic to be actionable, while
// never logging the submitted source or input.
const logExecutorFailure = (context) => {
  process.stderr.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'code-golf-arena',
    event: 'executor.run.failed',
    ...context
  })}\n`);
};

const collectStream = (stream, state, field, limitBytes) => {
  stream.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = Math.max(0, limitBytes - state.bytes);

    if (remaining > 0) {
      state[field] += buffer.subarray(0, remaining).toString('utf8');
      state.bytes += Math.min(buffer.length, remaining);
    }

    if (buffer.length > remaining) state.outputTruncated = true;
  });
};

const createExecutionResult = (overrides = {}) => ({
  stdout: '',
  stderr: '',
  exitCode: null,
  timedOut: false,
  runtimeMs: 0,
  peakMemoryBytes: null,
  outputTruncated: false,
  infrastructureError: null,
  ...overrides
});

export const runCode = async (
  code,
  language = 'python',
  input = '',
  timeout = 5000,
  {
    outputLimitBytes = serverConfig.outputLimitBytes,
    memoryLimitMb = 128
  } = {}
) => {
  const config = languageConfigs[language];
  const boundedMemoryLimitMb = Math.trunc(
    Math.min(1024, Math.max(64, Number(memoryLimitMb) || 128))
  );
  const memoryLimitBytes = boundedMemoryLimitMb * 1024 * 1024;

  if (!config) {
    return createExecutionResult({
      infrastructureError: 'UNSUPPORTED_LANGUAGE'
    });
  }

  let container;
  let timeoutId;
  let containerId = null;
  const command = config.cmd();
  const sourceFilePath = language === 'python'
    ? '/tmp/main.py'
    : language === 'javascript'
      ? '/tmp/main.js'
      : language === 'cpp'
        ? '/tmp/main.cpp'
        : '/tmp/Main.java';
  const compileCommand = language === 'cpp'
    ? 'g++ /tmp/main.cpp -O2 -std=c++17 -o /tmp/main'
    : language === 'java'
      ? 'javac /tmp/Main.java'
      : null;
  const executeCommand = language === 'python'
    ? 'python /tmp/main.py'
    : language === 'javascript'
      ? 'node /tmp/main.js'
      : language === 'cpp'
        ? '/tmp/main'
        : 'java -cp /tmp Main';
  const state = {
    stdout: '',
    stderr: '',
    bytes: 0,
    outputTruncated: false
  };

  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();

  collectStream(stdoutStream, state, 'stdout', outputLimitBytes);
  collectStream(stderrStream, state, 'stderr', outputLimitBytes);

  try {
    container = await dockerClient.createContainer({
      Image: config.image,
      Cmd: command,
      Env: config.env(code, input),
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      NetworkDisabled: true,
      User: '65534:65534',
      WorkingDir: '/tmp',
      HostConfig: {
        Memory: memoryLimitBytes,
        MemorySwap: memoryLimitBytes,
        PidsLimit: 64,
        NanoCpus: 500_000_000,
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Tmpfs: {
          '/tmp': `rw,nosuid,nodev,size=${Math.min(
            96,
            boundedMemoryLimitMb
          )}m,mode=1777,exec`
        }
      }
    });
    containerId = container.id;

    const stream = await container.attach({
      stream: true,
      stdin: false,
      stdout: true,
      stderr: true
    });
    const streamEnded = new Promise((resolve) => {
      stream.once('end', resolve);
      stream.once('close', resolve);
    });

    dockerClient.modem.demuxStream(stream, stdoutStream, stderrStream);

    const startedAt = performance.now();
    await container.start();

    const waitResult = await Promise.race([
      container.wait(),
      new Promise((resolve) => {
        timeoutId = setTimeout(async () => {
          await container.kill().catch(() => {});
          resolve({ timedOut: true, StatusCode: null });
        }, timeout);
      })
    ]);

    const runtimeMs = Math.max(0, performance.now() - startedAt);
    const timedOut = Boolean(waitResult?.timedOut);
    await Promise.race([
      streamEnded,
      new Promise((resolve) => setTimeout(resolve, 250))
    ]);
    const stats = await container.stats({ stream: false }).catch(() => null);
    const peakMemoryBytes =
      stats?.memory_stats?.max_usage ??
      stats?.memory_stats?.usage ??
      null;

    return createExecutionResult({
      stdout: state.stdout.trim(),
      stderr: state.stderr.trim(),
      exitCode: timedOut ? null : (waitResult?.StatusCode ?? null),
      timedOut,
      runtimeMs: Math.round(runtimeMs * 100) / 100,
      peakMemoryBytes,
      outputTruncated: state.outputTruncated
    });
  } catch (err) {
    logExecutorFailure({
      language,
      dockerCommand: command,
      image: config.image,
      workingDirectory: '/tmp',
      temporaryDirectory: '/tmp',
      sourceFilePath,
      bindMountHostPath: null,
      bindMountContainerPath: null,
      compileCommand,
      executeCommand,
      containerId,
      failure: serializeExecutorError(err)
    });
    return createExecutionResult({
      stdout: state.stdout.trim(),
      stderr: state.stderr.trim(),
      outputTruncated: state.outputTruncated,
      infrastructureError: 'EXECUTOR_FAILURE'
    });
  } finally {
    clearTimeout(timeoutId);
    if (container) {
      await container.remove({ force: true }).catch(() => {});
    }
  }
};
