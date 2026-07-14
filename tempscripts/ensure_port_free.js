const { execSync } = require('child_process');
const os = require('os');

const port = process.argv[2];
if (!port) {
  console.error('Usage: node ensure_port_free.js <port>');
  process.exit(1);
}

const isWindows = os.platform() === 'win32';

try {
  console.log(`Checking if port ${port} is in use...`);
  if (isWindows) {
    const output = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = output.trim().split('\n');
    const pidsToKill = new Set();
    
    for (const line of lines) {
      if (line.includes(`:${port}`)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          pidsToKill.add(pid);
        }
      }
    }

    for (const pid of pidsToKill) {
      console.log(`Killing process ${pid} using port ${port}...`);
      try {
        execSync(`taskkill /PID ${pid} /F`);
        console.log(`Successfully killed process ${pid}.`);
      } catch (killError) {
        console.error(`Failed to kill process ${pid}: ${killError.message}`);
      }
    }
  } else {
    // macOS / Linux
    try {
      execSync(`lsof -ti:${port} | xargs kill -9`);
      console.log(`Killed processes on port ${port}.`);
    } catch (e) {
      // lsof returns 1 if no process found
      console.log(`Port ${port} appears to be free.`);
    }
  }
} catch (e) {
  if (isWindows) {
    // netstat/findstr returns 1 if nothing found
    console.log(`Port ${port} appears to be free.`);
  }
}
