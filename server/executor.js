import docker from 'dockerode';

const dockerClient = new docker();


export const runCode = async (code, timeout = 5000) => 
    {
        try {
    const [output, container] = await dockerClient.run('python:3.11-alpine', [ 'python', '-c', code ], process.stdout, {
        HostConfig: {
             Memory: 50 * 1024 * 1024}}
        )
        await container.remove();
        return output;
    }
    catch (err) {
        console.error('Error running code in Docker container:', err);
    }

    }
