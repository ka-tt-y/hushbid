#!/usr/bin/env node
/**
 * Post-Deploy Address Updater
 *
 * Run immediately after deploying contracts to update ALL address references
 * across the entire monorepo:
 *
 *   1. apps/demo/.env                          (VITE_ env vars)
 *   2. packages/sdk/src/chains.ts              (SDK chain config)
 *   3. packages/cre-workflow/hush-bid/config.staging.json
 *   4. scripts/cre-agent.mjs                   (default fallback address)
 *   5. packages/contracts/scripts/create-test-auction.ts
 *   6. .cre-agent-state.json                   (reset processed auctions)
 *   7. packages/sdk                            (rebuild SDK dist/)
 *
 * Usage:
 *   node scripts/update-addresses.mjs \
 *     --hushBid 0xNEW_HUSHBID \
 *     --priceNormalizer 0xNEW_PRICE
 *
 * Or via env vars:
 *   HUSH_BID_ADDRESS=0x... PRICE_NORMALIZER=0x... node scripts/update-addresses.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ── Parse CLI args ──
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1]) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const cli = parseArgs();
const addresses = {
  hushBid:         cli.hushBid         || process.env.HUSH_BID_ADDRESS    || '',
  priceNormalizer: cli.priceNormalizer  || process.env.PRICE_NORMALIZER    || '',
};

if (!addresses.hushBid) {
  console.error('❌ Missing --hushBid or HUSH_BID_ADDRESS env var');
  console.error('\nUsage:');
  console.error('  node scripts/update-addresses.mjs --hushBid 0x... --priceNormalizer 0x...');
  process.exit(1);
}

console.log('\n🔄 Post-Deploy Address Updater\n');
console.log(`  HushBid:         ${addresses.hushBid}`);
console.log(`  PriceNormalizer: ${addresses.priceNormalizer || '(unchanged)'}`);
console.log();

let updated = 0;
let skipped = 0;

// ── Helper: update env file ──
function updateEnvFile(filePath, vars) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  Skipping ${path.relative(ROOT, filePath)} (not found)`);
    skipped++;
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(filePath, content);
  console.log(`  ✅ ${path.relative(ROOT, filePath)}`);
  updated++;
}

// ── Helper: regex replace in file ──
function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  Skipping ${path.relative(ROOT, filePath)} (not found)`);
    skipped++;
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [pattern, replacement] of replacements) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;
    const before = content;
    content = content.replace(regex, replacement);
    if (content !== before) changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ ${path.relative(ROOT, filePath)}`);
    updated++;
  } else {
    console.log(`  ⏭️  ${path.relative(ROOT, filePath)} (no changes needed)`);
  }
}

// ── Helper: update JSON config ──
function updateJsonFile(filePath, updater) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  Skipping ${path.relative(ROOT, filePath)} (not found)`);
    skipped++;
    return;
  }
  const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  updater(config);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ✅ ${path.relative(ROOT, filePath)}`);
  updated++;
}

// =============================================================================
// 1. apps/demo/.env
// =============================================================================
console.log('📁 Frontend (.env)');
updateEnvFile(path.join(ROOT, 'apps/demo/.env'), {
  VITE_HUSH_BID_ADDRESS: addresses.hushBid,
  VITE_PRICE_NORMALIZER_ADDRESS: addresses.priceNormalizer,
  VITE_MOCK_NFT_ADDRESS: addresses.mockNFT,
});

// =============================================================================
// 2. packages/sdk/src/chains.ts
// =============================================================================
console.log('\n📁 SDK (chains.ts)');
if (addresses.hushBid) {
  replaceInFile(path.join(ROOT, 'packages/sdk/src/chains.ts'), [
    [/hushBid:\s*"0x[0-9a-fA-F]+"/, `hushBid: "${addresses.hushBid}"`],
  ]);
}

// =============================================================================
// 3. CRE Workflow config
// =============================================================================
console.log('\n📁 CRE Workflow (config.staging.json)');
updateJsonFile(
  path.join(ROOT, 'packages/cre-workflow/hush-bid/config.staging.json'),
  (config) => {
    if (addresses.hushBid) config.primaryChain.auctionContract = addresses.hushBid;
    if (addresses.priceNormalizer) config.primaryChain.priceNormalizer = addresses.priceNormalizer;
  }
);

// =============================================================================
// 4. CRE Agent script
// =============================================================================
console.log('\n📁 CRE Agent (cre-agent.mjs)');
if (addresses.hushBid) {
  replaceInFile(path.join(ROOT, 'scripts/cre-agent.mjs'), [
    [
      /const CONTRACT\s*=\s*\(process\.env\.HUSH_BID_ADDRESS\s*\|\|\s*'0x[0-9a-fA-F]+'\)/i,
      `const CONTRACT = (process.env.HUSH_BID_ADDRESS || '${addresses.hushBid.toLowerCase()}')`
    ],
  ]);
}

// =============================================================================
// 5. Contract helper scripts
// =============================================================================
console.log('\n📁 Contract scripts');
if (addresses.hushBid) {
  replaceInFile(path.join(ROOT, 'packages/contracts/scripts/create-test-auction.ts'), [
    [
      /process\.env\.AUCTION_CONTRACT\s*\|\|\s*"0x[0-9a-fA-F]+"/i,
      `process.env.AUCTION_CONTRACT || "${addresses.hushBid}"`
    ],
  ]);
}

// =============================================================================
// 6. .cre-agent-state.json (if exists, clear it for fresh start)
// =============================================================================
const statePath = path.join(ROOT, '.cre-agent-state.json');
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  // Reset processed auctions since contract changed
  state.processedAuctions = [];
  state.lastBlock = 0;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  console.log(`\n  ✅ Reset .cre-agent-state.json (cleared processed auctions)`);
  updated++;
}

// =============================================================================
// 7. Rebuild SDK so the updated chain config is compiled into dist/
// =============================================================================
console.log('\n📁 Rebuilding SDK...');
try {
  execSync('npm run build', { cwd: path.join(ROOT, 'packages/sdk'), stdio: 'pipe' });
  console.log('  ✅ SDK rebuilt');
  updated++;
} catch (err) {
  console.error('  ⚠️  SDK build failed — run manually: cd packages/sdk && npm run build');
  skipped++;
}

// =============================================================================
// Summary
// =============================================================================
console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Updated ${updated} files, ⏭️  skipped ${skipped}`);
console.log(`\n💡 Next steps:`);
console.log(`   1. Restart demo:  cd apps/demo && npm run dev`);
console.log(`   2. Run agent:     HUSH_BID_ADDRESS=${addresses.hushBid} node scripts/cre-agent.mjs --verbose --broadcast`);
console.log();
