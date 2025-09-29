/**
 * @fileoverview Command Registry utility (re-export from command-builder)
 * @module CommandRegistry
 */

export { createCommand, CommandBuilder, CommandConfigs } from './command-builder';

// For backward compatibility
export const createCommandConfig = createCommand;