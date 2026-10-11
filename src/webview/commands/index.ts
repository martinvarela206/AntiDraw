/**
 * CAPA L3: Catálogo y Registro Unificado de Comandos (commands)
 * VectorCraft Architecture Alignment (03-Motor-de-Comandos-y-Herramientas)
 */

import { CommandRegistry } from './CommandRegistry.js';
import { registerShapeCommands } from './ShapeCommands.js';
import { registerPathCommands } from './PathCommands.js';
import { registerTransformCommands } from './TransformCommands.js';
import { registerNodeCommands } from './NodeCommands.js';
import { registerBooleanCommands } from './BooleanCommands.js';

export * from './CommandRegistry.js';
export * from './ShapeCommands.js';
export * from './PathCommands.js';
export * from './TransformCommands.js';
export * from './NodeCommands.js';
export * from './BooleanCommands.js';

/**
 * Registra todos los comandos del catálogo canónico en el CommandRegistry.
 */
export function registerAllDomainCommands(registry: CommandRegistry): void {
  registerShapeCommands(registry);
  registerPathCommands(registry);
  registerTransformCommands(registry);
  registerNodeCommands(registry);
  registerBooleanCommands(registry);
}
