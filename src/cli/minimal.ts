#!/usr/bin/env node

/**
 * Minimal CLI entry point for debugging webpack issues
 */

import { Command } from 'commander';
import * as pc from 'picocolors';

const program = new Command();

program
  .name('zodkit')
  .description('ZodKit - Minimal CLI for debugging')
  .version('0.1.0')
  .option('--test', 'test option')
  .action((options) => {
    console.log(pc.green('✅ ZodKit CLI working!'));
    console.log('Options:', options);
  });

program.parse(process.argv);