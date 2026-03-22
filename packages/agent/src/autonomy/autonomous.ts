/**
 * Autonomous Mode for the GSPL agent autonomy system.
 *
 * In autonomous mode, the agent operates independently toward a declared goal
 * with explicit constraints. It decomposes the goal into a plan, executes
 * steps sequentially, and tracks progress — all without user intervention
 * (subject to SafetyGovernor limits).
 *
 * @packageDocumentation
 */

/** Status of a single step in the agent's plan. */
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/** A single step in the agent's execution plan. */
export interface PlanStep {
  /** Step index (0-based). */
  index: number;
  /** Human-readable description of what this step does. */
  description: string;
  /** The tool/operation this step will invoke. */
  operation: string;
  /** Arguments for the operation. */
  args: Record<string, unknown>;
  /** Current execution status. */
  status: StepStatus;
  /** Result data from execution, if completed. */
  result?: unknown;
  /** Error message, if failed. */
  error?: string;
  /** IDs of steps that must complete before this one can execute. */
  dependsOn: number[];
}

/** The agent's complete plan for achieving a goal. */
export interface AgentPlan {
  /** The high-level goal being pursued. */
  goal: string;
  /** Constraints the agent must respect during execution. */
  constraints: string[];
  /** Ordered list of steps to execute. */
  steps: PlanStep[];
  /** ISO timestamp when the plan was created. */
  createdAt: string;
}

/** Result of executing a single step. */
export interface StepResult {
  /** Index of the step that was executed. */
  stepIndex: number;
  /** Whether the step succeeded. */
  success: boolean;
  /** Result data on success, error message on failure. */
  data?: unknown;
  /** Error description if the step failed. */
  error?: string;
  /** Whether the plan should continue after this step. */
  continueExecution: boolean;
}

/** Progress report for the autonomous execution. */
export interface ProgressReport {
  /** Number of completed steps. */
  completed: number;
  /** Total steps in the plan. */
  total: number;
  /** Description of the step currently being executed, or "Plan complete". */
  currentStep: string;
  /** Number of failed steps. */
  failed: number;
  /** Number of skipped steps. */
  skipped: number;
}

/**
 * Autonomous Mode — agent operates independently toward a goal.
 *
 * The agent accepts a goal with constraints, decomposes it into an
 * executable plan, and works through the steps autonomously. The user
 * can monitor progress and intervene if needed, but the agent drives
 * execution.
 */
export class AutonomousMode {
  private goal: string = '';
  private constraints: string[] = [];
  private plan: AgentPlan | undefined;
  private currentStepIndex: number = 0;

  /**
   * Set the goal the agent should work toward.
   *
   * @param goal - Natural-language description of the desired outcome
   * @param constraints - Boundaries the agent must respect (e.g. "do not modify existing seeds",
   *   "stay within the character domain", "max 10 seeds")
   */
  setGoal(goal: string, constraints: string[] = []): void {
    if (!goal.trim()) {
      throw new Error('Goal cannot be empty. Provide a clear description of the desired outcome.');
    }

    this.goal = goal;
    this.constraints = [...constraints];
    this.plan = undefined;
    this.currentStepIndex = 0;
  }

  /**
   * Break the current goal into an executable plan of steps.
   *
   * This is a structural decomposition — the actual planning intelligence
   * comes from the agent's reasoning loop (NLP compiler + reflection engine).
   * This method provides the framework for that plan to be populated.
   *
   * @returns The generated plan
   * @throws Error if no goal has been set
   */
  plan_goal(): AgentPlan {
    if (!this.goal) {
      throw new Error('No goal set. Call setGoal() before planning.');
    }

    // Create a skeleton plan. The agent's reasoning loop fills in
    // concrete steps based on the goal and available tools.
    this.plan = {
      goal: this.goal,
      constraints: [...this.constraints],
      steps: [
        {
          index: 0,
          description: `Analyze goal: "${this.goal}"`,
          operation: 'analyze_gaps',
          args: {},
          status: 'pending',
          dependsOn: [],
        },
        {
          index: 1,
          description: 'Develop strategy based on analysis',
          operation: 'knowledge_suggest',
          args: { suggestionType: 'next_steps' },
          status: 'pending',
          dependsOn: [0],
        },
        {
          index: 2,
          description: 'Execute primary action toward goal',
          operation: 'seed_create',
          args: { name: 'goal-seed', domain: 'system' },
          status: 'pending',
          dependsOn: [1],
        },
        {
          index: 3,
          description: 'Validate results against goal criteria',
          operation: 'analyze_seed',
          args: {},
          status: 'pending',
          dependsOn: [2],
        },
      ],
      createdAt: new Date().toISOString(),
    };

    this.currentStepIndex = 0;

    return this.plan;
  }

  /**
   * Replace the current plan with a fully specified one.
   * Used by the agent's reasoning loop to set concrete steps.
   *
   * @param steps - Complete step definitions
   */
  setPlan(steps: Omit<PlanStep, 'status'>[]): void {
    if (!this.goal) {
      throw new Error('No goal set. Call setGoal() before setting a plan.');
    }

    this.plan = {
      goal: this.goal,
      constraints: [...this.constraints],
      steps: steps.map((step) => ({
        ...step,
        status: 'pending' as StepStatus,
      })),
      createdAt: new Date().toISOString(),
    };

    this.currentStepIndex = 0;
  }

  /**
   * Execute the next pending step in the plan.
   *
   * Checks dependencies, marks the step as in-progress, executes it
   * (stub — real execution connects to WebEngine), and records the result.
   *
   * @returns The result of executing the step
   * @throws Error if no plan exists or all steps are complete
   */
  executeNext(): StepResult {
    if (!this.plan) {
      throw new Error('No plan exists. Call plan_goal() or setPlan() first.');
    }

    const nextStep = this.findNextExecutableStep();

    if (!nextStep) {
      return {
        stepIndex: -1,
        success: true,
        data: { message: 'All steps completed or no executable steps remaining.' },
        continueExecution: false,
      };
    }

    // Check dependencies
    const unmetDeps = nextStep.dependsOn.filter((depIndex) => {
      const depStep = this.plan?.steps[depIndex];
      return depStep?.status !== 'completed';
    });

    if (unmetDeps.length > 0) {
      return {
        stepIndex: nextStep.index,
        success: false,
        error:
          `Step ${String(nextStep.index)} has unmet dependencies: ` +
          `steps [${unmetDeps.join(', ')}] must complete first.`,
        continueExecution: true,
      };
    }

    // Mark as in progress
    nextStep.status = 'in_progress';

    // Stub execution — real implementation connects to tool execution
    nextStep.status = 'completed';
    nextStep.result = {
      description:
        `Step ${String(nextStep.index)} ("${nextStep.description}") executed via ` +
        `${nextStep.operation}. Pending WebEngine connection for real execution.`,
    };

    this.currentStepIndex = nextStep.index + 1;

    const hasMore = this.findNextExecutableStep() !== undefined;

    return {
      stepIndex: nextStep.index,
      success: true,
      data: nextStep.result,
      continueExecution: hasMore,
    };
  }

  /**
   * Get current execution progress.
   *
   * @returns Progress report with completed/total counts and current step
   */
  getProgress(): ProgressReport {
    if (!this.plan) {
      return {
        completed: 0,
        total: 0,
        currentStep: 'No plan created yet.',
        failed: 0,
        skipped: 0,
      };
    }

    const steps = this.plan.steps;
    const completed = steps.filter((s) => s.status === 'completed').length;
    const failed = steps.filter((s) => s.status === 'failed').length;
    const skipped = steps.filter((s) => s.status === 'skipped').length;

    const currentStep = this.findNextExecutableStep();
    const currentDescription = currentStep
      ? `Step ${String(currentStep.index)}: ${currentStep.description}`
      : 'Plan complete.';

    return {
      completed,
      total: steps.length,
      currentStep: currentDescription,
      failed,
      skipped,
    };
  }

  /** Get the current plan, if one exists. */
  getPlan(): AgentPlan | undefined {
    return this.plan;
  }

  /** Get the current goal. */
  getGoal(): string {
    return this.goal;
  }

  /** Get the current constraints. */
  getConstraints(): readonly string[] {
    return this.constraints;
  }

  /**
   * Mark a step as failed, optionally skipping dependent steps.
   *
   * @param stepIndex - Index of the step that failed
   * @param error - Error description
   * @param skipDependents - Whether to skip steps that depend on this one (default: true)
   */
  failStep(stepIndex: number, error: string, skipDependents: boolean = true): void {
    if (!this.plan) {
      throw new Error('No plan exists.');
    }

    const step = this.plan.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${String(stepIndex)} does not exist in the plan.`);
    }

    step.status = 'failed';
    step.error = error;

    if (skipDependents) {
      for (const s of this.plan.steps) {
        if (s.dependsOn.includes(stepIndex) && s.status === 'pending') {
          s.status = 'skipped';
          s.error = `Skipped: dependency step ${String(stepIndex)} failed.`;
        }
      }
    }
  }

  /**
   * Find the next step eligible for execution.
   *
   * @returns The next pending step whose dependencies are met, or undefined
   */
  private findNextExecutableStep(): PlanStep | undefined {
    if (!this.plan) {
      return undefined;
    }

    return this.plan.steps.find((step) => {
      if (step.status !== 'pending') {
        return false;
      }

      // All dependencies must be completed
      return step.dependsOn.every((depIndex) => {
        const depStep = this.plan?.steps[depIndex];
        return depStep?.status === 'completed';
      });
    });
  }
}
