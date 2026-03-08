#!/usr/bin/env node
/**
 * Set up the DON wallet on the Convergence vault.
 * Deposits WETH so the DON can execute private transfers at settlement.
 */
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = process.env.SEPOLIA_RPC_URL;
if (!RPC) throw new Error('SEPOLIA_RPC_URL env var is required');
const WETH = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
const VAULT = '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13';
const API = 'https://convergence2026-token-api.cldev.cloud';
const DON_KEY = process.env.DON_ETH_PRIVATE_KEY;
if (!DON_KEY) throw new Error('DON_ETH_PRIVATE_KEY env var is required');
const DEPOSIT_AMOUNT = parseEther('0.003');

const account = privateKeyToAccount(DON_KEY);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ chain: sepolia, transport: http(RPC), account });
const domain = { name: 'CompliantPrivateTokenDemo', version: '0.0.1', chainId: 11155111, verifyingContract: VAULT };
const balAbi = [{ type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }];

console.log('DON wallet:', account.address);
console.log('ETH:', formatEther(await pub.getBalance({ address: account.address })));

const wethBal = await pub.readContract({ address: WETH, abi: balAbi, functionName: 'balanceOf', args: [account.address] });
console.log('WETH on-chain:', formatEther(wethBal));

// Check vault balance
const ts1 = Math.floor(Date.now() / 1000);
const sig1 = await wallet.signTypedData({
  domain,
  types: { 'Retrieve Balances': [{ name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' }] },
  primaryType: 'Retrieve Balances',
  message: { account: account.address, timestamp: BigInt(ts1) },
});
const balRes = await fetch(`${API}/balances`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: account.address, timestamp: ts1, auth: sig1 }),
});
const balData = await balRes.json().catch(() => ({}));
console.log('Vault balances:', JSON.stringify(balData));

const hasBalance = balData.balances?.some(b => b.token?.toLowerCase() === WETH.toLowerCase() && BigInt(b.amount || 0) > 0n);
if (hasBalance) {
  console.log('✅ DON already has WETH in vault');
  process.exit(0);
}

console.log('\n🔧 Depositing', formatEther(DEPOSIT_AMOUNT), 'WETH into vault...');

// Wrap ETH → WETH if needed
if (wethBal < DEPOSIT_AMOUNT) {
  const need = DEPOSIT_AMOUNT - wethBal;
  console.log('Wrapping', formatEther(need), 'ETH → WETH...');
  const tx = await wallet.writeContract({
    address: WETH,
    abi: [{ type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] }],
    functionName: 'deposit', value: need,
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log('Wrapped:', tx);
}

// Approve vault
console.log('Approving vault...');
const appTx = await wallet.writeContract({
  address: WETH,
  abi: [{ type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' }],
  functionName: 'approve', args: [VAULT, DEPOSIT_AMOUNT],
});
await pub.waitForTransactionReceipt({ hash: appTx });

// Deposit
console.log('Depositing...');
const depTx = await wallet.writeContract({
  address: VAULT,
  abi: [{ type: 'function', name: 'deposit', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
  functionName: 'deposit', args: [WETH, DEPOSIT_AMOUNT],
});
const receipt = await pub.waitForTransactionReceipt({ hash: depTx });
console.log('Deposited:', depTx, 'status:', receipt.status);

// Verify
const ts2 = Math.floor(Date.now() / 1000);
const sig2 = await wallet.signTypedData({
  domain,
  types: { 'Retrieve Balances': [{ name: 'account', type: 'address' }, { name: 'timestamp', type: 'uint256' }] },
  primaryType: 'Retrieve Balances',
  message: { account: account.address, timestamp: BigInt(ts2) },
});
const res2 = await fetch(`${API}/balances`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: account.address, timestamp: ts2, auth: sig2 }),
});
console.log('✅ Vault balances after deposit:', await res2.text());
