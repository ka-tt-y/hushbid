// Auto-generated from Hardhat compilation artifacts — DO NOT EDIT
// Source: HushBid.sol/HushBid.json

export const HushBidABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_worldIdVerifier",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_creCoordinator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_groupId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "_appId",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_actionId",
        "type": "string"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyBid",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AuctionExpired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AuctionNotFound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "enum IBidTypes.AuctionPhase",
        "name": "expected",
        "type": "uint8"
      },
      {
        "internalType": "enum IBidTypes.AuctionPhase",
        "name": "actual",
        "type": "uint8"
      }
    ],
    "name": "AuctionNotInPhase",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AuditorRequired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReservePrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAuthorized",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RevealNotEnded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WorldIdAlreadyUsed",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "AssetClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "AuctionCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "assetContract",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum IBidTypes.PrivacyLevel",
        "name": "privacyLevel",
        "type": "uint8"
      }
    ],
    "name": "AuctionCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "winningBid",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "settlementHash",
        "type": "bytes32"
      }
    ],
    "name": "AuctionSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "sourceChain",
        "type": "uint64"
      }
    ],
    "name": "BidCommitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "CLAIM_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "auctionCounter",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "auctionNullifierHashes",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "auctionPhases",
    "outputs": [
      {
        "internalType": "enum IBidTypes.AuctionPhase",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "auctions",
    "outputs": [
      {
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "assetContract",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "reservePrice",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "biddingEnd",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "revealEnd",
        "type": "uint64"
      },
      {
        "internalType": "enum IBidTypes.AssetType",
        "name": "assetType",
        "type": "uint8"
      },
      {
        "internalType": "enum IBidTypes.PrivacyLevel",
        "name": "privacyLevel",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "worldIdRequired",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "allowedTokensHash",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "auditor",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "sellerShieldedAddress",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "cancelAuction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "claimAsset",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "claimAssetFor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "claimNonces",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "commitHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "ipfsCid",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "root",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nullifierHash",
        "type": "uint256"
      },
      {
        "internalType": "uint256[8]",
        "name": "zeroKnowledgeProof",
        "type": "uint256[8]"
      }
    ],
    "name": "commitBid",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creCoordinator",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "assetContract",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "tokenAmount",
            "type": "uint256"
          },
          {
            "internalType": "enum IBidTypes.AssetType",
            "name": "assetType",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "reservePrice",
            "type": "uint256"
          },
          {
            "internalType": "uint64",
            "name": "biddingDuration",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "revealDuration",
            "type": "uint64"
          },
          {
            "internalType": "enum IBidTypes.PrivacyLevel",
            "name": "privacyLevel",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "worldIdRequired",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "allowedTokensHash",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "auditor",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "sellerShieldedAddress",
            "type": "address"
          }
        ],
        "internalType": "struct IBidTypes.CreateAuctionParams",
        "name": "p",
        "type": "tuple"
      }
    ],
    "name": "createAuction",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "externalNullifierHash",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "getAuction",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "seller",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "assetContract",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "tokenAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "reservePrice",
            "type": "uint256"
          },
          {
            "internalType": "uint64",
            "name": "biddingEnd",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "revealEnd",
            "type": "uint64"
          },
          {
            "internalType": "enum IBidTypes.AssetType",
            "name": "assetType",
            "type": "uint8"
          },
          {
            "internalType": "enum IBidTypes.PrivacyLevel",
            "name": "privacyLevel",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "worldIdRequired",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "allowedTokensHash",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "auditor",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "sellerShieldedAddress",
            "type": "address"
          }
        ],
        "internalType": "struct IBidTypes.AuctionConfig",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "getAuctionResult",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "winner",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "winningBid",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "paymentToken",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "settlementHash",
            "type": "bytes32"
          }
        ],
        "internalType": "struct IBidTypes.AuctionResult",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "getBidCommitment",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "commitHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "sourceChain",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "valid",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "getBidCommitmentFull",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "commitHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "ipfsCid",
            "type": "string"
          },
          {
            "internalType": "uint64",
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "sourceChain",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "valid",
            "type": "bool"
          }
        ],
        "internalType": "struct IBidTypes.BidCommitment",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      }
    ],
    "name": "getBidCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "groupId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "hasBid",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "name": "onERC721Received",
    "outputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_creCoordinator",
        "type": "address"
      }
    ],
    "name": "setCreCoordinator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "auctionId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "winnerBidIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "winningBid",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "paymentToken",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "settlementHash",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "destinationAddress",
        "type": "address"
      }
    ],
    "name": "settleAuction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "worldIdVerifier",
    "outputs": [
      {
        "internalType": "contract IWorldIDVerifier",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
