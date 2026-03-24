/**
 * Safety Governor for the GSPL agent autonomy system.
 *
 * Controls what the agent can do through risk assessment, rate limiting,
 * and policy enforcement. Every agent operation passes through the governor
 * before execution.
 *
 * @packageDocumentation
 */

/** Risk classification for agent operations. */
export type OperationRisk = 'low' | 'medium' | 'high' | 'critical';

/** Policy that governs agent behavior boundaries. */
export interface SafetyPolicy {
  /** Maximum seed creation/mutation operations per minute. */
  maxSeedsPerMinute: number;
  /** Maximum generations an evolution run can execute. */
  maxEvolutionGenerations: number;
  /** Maximum population size for evolution runs. */
  maxPopulationSize: number;
  /** Domains the agent is allowed to operate in, or 'all'. */
  allowedDomains: string[] | 'all';
  /** Risk levels that require explicit user approval before proceeding. */
  requireApproval: OperationRisk[];
}

/** Default safety policy — permissive but bounded. */
export const DEFAULT_POLICY: SafetyPolicy = {
  maxSeedsPerMinute: 30,
  maxEvolutionGenerations: 100,
  maxPopulationSize: 500,
  allowedDomains: 'all',
  requireApproval: ['high', 'critical'],
};

/** Result of a canProceed check. */
export interface ProceedCheck {
  allowed: boolean;
  reason?: string;
}

/** Record of a single operation for rate-limiting tracking. */
interface OperationRecord {
  operation: string;
  timestamp: number;
}

/** Risk rules mapping operation prefixes to base risk levels. */
const OPERATION_RISK_MAP: Record<string, OperationRisk> = {
  'seed_create': 'low',
  'seed_inspect': 'low',
  'seed_list': 'low',
  'seed_compare': 'low',
  'seed_mutate': 'medium',
  'seed_breed': 'medium',
  'evolution_start': 'high',
  'evolution_status': 'low',
  'evolution_analyze': 'low',
  'evolution_recommend': 'low',
  'forge_artifact': 'medium',
  'forge_preview': 'low',
  'forge_list_types': 'low',
  'analyze_seed': 'low',
  'analyze_population': 'low',
  'analyze_gaps': 'low',
  'predict_emergence': 'low',
  'world_create': 'medium',
  'world_add_entity': 'low',
  'world_simulate': 'medium',
  'world_status': 'low',
  'knowledge_search': 'low',
  'knowledge_suggest': 'low',
  'knowledge_explain': 'low',
};

/** Seed-modifying operations subject to rate limiting. */
const RATE_LIMITED_OPERATIONS: ReadonlySet<string> = new Set([
  'seed_create',
  'seed_mutate',
  'seed_breed',
]);

/**
 * Safety Governor — enforces policy constraints on all agent operations.
 *
 * Provides risk assessment, rate limiting, domain restrictions, and
 * approval gating. The agent's execution loop must consult the governor
 * before performing any tool call.
 */
export class SafetyGovernor {
  private readonly policy: SafetyPolicy;
  private readonly operationLog: OperationRecord[] = [];

  constructor(policy: SafetyPolicy = DEFAULT_POLICY) {
    this.policy = { ...policy };
  }

  /**
   * Assess the risk level of an operation.
   *
   * @param operation - Tool name / operation identifier
   * @param args - Operation arguments (used for contextual risk escalation)
   * @returns The assessed risk level
   */
  assessRisk(operation: string, args: Record<string, unknown>): OperationRisk {
    const baseRisk = OPERATION_RISK_MAP[operation] ?? 'medium';

    // Escalate risk based on argument values
    if (operation === 'evolution_start') {
      const generations = args['generations'] as number | undefined;
      const populationSize = args['populationSize'] as number | undefined;

      if (
        (generations !== undefined && generations > this.policy.maxEvolutionGenerations) ||
        (populationSize !== undefined && populationSize > this.policy.maxPopulationSize)
      ) {
        return 'critical';
      }
    }

    if (operation === 'world_simulate') {
      const ticks = args['ticks'] as number | undefined;
      if (ticks !== undefined && ticks > 50) {
        return this.escalateRisk(baseRisk);
      }
    }

    return baseRisk;
  }

  /**
   * Check whether an operation is allowed under the current policy.
   *
   * @param operation - Tool name / operation identifier
   * @param args - Operation arguments
   * @returns Whether the operation may proceed, with reason if blocked
   */
  canProceed(operation: string, args: Record<string, unknown>): ProceedCheck {
    // Check domain restrictions
    if (this.policy.allowedDomains !== 'all') {
      const domain = args['domain'] as string | undefined;
      if (domain && !this.policy.allowedDomains.includes(domain)) {
        return {
          allowed: false,
          reason: `Domain "${domain}" is not in the allowed domains list: [${this.policy.allowedDomains.join(', ')}].`,
        };
      }
    }

    // Check rate limits for seed-modifying operations
    if (RATE_LIMITED_OPERATIONS.has(operation)) {
      const recentCount = this.getRecentOperationCount(60_000);
      if (recentCount >= this.policy.maxSeedsPerMinute) {
        return {
          allowed: false,
          reason:
            `Rate limit exceeded: ${String(recentCount)}/${String(this.policy.maxSeedsPerMinute)} ` +
            'seed operations per minute. Wait before retrying.',
        };
      }
    }

    // Check evolution parameter limits
    if (operation === 'evolution_start') {
      const generations = args['generations'] as number | undefined;
      if (generations !== undefined && generations > this.policy.maxEvolutionGenerations) {
        return {
          allowed: false,
          reason:
            `Requested ${String(generations)} generations exceeds policy maximum of ` +
            `${String(this.policy.maxEvolutionGenerations)}.`,
        };
      }

      const populationSize = args['populationSize'] as number | undefined;
      if (populationSize !== undefined && populationSize > this.policy.maxPopulationSize) {
        return {
          allowed: false,
          reason:
            `Requested population size ${String(populationSize)} exceeds policy maximum of ` +
            `${String(this.policy.maxPopulationSize)}.`,
        };
      }
    }

    // Check approval requirements
    const risk = this.assessRisk(operation, args);
    if (this.policy.requireApproval.includes(risk)) {
      return {
        allowed: false,
        reason:
          `Operation "${operation}" assessed as "${risk}" risk and requires user approval. ` +
          'Submit through SupervisorMode for approval.',
      };
    }

    return { allowed: true };
  }

  /**
   * Record that an operation was executed (for rate limiting).
   *
   * @param operation - The operation that was performed
   */
  recordOperation(operation: string): void {
    this.operationLog.push({
      operation,
      timestamp: Date.now(),
    });

    // Prune entries older than 2 minutes to prevent unbounded growth
    const cutoff = Date.now() - 120_000;
    const firstValid = this.operationLog.findIndex((r) => r.timestamp >= cutoff);
    if (firstValid > 0) {
      this.operationLog.splice(0, firstValid);
    }
  }

  /** Get the current active policy (read-only copy). */
  getPolicy(): Readonly<SafetyPolicy> {
    return { ...this.policy };
  }

  /**
   * Count rate-limited operations within a time window.
   *
   * @param windowMs - Time window in milliseconds
   * @returns Number of rate-limited operations in the window
   */
  private getRecentOperationCount(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.operationLog.filter(
      (r) => r.timestamp >= cutoff && RATE_LIMITED_OPERATIONS.has(r.operation),
    ).length;
  }

  /**
   * Escalate a risk level by one step.
   *
   * @param risk - Current risk level
   * @returns Next higher risk level
   */
  private escalateRisk(risk: OperationRisk): OperationRisk {
    const levels: OperationRisk[] = ['low', 'medium', 'high', 'critical'];
    const idx = levels.indexOf(risk);
    return levels[Math.min(idx + 1, levels.length - 1)] as OperationRisk;
  }
}
