/**
 * Polling Service with Exponential Backoff.
 * This follows the same pattern as other crud-web-apps (Angular version).
 * 
 * The service polls an API endpoint at increasing intervals (exponential backoff)
 * to efficiently check for updates without overwhelming the server.
 * 
 * Interval pattern: 1s → 2s → 4s → 8s (max)
 * When data changes, interval resets to 1s for faster updates.
 */

export interface PollerConfig {
  initialInterval?: number;  // Initial polling interval in ms (default: 1000)
  maxInterval?: number;      // Maximum polling interval in ms (default: 8000)
  retries?: number;          // Number of retries before increasing interval (default: 1)
}

export interface PollerResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

const DEFAULT_CONFIG: Required<PollerConfig> = {
  initialInterval: 1000,
  maxInterval: 8000,
  retries: 1,
};

/**
 * Deep comparison of two values to detect changes
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    
    if (aKeys.length !== bKeys.length) return false;
    
    return aKeys.every(key => 
      isEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }
  
  return false;
}

export type PollerCallback<T> = (result: PollerResult<T>) => void;
export type FetchFunction<T> = () => Promise<T>;

/**
 * Poller class that implements exponential backoff polling
 */
export class Poller<T> {
  private config: Required<PollerConfig>;
  private currentInterval: number;
  private remainingRetries: number;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentData: T | null = null;
  private isRunning = false;
  private callback: PollerCallback<T> | null = null;
  private fetchFn: FetchFunction<T>;

  constructor(
    fetchFn: FetchFunction<T>,
    callback: PollerCallback<T>,
    config: PollerConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentInterval = this.config.initialInterval;
    this.remainingRetries = this.config.retries + 1;
    this.fetchFn = fetchFn;
    this.callback = callback;
  }

  /**
   * Start polling
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.currentInterval = this.config.initialInterval;
    this.remainingRetries = this.config.retries + 1;
    
    // Execute immediately, then schedule next poll
    this.poll();
  }

  /**
   * Stop polling
   */
  public stop(): void {
    this.isRunning = false;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    // Clear callback to prevent any pending async calls from triggering updates
    this.callback = null;
  }

  /**
   * Reset polling interval (called when data changes or manually)
   */
  public reset(): void {
    this.currentInterval = this.config.initialInterval;
    this.remainingRetries = this.config.retries + 1;
    
    // Restart if running
    if (this.isRunning) {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      this.poll();
    }
  }

  /**
   * Force an immediate poll
   */
  public refresh(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    this.poll();
  }

  /**
   * Execute a single poll
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Notify loading state
    this.notifyCallback({
      data: this.currentData,
      error: null,
      isLoading: true,
    });

    try {
      const newData = await this.fetchFn();
      
      // Check if data has changed
      const dataChanged = !isEqual(newData, this.currentData);
      
      if (dataChanged) {
        this.currentData = newData;
        
        // Reset interval when data changes
        if (this.currentData !== null) {
          this.currentInterval = this.config.initialInterval;
          this.remainingRetries = this.config.retries + 1;
        }
      } else {
        // Data hasn't changed, apply exponential backoff
        this.remainingRetries--;
        
        if (this.remainingRetries === 0) {
          this.remainingRetries = this.config.retries;
          this.currentInterval = Math.min(
            this.currentInterval * 2,
            this.config.maxInterval
          );
        }
      }

      // Notify success
      this.notifyCallback({
        data: this.currentData,
        error: null,
        isLoading: false,
      });

    } catch (error) {
      // Notify error but keep polling
      this.notifyCallback({
        data: this.currentData,
        error: error instanceof Error ? error : new Error(String(error)),
        isLoading: false,
      });
    }

    // Schedule next poll
    this.scheduleNextPoll();
  }

  /**
   * Schedule the next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.timeoutId = setTimeout(() => {
      this.poll();
    }, this.currentInterval);
  }

  /**
   * Notify callback with result
   */
  private notifyCallback(result: PollerResult<T>): void {
    if (this.callback) {
      try {
        this.callback(result);
      } catch (error) {
        console.error('Error in poller callback:', error);
      }
    }
  }

  /**
   * Get current interval (for debugging/testing)
   */
  public getCurrentInterval(): number {
    return this.currentInterval;
  }
}

/**
 * Create a poller instance
 */
export function createPoller<T>(
  fetchFn: FetchFunction<T>,
  callback: PollerCallback<T>,
  config?: PollerConfig
): Poller<T> {
  return new Poller(fetchFn, callback, config);
}

/**
 * PollerService - manages multiple pollers
 * This is a singleton service that can manage polling for different resources
 */
class PollerService {
  private pollers = new Map<string, Poller<unknown>>();

  /**
   * Create and start a new poller
   */
  public create<T>(
    key: string,
    fetchFn: FetchFunction<T>,
    callback: PollerCallback<T>,
    config?: PollerConfig
  ): Poller<T> {
    // Stop existing poller with same key
    this.stop(key);

    const poller = new Poller<T>(fetchFn, callback, config);
    this.pollers.set(key, poller as Poller<unknown>);
    poller.start();
    
    return poller;
  }

  /**
   * Stop a poller by key
   */
  public stop(key: string): void {
    const poller = this.pollers.get(key);
    if (poller) {
      poller.stop();
      this.pollers.delete(key);
    }
  }

  /**
   * Stop all pollers
   */
  public stopAll(): void {
    this.pollers.forEach((poller) => poller.stop());
    this.pollers.clear();
  }

  /**
   * Refresh a poller by key
   */
  public refresh(key: string): void {
    const poller = this.pollers.get(key);
    if (poller) {
      poller.refresh();
    }
  }

  /**
   * Reset a poller by key
   */
  public reset(key: string): void {
    const poller = this.pollers.get(key);
    if (poller) {
      poller.reset();
    }
  }
}

// Export singleton instance
export const pollerService = new PollerService();

export default pollerService;
