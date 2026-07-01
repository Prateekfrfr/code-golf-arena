import Docker from 'dockerode';
import { PassThrough } from 'stream';

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
    image: 'python:3.11-alpine',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.py')} && ${decodeInput} | python /tmp/main.py`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  javascript: {
    image: 'node:22-alpine',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.js')} && ${decodeInput} | node /tmp/main.js`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  cpp: {
   image: 'gcc:latest',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/main.cpp')} && g++ /tmp/main.cpp -O2 -std=c++17 -o /tmp/main && ${decodeInput} | /tmp/main`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  },
  java: {
    image: 'eclipse-temurin:21-jdk-alpine',
    cmd: () => [
      'sh',
      '-lc',
      `${decodeSource('/tmp/Main.java')} && javac /tmp/Main.java && ${decodeInput} | java -cp /tmp Main`
    ],
    env: (code, input) => [sourceEnv(code), inputEnv(input)]
  }
};

const collectStream = (stream, onData) => {
  stream.on('data', (chunk) => {
    onData(chunk.toString());
  });
};

export const runCode = async (
  code,
  language = 'python',
  input = '',
  timeout = 5000
) => {
  const config = languageConfigs[language];

  if (!config) {
    return `Error: Unsupported language: ${language}`;
  }

  const container = await dockerClient.createContainer({
    Image: config.image,
    Cmd: config.cmd(),
    Env: config.env(code, input),
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    NetworkDisabled: true,
    HostConfig: {
      Memory: 50 * 1024 * 1024,
      PidsLimit: 64,
      NetworkMode: 'none'
    }
  });

  let stdout = '';
  let stderr = '';
  let timeoutId;
  let timedOut = false;

  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();

  collectStream(stdoutStream, (chunk) => {
    stdout += chunk;
  });

  collectStream(stderrStream, (chunk) => {
    stderr += chunk;
  });

  try {
    const stream = await container.attach({
      stream: true,
      stdin: false,
      stdout: true,
      stderr: true
    });

    dockerClient.modem.demuxStream(stream, stdoutStream, stderrStream);

    await container.start();

    await Promise.race([
      container.wait(),
      new Promise((resolve) => {
        timeoutId = setTimeout(async () => {
          timedOut = true;
          await container.kill().catch(() => {});
          resolve(null);
        }, timeout);
      })
    ]);

    if (timedOut) {
      return `Error: execution timed out after ${timeout}ms`;
    }

    return (stdout || stderr).trim();
  } catch (err) {
    console.error('Error running code in Docker container:', err);
    return `Error: ${err.message}`;
  } finally {
    clearTimeout(timeoutId);
    await container.remove({ force: true }).catch(() => {});
  }
};
