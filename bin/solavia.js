#!/usr/bin/env node
// bin/solavia.js — main CLI entry for Solavia

import('../src/cli.js')
  .catch(err => {
    console.error('SolaVia CLI crashed:', err);
    process.exit(1);
  });
