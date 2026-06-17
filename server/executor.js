import Docker from 'dockerode';
import { PassThrough } from 'stream';

const dockerClient = new Docker({
  socketPath: '//./pipe/docker_engine'
});

const languageConfigs = {
  python: {
    image: 'python:3.11-alpine',
    cmd: (code) => ['python', '-c', code]
  },
  javascript: {
    image: 'node:22-alpine',
    cmd: (code) => ['node', '-e', code]
  }
  // will add cpp, java, etc. later
};

export const runCode = async (code, language = 'python', input = '', timeout = 5000) => {
  const config = languageConfigs[language];

  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const container = await dockerClient.createContainer({
    Image: config.image,
    Cmd: config.cmd(code),
    OpenStdin: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    StdinOnce: true,
    Tty: false,
    HostConfig: {
      Memory: 50 * 1024 * 1024,
      AutoRemove: true
    }
  });

  let output = '';
  let timeoutId;
  let timedOut = false;
  const outputStream = new PassThrough();

  outputStream.on('data', (chunk) => {
    output += chunk.slice(8).toString();
  });

  try {
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true
    });

    stream.pipe(outputStream);

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

    return output.trim();
  } catch (err) {
    console.error('Error running code in Docker container:', err);
    return `Error: ${err.message}`;
  } finally {
    clearTimeout(timeoutId);
    await container.remove({ force: true }).catch(() => {});
  }
};
