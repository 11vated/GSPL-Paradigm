/**
 * Copilot Mode for the GSPL agent autonomy system.
 *
 * In copilot mode, the agent works in parallel with the user — running
 * background tasks (analysis, evolution, suggestions) while the user
 * focuses on interactive work. Tasks run asynchronously and results
 * are collected when ready.
 *
 * @packageDocumentation
 */

/** Status of a background task. */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A task running in the background. */
export interface BackgroundTask {
  /** Unique task identifier. */
  id: string;
  /** Human-readable description of what the task is doing. */
  task: string;
  /** Configuration passed when the task was started. */
  config: Record<string, unknown>;
  /** Current execution status. */
  status: TaskStatus;
  /** ISO timestamp when the task was queued. */
  startedAt: string;
  /** ISO timestamp when the task completed or failed. */
  completedAt?: string;
  /** Progress percentage (0-100) if the task supports progress reporting. */
  progress?: number;
}

/** Result of a completed (or failed) background task. */
export interface TaskResult {
  /** ID of the task this result belongs to. */
  taskId: string;
  /** Whether the task completed successfully. */
  success: boolean;
  /** Result data from the task, if successful. */
  data?: unknown;
  /** Error description, if the task failed. */
  error?: string;
  /** Duration in milliseconds from start to completion. */
  durationMs: number;
}

/**
 * Generate a unique task ID.
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `task_${timestamp}_${random}`;
}

/**
 * Copilot Mode — agent works in parallel with user.
 *
 * The agent can start background tasks that run asynchronously while
 * the user continues interactive work. Results are collected when
 * the user is ready to review them.
 */
export class CopilotMode {
  private readonly tasks: Map<string, BackgroundTask> = new Map();
  private readonly results: Map<string, TaskResult> = new Map();

  /**
   * Start a background task.
   *
   * @param task - Human-readable description of the task
   * @param config - Task configuration and parameters
   * @returns The unique task ID for tracking
   */
  startBackgroundTask(task: string, config: Record<string, unknown> = {}): string {
    const id = generateTaskId();

    const backgroundTask: BackgroundTask = {
      id,
      task,
      config,
      status: 'queued',
      startedAt: new Date().toISOString(),
    };

    this.tasks.set(id, backgroundTask);

    // Transition to running state immediately (actual async execution
    // will be handled by the WebEngine integration layer)
    backgroundTask.status = 'running';

    return id;
  }

  /**
   * Get all currently tracked tasks.
   *
   * @param filter - Optional status filter
   * @returns Array of tasks matching the filter
   */
  getRunningTasks(filter?: TaskStatus): BackgroundTask[] {
    const allTasks = Array.from(this.tasks.values());

    if (filter !== undefined) {
      return allTasks.filter((t) => t.status === filter);
    }

    return allTasks;
  }

  /**
   * Get the result of a completed task.
   *
   * @param taskId - ID of the task to retrieve results for
   * @returns The task result, or undefined if not yet completed
   */
  getResults(taskId: string): TaskResult | undefined {
    return this.results.get(taskId);
  }

  /**
   * Mark a task as completed with results.
   * Called by the execution layer when a background task finishes.
   *
   * @param taskId - ID of the task that completed
   * @param success - Whether the task succeeded
   * @param data - Result data (on success) or error message (on failure)
   */
  completeTask(taskId: string, success: boolean, data?: unknown): void {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(
        `Task "${taskId}" not found. Cannot mark as completed.`,
      );
    }

    if (task.status !== 'running' && task.status !== 'queued') {
      throw new Error(
        `Task "${taskId}" is ${task.status} and cannot be completed.`,
      );
    }

    const now = new Date().toISOString();
    const startTime = new Date(task.startedAt).getTime();
    const endTime = new Date(now).getTime();

    task.status = success ? 'completed' : 'failed';
    task.completedAt = now;
    task.progress = success ? 100 : undefined;

    const result: TaskResult = {
      taskId,
      success,
      durationMs: endTime - startTime,
    };

    if (success) {
      result.data = data;
    } else {
      result.error = typeof data === 'string' ? data : 'Task failed without error details.';
    }

    this.results.set(taskId, result);
  }

  /**
   * Cancel a running or queued task.
   *
   * @param taskId - ID of the task to cancel
   * @throws Error if task not found or already completed
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error(
        `Task "${taskId}" is already ${task.status} and cannot be cancelled.`,
      );
    }

    task.status = 'cancelled';
    task.completedAt = new Date().toISOString();
  }

  /**
   * Update progress on a running task.
   *
   * @param taskId - ID of the task to update
   * @param progress - Progress percentage (0-100)
   */
  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    if (task.status !== 'running') {
      return; // Silently ignore progress updates on non-running tasks
    }

    task.progress = Math.max(0, Math.min(100, progress));
  }

  /** Count of tasks currently in running or queued status. */
  get activeCount(): number {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'running' || t.status === 'queued',
    ).length;
  }

  /** Clear completed, failed, and cancelled tasks and their results. */
  clearFinished(): void {
    const terminalStatuses: TaskStatus[] = ['completed', 'failed', 'cancelled'];

    for (const [id, task] of this.tasks) {
      if (terminalStatuses.includes(task.status)) {
        this.tasks.delete(id);
        this.results.delete(id);
      }
    }
  }
}
