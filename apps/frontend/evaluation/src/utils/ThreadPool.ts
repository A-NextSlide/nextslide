/**
 * A simple ThreadPool implementation to limit concurrent async operations
 */
export class ThreadPool {
  private queue: (() => Promise<any>)[] = [];
  private runningTasks: Set<Promise<any>> = new Set();
  private maxConcurrency: number;
  private onTaskComplete: ((result: any) => void) | null = null;
  private onAllTasksComplete: (() => void) | null = null;
  private name: string;
  private static hasRegisteredRejectionHandler = false;

  /**
   * Create a new ThreadPool
   * 
   * @param maxConcurrency Maximum number of tasks to run at once
   * @param name Optional name for this thread pool (for logging)
   */
  constructor(maxConcurrency: number = 3, name: string = 'default') {
    this.maxConcurrency = maxConcurrency;
    this.name = name;
    console.log(`Created ThreadPool '${name}' with ${maxConcurrency} max concurrent tasks`);
    
    // Register global unhandled rejection handler (only once)
    if (!ThreadPool.hasRegisteredRejectionHandler) {
      process.on('unhandledRejection', (reason, promise) => {
        console.error(`CRITICAL: Unhandled Promise Rejection in ThreadPool system:`);
        console.error(`- Reason: ${reason instanceof Error ? reason.stack : String(reason)}`);
        console.error('This might be causing your pipeline to stop silently.');
      });
      ThreadPool.hasRegisteredRejectionHandler = true;
      console.log('Registered global unhandled promise rejection handler');
    }
  }

  /**
   * Set a callback to be called when a task completes
   * 
   * @param callback The callback function to call with the task result
   */
  public setTaskCompleteCallback(callback: (result: any) => void): void {
    this.onTaskComplete = callback;
  }

  /**
   * Set a callback to be called when all tasks are complete
   * 
   * @param callback The callback function to call
   */
  public setAllTasksCompleteCallback(callback: () => void): void {
    this.onAllTasksComplete = callback;
  }

  /**
   * Add a task to the queue and start processing if possible
   * 
   * @param task A function that returns a Promise
   */
  public async addTask<T>(task: () => Promise<T>): Promise<void> {
    this.queue.push(task);
    await this.processNext();
  }

  /**
   * Process the next task in the queue if we have capacity
   */
  private async processNext(): Promise<void> {
    // If we're at max capacity or the queue is empty, do nothing
    if (this.runningTasks.size >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    // Get the next task from the queue
    const task = this.queue.shift();
    if (!task) return;

    try {
      // Create a promise for this task that we can track
      const taskPromise = task().then(result => {
        // Task completed successfully
        if (this.onTaskComplete) {
          try {
            this.onTaskComplete(result);
          } catch (callbackError) {
            console.error(`Error in TaskComplete callback in pool '${this.name}':`, callbackError);
          }
        }
        
        // Remove from running tasks
        this.runningTasks.delete(taskPromise);
        
        // Process next task if there are any in the queue
        this.processNext().catch(processError => {
          console.error(`Error in processNext chain in pool '${this.name}':`, processError);
        });
        
        // Check if all tasks are complete
        if (this.runningTasks.size === 0 && this.queue.length === 0) {
          if (this.onAllTasksComplete) {
            try {
              this.onAllTasksComplete();
            } catch (callbackError) {
              console.error(`Error in AllTasksComplete callback in pool '${this.name}':`, callbackError);
            }
          }
        }
        
        return result;
      }).catch(error => {
        // Task failed
        console.error(`ThreadPool '${this.name}' task error:`, error);
        
        // Remove from running tasks
        this.runningTasks.delete(taskPromise);
        
        // Process next task
        this.processNext().catch(processError => {
          console.error(`Error in processNext chain after task error in pool '${this.name}':`, processError);
        });
        
        // Check if all tasks are complete
        if (this.runningTasks.size === 0 && this.queue.length === 0) {
          if (this.onAllTasksComplete) {
            try {
              this.onAllTasksComplete();
            } catch (callbackError) {
              console.error(`Error in AllTasksComplete callback after error in pool '${this.name}':`, callbackError);
            }
          }
        }
        
        throw error;
      });

      // Add to running tasks
      this.runningTasks.add(taskPromise);
    } catch (error) {
      // This would happen if there was an error creating the task promise itself
      console.error(`Critical error creating task in ThreadPool '${this.name}':`, error);
      
      // Still try to process the next task
      this.processNext().catch(processError => {
        console.error(`Error in processNext chain after critical error in pool '${this.name}':`, processError);
      });
    }
    
    // Process next task (if we're still under max concurrency)
    // Ensure we catch any errors in the recursive processNext call
    try {
      await this.processNext();
    } catch (error) {
      console.error(`Error in follow-up processNext call in pool '${this.name}':`, error);
    }
  }

  /**
   * Wait for all currently queued tasks to complete
   */
  public async waitForAll(): Promise<void> {
    // If no tasks are running or queued, return immediately
    if (this.runningTasks.size === 0 && this.queue.length === 0) {
      return;
    }

    // Otherwise, create a promise that resolves when all tasks are done
    return new Promise((resolve) => {
      this.setAllTasksCompleteCallback(() => {
        resolve();
        // Using null | undefined type check to avoid linter error
        this.onAllTasksComplete = null;
      });
    });
  }

  /**
   * Get the number of tasks waiting in the queue
   */
  public get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the number of tasks currently running
   */
  public get runningSize(): number {
    return this.runningTasks.size;
  }

  /**
   * Change the maximum concurrency
   */
  public setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = maxConcurrency;
    // Try to process more tasks if we increased the limit
    if (this.runningTasks.size < this.maxConcurrency) {
      this.processNext();
    }
  }
}

/**
 * A ThreadPool manager that creates a separate thread pool for each step
 * This allows different steps to have different concurrency limits
 */
export class StepThreadPoolManager {
  private pools: Map<string, ThreadPool> = new Map();
  private defaultConcurrency: number;
  private stepConcurrencyLimits: Record<string, number>;

  /**
   * Create a new StepThreadPoolManager
   * 
   * @param defaultConcurrency Default concurrency for all steps
   * @param stepConcurrencyLimits Optional overrides for specific steps
   */
  constructor(defaultConcurrency: number = 3, stepConcurrencyLimits: Record<string, number> = {}) {
    this.defaultConcurrency = defaultConcurrency;
    this.stepConcurrencyLimits = stepConcurrencyLimits;
    console.log(`Created StepThreadPoolManager with default concurrency: ${defaultConcurrency}`);
    
    if (Object.keys(stepConcurrencyLimits).length > 0) {
      console.log(`Step concurrency limits:`, stepConcurrencyLimits);
    }
  }

  /**
   * Get (or create) a thread pool for a specific step
   * 
   * @param stepName The name of the step
   * @returns A ThreadPool for this step
   */
  getPoolForStep(stepName: string): ThreadPool {
    if (!this.pools.has(stepName)) {
      // Get the concurrency limit for this step (or use default)
      const concurrencyLimit = this.stepConcurrencyLimits[stepName] || this.defaultConcurrency;
      
      // Create a new thread pool for this step
      const pool = new ThreadPool(concurrencyLimit, stepName);
      this.pools.set(stepName, pool);
    }
    
    return this.pools.get(stepName)!;
  }

  /**
   * Add a task to the pool for a specific step
   * 
   * @param stepName The name of the step
   * @param task The task to add
   */
  async addTask<T>(stepName: string, task: () => Promise<T>): Promise<void> {
    const pool = this.getPoolForStep(stepName);
    await pool.addTask(task);
  }

  /**
   * Wait for all tasks in a specific step to complete
   * 
   * @param stepName The name of the step
   */
  async waitForStep(stepName: string): Promise<void> {
    if (this.pools.has(stepName)) {
      await this.pools.get(stepName)!.waitForAll();
    }
  }

  /**
   * Wait for all tasks in all steps to complete
   */
  async waitForAll(): Promise<void> {
    const allPools = Array.from(this.pools.values());
    await Promise.all(allPools.map(pool => pool.waitForAll()));
  }

  /**
   * Set a callback to be called when a task completes for a specific step
   * 
   * @param stepName The name of the step
   * @param callback The callback function to call with the task result
   */
  setTaskCompleteCallback(stepName: string, callback: (result: any) => void): void {
    const pool = this.getPoolForStep(stepName);
    pool.setTaskCompleteCallback(callback);
  }

  /**
   * Update concurrency limit for a specific step
   * 
   * @param stepName The name of the step
   * @param concurrencyLimit The new concurrency limit
   */
  setStepConcurrencyLimit(stepName: string, concurrencyLimit: number): void {
    this.stepConcurrencyLimits[stepName] = concurrencyLimit;
    
    // If the pool already exists, update its concurrency limit
    if (this.pools.has(stepName)) {
      this.pools.get(stepName)!.setMaxConcurrency(concurrencyLimit);
    }
  }

  /**
   * Get pool status for all steps
   */
  getStatus(): Record<string, { running: number, queued: number, concurrencyLimit: number }> {
    const status: Record<string, { running: number, queued: number, concurrencyLimit: number }> = {};
    
    for (const [stepName, pool] of this.pools.entries()) {
      status[stepName] = {
        running: pool.runningSize,
        queued: pool.queueSize,
        concurrencyLimit: this.stepConcurrencyLimits[stepName] || this.defaultConcurrency
      };
    }
    
    return status;
  }
} 