#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('reflection')
  .description('Evidence-backed rendered UI validation.')
  .version('0.0.0');

program
  .command('run')
  .description('Check the UI contract for this project.')
  .option('--config <path>', 'Path to reflection.config.ts')
  .option('--mode <mode>', 'Run mode: smoke, design, visual, full', 'smoke')
  .option('--ci', 'Run with CI defaults')
  .action((options: { config?: string; mode: string; ci?: boolean }) => {
    console.log('Reflection');
    console.log('');
    console.log('Project skeleton is ready. Day 1 implementation begins with the browser contract runner.');
    console.log(JSON.stringify(options, null, 2));
  });

program
  .command('doctor')
  .description('Check whether Reflection can run correctly in this project.')
  .action(() => {
    console.log('Reflection doctor');
    console.log('Project skeleton only: setup checks will be implemented in Day 1.');
  });

program.parse();
