#!/usr/bin/env node
/**
 * Deploy a PolicyEngine proxy for WETH and register it on the Convergence vault.
 * 
 * Steps:
 * 1. Deploy ERC1967Proxy → PolicyEngine impl (reusing existing impl on Sepolia)
 * 2. The proxy constructor calls PolicyEngine.initialize(true, deployer)
 * 3. Call vault.register(WETH, policyEngineProxy)
 */
import { createWalletClient, createPublicClient, http, encodeAbiParameters, encodeFunctionData, concat, parseAbiParameters } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const PRIVATE_KEY = process.env.DON_ETH_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error('DON_ETH_PRIVATE_KEY env var is required');
const RPC_URL = process.env.SEPOLIA_RPC_URL;
if (!RPC_URL) throw new Error('SEPOLIA_RPC_URL env var is required');
const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
const VAULT_ADDRESS = '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13';
// PolicyEngine implementation already deployed on Sepolia (read from USDC's proxy)
const POLICY_ENGINE_IMPL = '0x013f9b3afa26a213c3926310da9fac00a97e9b32';

// --- Get ERC1967Proxy bytecode from OpenZeppelin ---
const proxyArtifact = JSON.parse(
  readFileSync(join(__dirname, '..', 'node_modules', '@openzeppelin', 'contracts-5.0.2', 'build', 'contracts', 'ERC1967Proxy.json'), 'utf8')
);
const PROXY_BYTECODE = proxyArtifact.bytecode;

// --- ABIs ---
const VAULT_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'policyEngine', type: 'address' }
    ],
    outputs: []
  },
  {
    name: 'sPolicyEngines',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'address' }]
  }
];

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log('Deployer:', account.address);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL)
  });

  // Check current state
  const currentPolicyEngine = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'sPolicyEngines',
    args: [WETH_ADDRESS]
  });
  console.log('Current WETH policy engine:', currentPolicyEngine);

  if (currentPolicyEngine !== '0x0000000000000000000000000000000000000000') {
    console.log('WETH already has a policy engine registered! Exiting.');
    return;
  }

  // Step 1: Encode PolicyEngine.initialize(true, deployer) calldata
  const initializeCalldata = encodeFunctionData({
    abi: [{
      name: 'initialize',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'defaultAllow', type: 'bool' },
        { name: 'initialOwner', type: 'address' }
      ],
      outputs: []
    }],
    functionName: 'initialize',
    args: [true, account.address]
  });
  console.log('Initialize calldata:', initializeCalldata);

  // Step 2: Encode ERC1967Proxy constructor args (address implementation, bytes memory _data)
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('address, bytes'),
    [POLICY_ENGINE_IMPL, initializeCalldata]
  );

  // Step 3: Deploy the proxy
  console.log('\nDeploying PolicyEngine proxy...');
  const deployData = concat([PROXY_BYTECODE, constructorArgs]);

  const deployHash = await walletClient.sendTransaction({
    data: deployData,
  });
  console.log('Deploy tx:', deployHash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const proxyAddress = receipt.contractAddress;
  console.log('PolicyEngine proxy deployed at:', proxyAddress);
  console.log('Status:', receipt.status);

  if (receipt.status !== 'success') {
    console.error('Deployment failed!');
    process.exit(1);
  }

  // Step 4: Register WETH on the vault
  console.log('\nRegistering WETH on vault...');
  const registerHash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'register',
    args: [WETH_ADDRESS, proxyAddress]
  });
  console.log('Register tx:', registerHash);

  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  console.log('Register status:', registerReceipt.status);

  if (registerReceipt.status !== 'success') {
    console.error('Registration failed!');
    process.exit(1);
  }

  // Verify
  const newPolicyEngine = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'sPolicyEngines',
    args: [WETH_ADDRESS]
  });
  console.log('\nVerification - WETH policy engine:', newPolicyEngine);
  console.log('✅ Done! WETH is now registered on the vault with PolicyEngine at', proxyAddress);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
