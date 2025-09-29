import chokidar, { FSWatcher } from 'chokidar';
import { Config } from '../core/config';

export class FileWatcher {
  private readonly config: Config;
  private watcher?: FSWatcher | undefined;

  constructor(config: Config) {
    this.config = config;
  }

  async start(onValidate: () => Promise<void>): Promise<void> {
    const watchPatterns = this.getWatchPatterns();

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: this.config.schemas.exclude,
      persistent: true,
      ignoreInitial: false,
    });

    // Debounce validation to avoid running too frequently
    let validationTimeout: NodeJS.Timeout | null = null;
    const debouncedValidate = (): void => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
      validationTimeout = setTimeout(() => {
        void onValidate();
      }, 500); // 500ms debounce
    };

    this.watcher
      .on('add', (path: string) => {
        console.log(`File added: ${path}`);
        debouncedValidate();
      })
      .on('change', (path: string) => {
        console.log(`File changed: ${path}`);
        debouncedValidate();
      })
      .on('unlink', (path: string) => {
        console.log(`File removed: ${path}`);
        debouncedValidate();
      })
      .on('error', (error: unknown) => {
        console.error('Watcher error:', error);
      });

    // Keep the process alive
    return new Promise((resolve) => {
      process.on('SIGINT', () => {
        this.stop();
        resolve();
      });
    });
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
    }
  }

  private getWatchPatterns(): string[] {
    const patterns: string[] = [];

    // Add schema patterns
    patterns.push(...this.config.schemas.patterns);

    // Add target patterns
    if (this.config.targets.mdx) {
      patterns.push(...this.config.targets.mdx.patterns);
    }

    if (this.config.targets.components) {
      patterns.push(...this.config.targets.components.patterns);
    }

    if (this.config.targets.api) {
      patterns.push(...this.config.targets.api.patterns);
    }

    return patterns;
  }
}