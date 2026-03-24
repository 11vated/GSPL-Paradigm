/**
 * Supervisor Mode for the GSPL agent autonomy system.
 *
 * In supervisor mode, the agent proposes actions and waits for explicit
 * user approval before executing. This is the safest autonomy level —
 * the user maintains full control over every operation.
 *
 * @packageDocumentation
 */

/** Status of a proposed action in the approval queue. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** An action proposed by the agent, awaiting user decision. */
export interface ProposedAction {
  /** Unique identifier for this proposal. */
  id: string;
  /** The tool/operation name the agent wants to execute. */
  action: string;
  /** The agent's reasoning for why this action should be taken. */
  reasoning: string;
  /** Arguments the agent would pass to the tool. */
  args: Record<string, unknown>;
  /** Current approval status. */
  status: ProposalStatus;
  /** ISO timestamp when the proposal was created. */
  createdAt: string;
  /** ISO timestamp when the proposal was resolved (approved/rejected). */
  resolvedAt?: string;
  /** Reason for rejection, if rejected. */
  rejectionReason?: string;
}

/**
 * Generate a unique proposal ID.
 * Uses timestamp + random suffix for uniqueness without external dependencies.
 */
function generateProposalId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `prop_${timestamp}_${random}`;
}

/**
 * Supervisor Mode — agent suggests, user approves.
 *
 * The agent queues proposed actions with reasoning. The user reviews
 * the queue and approves or rejects each proposal. Only approved
 * proposals are eligible for execution.
 */
export class SupervisorMode {
  private readonly proposals: Map<string, ProposedAction> = new Map();

  /**
   * Propose an action for user approval.
   *
   * @param action - Tool/operation name to execute
   * @param reasoning - Why the agent believes this action is appropriate
   * @param args - Arguments to pass to the tool if approved
   * @returns The created proposal with its assigned ID
   */
  proposeAction(
    action: string,
    reasoning: string,
    args: Record<string, unknown> = {},
  ): ProposedAction {
    const proposal: ProposedAction = {
      id: generateProposalId(),
      action,
      reasoning,
      args,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  /**
   * Get all proposals currently in the queue.
   * Returns proposals in creation order (oldest first).
   *
   * @param filter - Optional status filter
   * @returns Array of proposals matching the filter
   */
  getQueue(filter?: ProposalStatus): ProposedAction[] {
    const allProposals = Array.from(this.proposals.values());

    if (filter !== undefined) {
      return allProposals.filter((p) => p.status === filter);
    }

    return allProposals;
  }

  /**
   * Approve a pending proposal, making it eligible for execution.
   *
   * @param id - Proposal ID to approve
   * @throws Error if proposal not found or not in pending status
   */
  approve(id: string): void {
    const proposal = this.proposals.get(id);

    if (!proposal) {
      throw new Error(
        `Proposal "${id}" not found. Use getQueue() to see available proposals.`,
      );
    }

    if (proposal.status !== 'pending') {
      throw new Error(
        `Proposal "${id}" is already ${proposal.status} and cannot be approved.`,
      );
    }

    proposal.status = 'approved';
    proposal.resolvedAt = new Date().toISOString();
  }

  /**
   * Reject a pending proposal with an optional reason.
   *
   * @param id - Proposal ID to reject
   * @param reason - Optional explanation for the rejection
   * @throws Error if proposal not found or not in pending status
   */
  reject(id: string, reason?: string): void {
    const proposal = this.proposals.get(id);

    if (!proposal) {
      throw new Error(
        `Proposal "${id}" not found. Use getQueue() to see available proposals.`,
      );
    }

    if (proposal.status !== 'pending') {
      throw new Error(
        `Proposal "${id}" is already ${proposal.status} and cannot be rejected.`,
      );
    }

    proposal.status = 'rejected';
    proposal.resolvedAt = new Date().toISOString();
    proposal.rejectionReason = reason;
  }

  /**
   * Get a specific proposal by ID.
   *
   * @param id - Proposal ID to look up
   * @returns The proposal, or undefined if not found
   */
  getProposal(id: string): ProposedAction | undefined {
    return this.proposals.get(id);
  }

  /** Count of pending proposals awaiting user decision. */
  get pendingCount(): number {
    return this.getQueue('pending').length;
  }

  /**
   * Clear resolved proposals (approved + rejected) from the queue.
   * Keeps pending proposals intact.
   */
  clearResolved(): void {
    for (const [id, proposal] of this.proposals) {
      if (proposal.status !== 'pending') {
        this.proposals.delete(id);
      }
    }
  }
}
