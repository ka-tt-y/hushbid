import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

const HUSH_BID_ABI = [
  { type: 'function', name: 'auctionCounter', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getAuction', inputs: [{ name: 'auctionId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'seller', type: 'address' }, { name: 'assetContract', type: 'address' }, { name: 'tokenAmount', type: 'uint256' }, { name: 'reservePrice', type: 'uint256' }, { name: 'biddingEnd', type: 'uint64' }, { name: 'revealEnd', type: 'uint64' }, { name: 'assetType', type: 'uint8' }, { name: 'privacyLevel', type: 'uint8' }, { name: 'worldIdRequired', type: 'bool' }, { name: 'allowedTokensHash', type: 'bytes32' }, { name: 'auditor', type: 'address' }, { name: 'sellerShieldedAddress', type: 'address' }] }], stateMutability: 'view' },
  { type: 'function', name: 'auctionPhases', inputs: [{ name: 'auctionId', type: 'uint256' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getBidCount', inputs: [{ name: 'auctionId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getBidCommitmentFull', inputs: [{ name: 'auctionId', type: 'uint256' }, { name: 'index', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'commitHash', type: 'bytes32' }, { name: 'ipfsCid', type: 'string' }, { name: 'timestamp', type: 'uint64' }, { name: 'sourceChain', type: 'uint64' }, { name: 'valid', type: 'bool' }] }], stateMutability: 'view' },
];

const RPC = 'https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY';
const CONTRACT = '0xc3c083dd53179a9e95d1c096527dbe5302a0f354';

async function main() {
  const client = createPublicClient({
    chain: { ...sepolia, id: 99911155111 },
    transport: http(RPC),
  });

  const count = await client.readContract({ address: CONTRACT, abi: HUSH_BID_ABI, functionName: 'auctionCounter' });
  console.log('Total auctions:', count.toString());

  for (let i = 1n; i <= count; i++) {
    const a = await client.readContract({ address: CONTRACT, abi: HUSH_BID_ABI, functionName: 'getAuction', args: [i] });
    const bc = await client.readContract({ address: CONTRACT, abi: HUSH_BID_ABI, functionName: 'getBidCount', args: [i] });
    const now = Math.floor(Date.now() / 1000);
    console.log('\n=== Auction #' + i + ' ===');
    console.log('  bidEnd:', new Date(Number(a.biddingEnd) * 1000).toISOString(), '(' + (Number(a.biddingEnd) - now) + 's from now)');
    console.log('  revealEnd:', new Date(Number(a.revealEnd) * 1000).toISOString(), '(' + (Number(a.revealEnd) - now) + 's from now)');
    const phase = await client.readContract({ address: CONTRACT, abi: HUSH_BID_ABI, functionName: 'auctionPhases', args: [i] });
    const phaseNames = ['CREATED','BIDDING','REVEAL','SETTLING','SETTLED','COMPLETED','CANCELLED'];
    console.log('  phase:', phaseNames[phase] || phase);
    console.log('  bidCount:', bc.toString());

    for (let j = 0n; j < bc; j++) {
      const bid = await client.readContract({ address: CONTRACT, abi: HUSH_BID_ABI, functionName: 'getBidCommitmentFull', args: [i, j] });
      console.log('  Bid #' + j + ': ipfsCid=' + bid.ipfsCid);
      const cid = bid.ipfsCid;
      if (cid) {
        try {
          const resp = await fetch('https://gateway.pinata.cloud/ipfs/' + cid);
          const data = await resp.json();
          const format = data.encryptedPayload ? 'v1 (ECIES)' : data.encryptedData ? 'v2 (wallet)' : 'unknown';
          console.log('         format: ' + format + ', version: ' + (data.version || 'none'));
        } catch (e) {
          console.log('         fetch error: ' + e.message);
        }
      }
    }
  }
}

main().catch(console.error);
