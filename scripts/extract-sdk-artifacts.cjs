#!/usr/bin/env node
/**
 * Extract contract ABIs and bytecodes from compiled artifacts
 * and write them as TypeScript modules for the SDK.
 *
 * Sources:
 *   - SimpleToken: Hardhat artifact
 *   - PolicyEngine: Forge-compiled @chainlink/ace artifact
 *   - ERC1967Proxy: Forge-compiled OpenZeppelin artifact
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SDK_SRC = path.join(ROOT, 'packages', 'sdk', 'src');

// ── SimpleToken (Hardhat) ────────────────────────────────────────
const stPath = path.join(ROOT, 'packages', 'contracts', 'artifacts', 'contracts', 'SimpleToken.sol', 'SimpleToken.json');
const st = JSON.parse(fs.readFileSync(stPath, 'utf8'));
const stAbi = st.abi.filter(e => ['function', 'constructor', 'event', 'error'].includes(e.type));

fs.writeFileSync(
  path.join(SDK_SRC, 'artifacts-simple-token.ts'),
  [
    '// Auto-generated — DO NOT EDIT',
    '// Source: contracts/SimpleToken.sol compiled via Hardhat',
    '',
    'export const SIMPLE_TOKEN_ABI = ' + JSON.stringify(stAbi, null, 2) + ' as const;',
    '',
    'export const SIMPLE_TOKEN_BYTECODE = "' + st.bytecode + '" as `0x${string}`;',
    '',
  ].join('\n')
);
console.log('✓ SimpleToken artifact written');

// ── PolicyEngine (Forge / @chainlink/ace) ────────────────────────
const pePath = path.join(ROOT, 'node_modules', '@chainlink', 'ace', 'out', 'PolicyEngine.sol', 'PolicyEngine.json');
const pe = JSON.parse(fs.readFileSync(pePath, 'utf8'));
const peAbiMinimal = pe.abi.filter(e =>
  e.name === 'initialize' ||
  e.name === 'ADMIN_ROLE' ||
  e.name === 'grantRole' ||
  e.name === 'setDefaultPolicyAllow' ||
  e.name === 'setTargetDefaultPolicyAllow' ||
  e.name === 'addPolicy' ||
  e.name === 'setExtractor' ||
  e.name === 'typeAndVersion'
);

fs.writeFileSync(
  path.join(SDK_SRC, 'artifacts-policy-engine.ts'),
  [
    '// Auto-generated — DO NOT EDIT',
    '// Source: @chainlink/ace PolicyEngine.sol compiled via Forge',
    '',
    'export const POLICY_ENGINE_ABI = ' + JSON.stringify(peAbiMinimal, null, 2) + ' as const;',
    '',
    'export const POLICY_ENGINE_BYTECODE = "' + pe.bytecode.object + '" as `0x${string}`;',
    '',
  ].join('\n')
);
console.log('✓ PolicyEngine artifact written');

// ── ERC1967Proxy (Forge / OpenZeppelin) ──────────────────────────
const proxyPath = path.join(ROOT, 'node_modules', '@chainlink', 'ace', 'out', 'ERC1967Proxy.sol', 'ERC1967Proxy.json');
const proxy = JSON.parse(fs.readFileSync(proxyPath, 'utf8'));

fs.writeFileSync(
  path.join(SDK_SRC, 'artifacts-proxy.ts'),
  [
    '// Auto-generated — DO NOT EDIT',
    '// Source: @openzeppelin ERC1967Proxy.sol compiled via Forge',
    '',
    'export const ERC1967_PROXY_ABI = ' + JSON.stringify(proxy.abi, null, 2) + ' as const;',
    '',
    'export const ERC1967_PROXY_BYTECODE = "' + proxy.bytecode.object + '" as `0x${string}`;',
    '',
  ].join('\n')
);
console.log('✓ ERC1967Proxy artifact written');

console.log('\n✓ All artifacts written to', SDK_SRC);
