/**
 * Autonomy system for the GSPL agent.
 *
 * Provides four levels of agent independence:
 * - **SafetyGovernor** — Risk assessment and policy enforcement (always active)
 * - **SupervisorMode** — Agent proposes, user approves (most controlled)
 * - **CopilotMode** — Agent runs background tasks in parallel with user
 * - **AutonomousMode** — Agent pursues goals independently (most independent)
 *
 * @packageDocumentation
 */

export {
  SafetyGovernor,
  DEFAULT_POLICY,
} from './safety-governor.js';

export type {
  OperationRisk,
  SafetyPolicy,
  ProceedCheck,
} from './safety-governor.js';

export { SupervisorMode } from './supervisor.js';

export type {
  ProposalStatus,
  ProposedAction,
} from './supervisor.js';

export { CopilotMode } from './copilot.js';

export type {
  TaskStatus,
  BackgroundTask,
  TaskResult,
} from './copilot.js';

export { AutonomousMode } from './autonomous.js';

export type {
  StepStatus,
  PlanStep,
  AgentPlan,
  StepResult,
  ProgressReport,
  ToolExecutor,
} from './autonomous.js';
