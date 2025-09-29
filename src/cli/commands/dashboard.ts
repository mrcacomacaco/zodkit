/**
 * @fileoverview Unified TUI Dashboard command - Single interface for all zodkit features
 * @module DashboardCommand
 */

import * as pc from 'picocolors';
import { ZodkitUI } from '../ui/zodkit-unified';

interface DashboardOptions {
  theme?: 'dark' | 'light' | 'neon';
  cwd?: string;
  history?: string;
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  try {
    // Change to specified directory if provided
    if (options.cwd) {
      process.chdir(options.cwd);
    }

    // Launch the FULLY UNIFIED TUI with all features integrated
    const ui = new ZodkitUI();
    await ui.start();

    // UI exited normally
    console.log(pc.gray('\nThank you for using Zodkit!'));
  } catch (error) {
    console.error(pc.red('❌ Error launching Zodkit:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Alternative shorter command name
export { dashboardCommand as uiCommand };