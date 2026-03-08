// Auto-generated — DO NOT EDIT
// Source: contracts/SimpleToken.sol compiled via Hardhat

export const SIMPLE_TOKEN_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name_",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "symbol_",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "initialOwner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "ECDSAInvalidSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "ECDSAInvalidSignatureLength",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "ECDSAInvalidSignatureS",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "allowance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      }
    ],
    "name": "ERC20InsufficientAllowance",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "needed",
        "type": "uint256"
      }
    ],
    "name": "ERC20InsufficientBalance",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "approver",
        "type": "address"
      }
    ],
    "name": "ERC20InvalidApprover",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "ERC20InvalidReceiver",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "ERC20InvalidSender",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "ERC20InvalidSpender",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "ERC2612ExpiredSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "signer",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ERC2612InvalidSigner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "currentNonce",
        "type": "uint256"
      }
    ],
    "name": "InvalidAccountNonce",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
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
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
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
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "Transfer",
    "type": "event"
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
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
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
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
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
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "nonces",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "v",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "r",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "permit",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
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
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "transfer",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
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
  }
] as const;

export const SIMPLE_TOKEN_BYTECODE = "0x6101608060405234610486576115c2803803809161001d828561048a565b833981016060828203126104865781516001600160401b03811161048657816100479184016104ad565b60208301519091906001600160401b0381116104865760409161006b9185016104ad565b9201516001600160a01b038116919082900361048657604092835191610091858461048a565b60018352603160f81b6020840190815281519092906001600160401b03811161039657600354600181811c9116801561047c575b602082101461037857601f8111610419575b50806020601f82116001146103b5575f916103aa575b508160011b915f199060031b1c1916176003555b8051906001600160401b0382116103965760045490600182811c9216801561038c575b60208310146103785781601f84931161030a575b50602090601f83116001146102a4575f92610299575b50508160011b915f199060031b1c1916176004555b61016c81610502565b6101205261017983610689565b6101405260208151910120918260e05251902080610100524660a05283519060208201927f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f84528583015260608201524660808201523060a082015260a081526101e460c08261048a565b5190206080523060c052801561028657600880546001600160a01b0319811683179091559151916001600160a01b03167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e05f80a3610e0090816107c2823960805181610ac2015260a05181610b7f015260c05181610a8c015260e05181610b1101526101005181610b3701526101205181610449015261014051816104720152f35b631e4fbdf760e01b5f525f60045260245ffd5b015190505f8061014e565b60045f9081528281209350601f198516905b8181106102f257509084600195949392106102da575b505050811b01600455610163565b01515f1960f88460031b161c191690555f80806102cc565b929360206001819287860151815501950193016102b6565b60045f529091507f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b601f840160051c8101916020851061036e575b90601f859493920160051c01905b8181106103605750610138565b5f8155849350600101610353565b9091508190610345565b634e487b7160e01b5f52602260045260245ffd5b91607f1691610124565b634e487b7160e01b5f52604160045260245ffd5b90508301515f6100ed565b60035f9081528181209250601f198416905b818110610401575090836001949392106103e9575b5050811b01600355610101565b8501515f1960f88460031b161c191690555f806103dc565b9192602060018192868a0151815501940192016103c7565b60035f527fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b601f830160051c81019160208410610472575b601f0160051c01905b81811061046757506100d7565b5f815560010161045a565b9091508190610451565b90607f16906100c5565b5f80fd5b601f909101601f19168101906001600160401b0382119082101761039657604052565b81601f82011215610486578051906001600160401b03821161039657604051926104e1601f8401601f19166020018561048a565b8284526020838301011161048657815f9260208093018386015e8301015290565b908151602081105f1461057c575090601f81511161053c57602081519101516020821061052d571790565b5f198260200360031b1b161790565b604460209160405192839163305a27a960e01b83528160048401528051918291826024860152018484015e5f828201840152601f01601f19168101030190fd5b6001600160401b03811161039657600554600181811c9116801561067f575b602082101461037857601f811161064c575b50602092601f82116001146105eb57928192935f926105e0575b50508160011b915f199060031b1c19161760055560ff90565b015190505f806105c7565b601f1982169360055f52805f20915f5b868110610634575083600195961061061c575b505050811b0160055560ff90565b01515f1960f88460031b161c191690555f808061060e565b919260206001819286850151815501940192016105fb565b60055f52601f60205f20910160051c810190601f830160051c015b81811061067457506105ad565b5f8155600101610667565b90607f169061059b565b908151602081105f146106b4575090601f81511161053c57602081519101516020821061052d571790565b6001600160401b03811161039657600654600181811c911680156107b7575b602082101461037857601f8111610784575b50602092601f821160011461072357928192935f92610718575b50508160011b915f199060031b1c19161760065560ff90565b015190505f806106ff565b601f1982169360065f52805f20915f5b86811061076c5750836001959610610754575b505050811b0160065560ff90565b01515f1960f88460031b161c191690555f8080610746565b91926020600181928685015181550194019201610733565b60065f52601f60205f20910160051c810190601f830160051c015b8181106107ac57506106e5565b5f815560010161079f565b90607f16906106d356fe6080806040526004361015610012575f80fd5b5f3560e01c90816306fdde03146107fe57508063095ea7b3146107d857806318160ddd146107bb57806323b872dd146106dc578063313ce567146106c15780633644e5151461069f57806340c10f19146105f357806370a08231146105bc578063715018a6146105615780637ecebe001461052957806384b0196e146104315780638da5cb5b1461040957806395d89b4114610327578063a9059cbb146102f6578063d505accf146101b1578063dd62ed3e146101615763f2fde38b146100d7575f80fd5b3461015d57602036600319011261015d576100f06108c4565b6100f8610ba5565b6001600160a01b0316801561014a57600880546001600160a01b0319811683179091556001600160a01b03167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e05f80a3005b631e4fbdf760e01b5f525f60045260245ffd5b5f80fd5b3461015d57604036600319011261015d5761017a6108c4565b6101826108da565b6001600160a01b039182165f908152600160209081526040808320949093168252928352819020549051908152f35b3461015d5760e036600319011261015d576101ca6108c4565b6101d26108da565b604435906064359260843560ff8116810361015d578442116102e3576102a66102af9160018060a01b03841696875f52600760205260405f20908154916001830190556040519060208201927f6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c984528a604084015260018060a01b038916606084015289608084015260a083015260c082015260c0815261027460e0826109a9565b51902061027f610a89565b906040519161190160f01b83526002830152602282015260c43591604260a4359220610cc9565b90929192610d56565b6001600160a01b03168481036102cc57506102ca9350610bcc565b005b84906325c0072360e11b5f5260045260245260445ffd5b8463313c898160e11b5f5260045260245ffd5b3461015d57604036600319011261015d5761031c6103126108c4565b60243590336109df565b602060405160018152f35b3461015d575f36600319011261015d576040515f600454610347816108f0565b80845290600181169081156103e55750600114610387575b6103838361036f818503826109a9565b6040519182916020835260208301906108a0565b0390f35b60045f9081527f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b939250905b8082106103cb5750909150810160200161036f61035f565b9192600181602092548385880101520191019092916103b3565b60ff191660208086019190915291151560051b8401909101915061036f905061035f565b3461015d575f36600319011261015d576008546040516001600160a01b039091168152602090f35b3461015d575f36600319011261015d576104cd61046d7f0000000000000000000000000000000000000000000000000000000000000000610c2f565b6104967f0000000000000000000000000000000000000000000000000000000000000000610c92565b60206104db604051926104a983856109a9565b5f84525f368137604051958695600f60f81b875260e08588015260e08701906108a0565b9085820360408701526108a0565b4660608501523060808501525f60a085015283810360c08501528180845192838152019301915f5b82811061051257505050500390f35b835185528695509381019392810192600101610503565b3461015d57602036600319011261015d576001600160a01b0361054a6108c4565b165f526007602052602060405f2054604051908152f35b3461015d575f36600319011261015d57610579610ba5565b600880546001600160a01b031981169091555f906001600160a01b03167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e08280a3005b3461015d57602036600319011261015d576001600160a01b036105dd6108c4565b165f525f602052602060405f2054604051908152f35b3461015d57604036600319011261015d5761060c6108c4565b60243590610618610ba5565b6001600160a01b031690811561068c57600254908082018092116106785760207fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef915f9360025584845283825260408420818154019055604051908152a3005b634e487b7160e01b5f52601160045260245ffd5b63ec442f0560e01b5f525f60045260245ffd5b3461015d575f36600319011261015d5760206106b9610a89565b604051908152f35b3461015d575f36600319011261015d57602060405160128152f35b3461015d57606036600319011261015d576106f56108c4565b6106fd6108da565b6001600160a01b0382165f818152600160209081526040808320338452909152902054909260443592915f19811061073b575b5061031c93506109df565b8381106107a057841561078d57331561077a5761031c945f52600160205260405f2060018060a01b0333165f526020528360405f209103905584610730565b634a1406b160e11b5f525f60045260245ffd5b63e602df0560e01b5f525f60045260245ffd5b8390637dc7a0d960e11b5f523360045260245260445260645ffd5b3461015d575f36600319011261015d576020600254604051908152f35b3461015d57604036600319011261015d5761031c6107f46108c4565b6024359033610bcc565b3461015d575f36600319011261015d575f60035461081b816108f0565b80845290600181169081156103e55750600114610842576103838361036f818503826109a9565b60035f9081527fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b939250905b8082106108865750909150810160200161036f61035f565b91926001816020925483858801015201910190929161086e565b805180835260209291819084018484015e5f828201840152601f01601f1916010190565b600435906001600160a01b038216820361015d57565b602435906001600160a01b038216820361015d57565b90600182811c9216801561091e575b602083101461090a57565b634e487b7160e01b5f52602260045260245ffd5b91607f16916108ff565b5f9291815491610937836108f0565b808352926001811690811561098c575060011461095357505050565b5f9081526020812093945091925b838310610972575060209250010190565b600181602092949394548385870101520191019190610961565b915050602093945060ff929192191683830152151560051b010190565b90601f8019910116810190811067ffffffffffffffff8211176109cb57604052565b634e487b7160e01b5f52604160045260245ffd5b6001600160a01b0316908115610a76576001600160a01b031691821561068c57815f525f60205260405f2054818110610a5d57817fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef92602092855f525f84520360405f2055845f525f825260405f20818154019055604051908152a3565b8263391434e360e21b5f5260045260245260445260645ffd5b634b637e8f60e11b5f525f60045260245ffd5b307f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03161480610b7c575b15610ae4577f000000000000000000000000000000000000000000000000000000000000000090565b60405160208101907f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f82527f000000000000000000000000000000000000000000000000000000000000000060408201527f000000000000000000000000000000000000000000000000000000000000000060608201524660808201523060a082015260a08152610b7660c0826109a9565b51902090565b507f00000000000000000000000000000000000000000000000000000000000000004614610abb565b6008546001600160a01b03163303610bb957565b63118cdaa760e01b5f523360045260245ffd5b6001600160a01b031690811561078d576001600160a01b031691821561077a5760207f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92591835f526001825260405f20855f5282528060405f2055604051908152a3565b60ff8114610c755760ff811690601f8211610c665760405191610c536040846109a9565b6020808452838101919036833783525290565b632cd44ac360e21b5f5260045ffd5b50604051610c8f81610c88816005610928565b03826109a9565b90565b60ff8114610cb65760ff811690601f8211610c665760405191610c536040846109a9565b50604051610c8f81610c88816006610928565b91907f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a08411610d4b579160209360809260ff5f9560405194855216868401526040830152606082015282805260015afa15610d40575f516001600160a01b03811615610d3657905f905f90565b505f906001905f90565b6040513d5f823e3d90fd5b5050505f9160039190565b6004811015610db65780610d68575050565b60018103610d7f5763f645eedf60e01b5f5260045ffd5b60028103610d9a575063fce698f760e01b5f5260045260245ffd5b600314610da45750565b6335e2f38360e21b5f5260045260245ffd5b634e487b7160e01b5f52602160045260245ffdfea2646970667358221220425e9674b22370c08b3f6eb6104aba545c9c87126b33f121749e785014491b6d64736f6c634300081c0033" as `0x${string}`;
