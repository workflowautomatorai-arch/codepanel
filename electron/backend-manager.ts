import { ChildProcess, spawn, execFile } from 'child_process';
import { app, dialog } from 'electron';
import path from 'path';
import http from 'http';

const HEALTH_CHECK_URL = 'http://localhost:3000/health';
const HEALTH_CHECK_INTERVAL = 500; // ms
const HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 5000; // 5 seconds for graceful shutdown

class BackendManager {
  private process: ChildProcess | null = null;
  private isReady = false;
  private restartAttempted = false;

  /**
   * Get the path to the Python executable
   */
  private getPythonPath(): string {
    const isDev = !app.isPackaged;

    if (isDev) {
      // Development: use venv Python
      if (process.platform === 'win32') {
        return path.join(process.cwd(), 'backend', 'venv', 'Scripts', 'python.exe');
      } else {
        return path.join(process.cwd(), 'backend', 'venv', 'bin', 'python');
      }
    } else {
      // Production: use system Python
      return process.platform === 'win32' ? 'python' : 'python3';
    }
  }

  /**
   * Get the backend directory path
   */
  private getBackendDir(): string {
    const isDev = !app.isPackaged;

    if (isDev) {
      return path.join(process.cwd(), 'backend');
    } else {
      // Production: backend is in resources
      return path.join(process.resourcesPath, 'backend');
    }
  }

  /**
   * Check if the backend health endpoint is responding
   */
  private checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(HEALTH_CHECK_URL, (res) => {
        if (res.statusCode === 200) {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.status === 'OK');
            } catch {
              resolve(false);
            }
          });
        } else {
          resolve(false);
        }
      });

      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Wait for the backend to become healthy
   */
  private async waitForHealth(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT) {
      if (await this.checkHealth()) {
        this.isReady = true;
        console.log('[BackendManager] Backend is healthy and ready');
        return;
      }

      // Check if process died
      if (this.process?.exitCode !== null) {
        throw new Error('Backend process exited unexpectedly');
      }

      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
    }

    throw new Error(`Backend failed to become healthy within ${HEALTH_CHECK_TIMEOUT / 1000} seconds`);
  }

  /**
   * Start the Python backend server
   */
  async start(): Promise<void> {
    const pythonPath = this.getPythonPath();
    const backendDir = this.getBackendDir();
    const serverScript = path.join(backendDir, 'server.py');

    console.log('[BackendManager] Starting backend...');
    console.log(`[BackendManager] Python: ${pythonPath}`);
    console.log(`[BackendManager] Backend dir: ${backendDir}`);
    console.log(`[BackendManager] Server script: ${serverScript}`);

    try {
      // Spawn the Python process
      this.process = spawn(pythonPath, [serverScript], {
        cwd: backendDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: false,
      });

      // Pipe stdout to console
      this.process.stdout?.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
      });

      // Pipe stderr to console
      this.process.stderr?.on('data', (data) => {
        console.error(`[Backend] ${data.toString().trim()}`);
      });

      // Handle process errors
      this.process.on('error', (err) => {
        console.error('[BackendManager] Failed to start backend:', err.message);
        this.handleStartError(err);
      });

      // Handle unexpected exit
      this.process.on('exit', (code, signal) => {
        console.log(`[BackendManager] Backend exited with code ${code}, signal ${signal}`);
        this.isReady = false;

        // Attempt restart once if it crashed unexpectedly
        if (code !== 0 && code !== null && !this.restartAttempted) {
          console.log('[BackendManager] Attempting to restart backend...');
          this.restartAttempted = true;
          this.process = null;
          this.start().catch((err) => {
            console.error('[BackendManager] Restart failed:', err);
            this.showErrorDialog('Backend crashed and failed to restart. Please restart the application.');
          });
        }
      });

      // Wait for health check
      await this.waitForHealth();
      console.log('[BackendManager] Backend started successfully');
    } catch (err) {
      this.handleStartError(err as Error);
      throw err;
    }
  }

  /**
   * Handle startup errors with user-friendly dialogs
   */
  private handleStartError(err: Error): void {
    const message = err.message.toLowerCase();

    if (message.includes('enoent') || message.includes('not found')) {
      this.showErrorDialog(
        'Python not found. Please ensure Python 3.x is installed and available in your PATH.\n\n' +
        'For development, run: cd backend && python -m venv venv && venv\\Scripts\\pip install -r requirements.txt'
      );
    } else if (message.includes('eaddrinuse') || message.includes('address already in use')) {
      this.showErrorDialog(
        'Port 3000 is already in use. Please close any other applications using this port and restart.'
      );
    } else if (message.includes('timeout') || message.includes('healthy')) {
      this.showErrorDialog(
        'Backend failed to start within the expected time.\n\n' +
        'Please check the console logs for more details.'
      );
    } else {
      this.showErrorDialog(`Backend failed to start: ${err.message}`);
    }
  }

  /**
   * Show an error dialog to the user
   */
  private showErrorDialog(message: string): void {
    dialog.showErrorBox('Backend Error', message);
  }

  /**
   * Stop the Python backend server gracefully
   */
  async stop(): Promise<void> {
    if (!this.process) {
      console.log('[BackendManager] No backend process to stop');
      return;
    }

    console.log('[BackendManager] Stopping backend...');
    this.isReady = false;

    const pid = this.process.pid;
    if (!pid) {
      console.log('[BackendManager] No PID available');
      return;
    }

    try {
      if (process.platform === 'win32') {
        // Windows: use taskkill to kill process tree
        await this.killWindows(pid);
      } else {
        // Unix: send SIGTERM, then SIGKILL if needed
        await this.killUnix(pid);
      }

      this.process = null;
      console.log('[BackendManager] Backend stopped');
    } catch (err) {
      console.error('[BackendManager] Error stopping backend:', err);
      // Force kill as last resort
      try {
        this.process?.kill('SIGKILL');
      } catch {
        // Ignore
      }
      this.process = null;
    }
  }

  /**
   * Kill process on Windows using taskkill (using execFile for safety)
   */
  private killWindows(pid: number): Promise<void> {
    return new Promise((resolve) => {
      // Use execFile with explicit arguments to prevent command injection
      execFile('taskkill', ['/pid', pid.toString(), '/T', '/F'], (err) => {
        if (err) {
          // Process might already be dead
          console.log('[BackendManager] taskkill error (process may already be stopped):', err.message);
        }
        resolve();
      });
    });
  }

  /**
   * Kill process on Unix with graceful shutdown
   */
  private killUnix(pid: number): Promise<void> {
    return new Promise((resolve) => {
      // Send SIGTERM for graceful shutdown
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        resolve();
        return;
      }

      // Wait for graceful shutdown or force kill
      const timeout = setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already dead
        }
        resolve();
      }, SHUTDOWN_TIMEOUT);

      // Check if process exited
      const checkInterval = setInterval(() => {
        try {
          // This throws if process doesn't exist
          process.kill(pid, 0);
        } catch {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Check if the backend is currently healthy
   */
  isHealthy(): boolean {
    return this.isReady && this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get the current backend process (for debugging)
   */
  getProcess(): ChildProcess | null {
    return this.process;
  }
}

// Export singleton instance
export const backendManager = new BackendManager();
