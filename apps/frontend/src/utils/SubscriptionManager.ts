/**
 * A reliable subscription management utility to track and control real-time subscriptions
 * without relying on unreliable timeout-based logic or global variables.
 */
export class SubscriptionManager {
  private counter = 0;
  private isPaused = false;
  private setupCallback: () => void;
  private cleanupCallback: () => void;
  private lastPauseTime = 0;
  private readonly minimumPauseDuration = 500; // Minimum time in ms to remain paused

  /**
   * Creates a new SubscriptionManager
   * 
   * @param setupCallback Function to call when resuming subscriptions
   * @param cleanupCallback Function to call when pausing subscriptions
   */
  constructor(setupCallback: () => void, cleanupCallback: () => void) {
    this.setupCallback = setupCallback;
    this.cleanupCallback = cleanupCallback;
  }

  /**
   * Pause the subscription, accumulating pause requests
   */
  pause(): void {
    this.counter++;
    this.lastPauseTime = Date.now();
    
    if (!this.isPaused) {
      try {
        this.cleanupCallback();
        this.isPaused = true;
      } catch (error) {
        console.error("[SubscriptionManager] Error pausing subscription:", error);
      }
    }
  }

  /**
   * Resume the subscription if all pause requests are resolved
   */
  resume(): void {
    // Decrement counter, ensuring it doesn't go below 0
    this.counter = Math.max(0, this.counter - 1);
    
    // Only resume if all pause requests are resolved
    if (this.counter === 0 && this.isPaused) {
      // Ensure minimum pause duration to avoid rapid toggles
      const timeSincePause = Date.now() - this.lastPauseTime;
      
      if (timeSincePause < this.minimumPauseDuration) {
        // If not enough time has passed, schedule a delayed resume
        setTimeout(() => this.attemptResume(), this.minimumPauseDuration - timeSincePause);
      } else {
        this.attemptResume();
      }
    }
  }

  /**
   * Attempt to resume the subscription
   */
  private attemptResume(): void {
    // Double-check counter in case more pauses happened during timeout
    if (this.counter === 0 && this.isPaused) {
      try {
        this.setupCallback();
        this.isPaused = false;
      } catch (error) {
        console.error("[SubscriptionManager] Error resuming subscription:", error);
      }
    }
  }

  /**
   * Forces subscription to resume regardless of counter
   */
  forceResume(): void {
    this.counter = 0;
    
    if (this.isPaused) {
      try {
        this.setupCallback();
        this.isPaused = false;
      } catch (error) {
        console.error("[SubscriptionManager] Error force-resuming subscription:", error);
      }
    }
  }

  /**
   * Check if the subscription is currently paused
   */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Reset the manager state
   */
  reset(): void {
    this.counter = 0;
    
    if (this.isPaused) {
      try {
        this.setupCallback();
        this.isPaused = false;
      } catch (error) {
        console.error("[SubscriptionManager] Error resetting subscription:", error);
      }
    }
  }
}