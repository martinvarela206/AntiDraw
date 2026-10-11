/**
 * CAPA L3: Re-export canónico de CommandRegistry
 * Redirige al registro central formalizado en `src/webview/commands/CommandRegistry.ts`.
 */

export {
  CommandRegistry,
  CommandContext,
  CommandSpec,
  ExecutionResult,
  CommandExecutionListener,
} from '../../commands/CommandRegistry.js';
