#!/usr/bin/env node
/**
 * Extract ABIs from Hardhat compilation artifacts
 * 
 * Generates TypeScript ABI files that can be imported by:
 * - CRE workflow (packages/cre-workflow)
 * - Demo app (apps/demo)
 * - SDK (packages/sdk)
 * 
 * Usage: npx tsx scripts/extract-abis.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ARTIFACTS_DIR = join(dirname(import.meta.dirname ?? __dirname), 'artifacts', 'contracts');
const OUTPUT_DIR = join(dirname(import.meta.dirname ?? __dirname), 'abi');

// Contracts to extract (artifact path relative to ARTIFACTS_DIR)
const CONTRACTS = [
  { file: 'HushBid.sol/HushBid.json', name: 'HushBid' },
  { file: 'PriceNormalizer.sol/PriceNormalizer.json', name: 'PriceNormalizer' },
  { file: 'CrossChainBidReceiver.sol/CrossChainBidReceiver.json', name: 'CrossChainBidReceiver' },
  { file: 'CrossChainBidSender.sol/CrossChainBidSender.json', name: 'CrossChainBidSender' },
  { file: 'MockNFT.sol/MockNFT.json', name: 'MockNFT' },
  { file: 'interfaces/IAuctionTypes.sol/IAuctionTypes.json', name: 'IAuctionTypes' },
];

function extractAbis() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const exports: string[] = [];

  for (const contract of CONTRACTS) {
    const artifactPath = join(ARTIFACTS_DIR, contract.file);

    let artifact: { abi: unknown[] };
    try {
      artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    } catch {
      console.warn(`⚠ Skipping ${contract.name}: artifact not found at ${artifactPath}`);
      continue;
    }

    // Filter to only functions, events, errors (skip constructors, receive, fallback for cleaner output)
    const abi = artifact.abi;

    // Write individual file
    const content = `// Auto-generated from Hardhat compilation artifacts — DO NOT EDIT\n// Source: ${contract.file}\n\nexport const ${contract.name}ABI = ${JSON.stringify(abi, null, 2)} as const;\n`;

    writeFileSync(join(OUTPUT_DIR, `${contract.name}.ts`), content);
    exports.push(`export { ${contract.name}ABI } from './${contract.name}';`);
    console.log(`✓ Extracted ${contract.name} ABI (${abi.length} entries)`);
  }

  // Write barrel index
  const indexContent = `// Auto-generated ABI barrel export — DO NOT EDIT\n// Run "npm run extract-abis" after recompiling contracts\n\n${exports.join('\n')}\n`;
  writeFileSync(join(OUTPUT_DIR, 'index.ts'), indexContent);

  console.log(`\n✓ All ABIs written to ${OUTPUT_DIR}/`);
}

extractAbis();
