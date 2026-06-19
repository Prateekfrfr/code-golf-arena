import Docker from 'dockerode';
import { PassThrough } from 'stream';

const dockerClient = new Docker({
  socketPath: '//./pipe/docker_engine'
});

const sourceEnv = (code) => `CODE_B64=${Buffer.from(code).toString('base64')}`;

const languageConfigs = {
  python: {
    image: 'python:3.11-alpine',
    cmd: (code) => ['python', '-c', code],
    env: () => []
  },
  javascript: {
    image: 'node:22-alpine',
    cmd: (code) => ['node', '-e', code],
    env: () => []
  },
  cpp: {
    image: 'gcc:14',
    cmd: () => [
      'sh',
      '-lc',
      'printf "%s" "$CODE_B64" | base64 -d > /tmp/main.cpp && g++ /tmp/main.cpp -O2 -std=c++17 -o /tmp/main && /tmp/main'
    ],
    env: (code) => [sourceEnv(code)]
  },
  java: {
    image: 'eclipse-temurin:21-jdk-alpine',
    cmd: () => [
      'sh',
      '-lc',
      'printf "%s" "$CODE_B64" | base64 -d > /tmp/Main.java && javac /tmp/Main.java && java -cp /tmp Main'
    ],
    env: (code) => [sourceEnv(code)]
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
    Cmd: config.cmd(code),
    Env: config.env(code),
    OpenStdin: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    StdinOnce: true,
    Tty: false,
    NetworkDisabled: true,
    HostConfig: {
      Memory: 50 * 1024 * 1024,
      PidsLimit: 64,
      AutoRemove: true,
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
      stdin: true,
      stdout: true,
      stderr: true
    });

    dockerClient.modem.demuxStream(stream, stdoutStream, stderrStream);

    await container.start();

    if (input) {
      stream.write(input);
      if (!input.endsWith('\n')) {
        stream.write('\n');
      }
    }

    stream.end();

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
