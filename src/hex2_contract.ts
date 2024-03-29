// tewkenaire.io HEXTEW
import { Abi, Address } from 'viem'
import { AbiEvent } from 'abitype'

export interface HEX2T {
  SYMBOL: string,
  GENESIS_BLOCK: bigint,
  CHAINS: { [key: number]: Address }
  EventStakeStartAbi: AbiEvent,
  EventStakeEndAbi: AbiEvent,
  ABI: Abi
}

export default {
  SYMBOL: "HEX2",
  GENESIS_BLOCK: 9314436n,
  CHAINS: {
          1: "0xD495cC8C7c29c7fA3E027a5759561Ab68C363609",
        369: "0xD495cC8C7c29c7fA3E027a5759561Ab68C363609",
        943: "0xD495cC8C7c29c7fA3E027a5759561Ab68C363609",
      10001: "0xD495cC8C7c29c7fA3E027a5759561Ab68C363609",
     513100: "0xD495cC8C7c29c7fA3E027a5759561Ab68C363609",
  } as { [key: number]: Address },

  EventStakeStartAbi: {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "customerAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "name": "uniqueID",
        "type": "uint256"
      },
      {
        "indexed": false,
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "onStakeStart",
    "type": "event"
  } as const,

  EventStakeEndAbi: {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "name": "customerAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "name": "uniqueID",
        "type": "uint256"
      },
      {
        "indexed": false,
        "name": "returnAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "onStakeEnd",
    "type": "event"
  } as const,

  ABI: [
    {
      "constant": true,
      "inputs": [
        {
          "name": "_customerAddress",
          "type": "address"
        }
      ],
      "name": "dividendsOf",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalHexBalance",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": ".toString()ToSpend",
          "type": "uint256"
        }
      ],
      "name": "calculateTokensReceived",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "",
          "type": "address"
        },
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "stakeLists",
      "outputs": [
        {
          "name": "stakeID",
          "type": "uint40"
        },
        {
          "name": "hexAmount",
          "type": "uint256"
        },
        {
          "name": "stakeShares",
          "type": "uint72"
        },
        {
          "name": "lockedDay",
          "type": "uint16"
        },
        {
          "name": "stakedDays",
          "type": "uint16"
        },
        {
          "name": "unlockedDay",
          "type": "uint16"
        },
        {
          "name": "started",
          "type": "bool"
        },
        {
          "name": "ended",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "decimals",
      "outputs": [
        {
          "name": "",
          "type": "uint8"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "myDividends",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalStakeBalance",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalFundCollected",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "distributionAddress",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "withdraw",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_tokensToSell",
          "type": "uint256"
        }
      ],
      "name": "calculateHexReceived",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "setAtomicSwapAddress",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "sellPrice",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_stakeActivated",
          "type": "bool"
        }
      ],
      "name": "setHexStaking",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_amount",
          "type": "uint256"
        },
        {
          "name": "_days",
          "type": "uint256"
        }
      ],
      "name": "stakeStart",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "approvedAddress2",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_state",
          "type": "bool"
        }
      ],
      "name": "myTokens",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_customerAddress",
          "type": "address"
        },
        {
          "name": "stakable",
          "type": "bool"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_proposedAddress",
          "type": "address"
        }
      ],
      "name": "approveAddress1",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "buyPrice",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "distribute",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "name": "",
          "type": "string"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_proposedAddress",
          "type": "address"
        }
      ],
      "name": "approveAddress2",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_amount",
          "type": "uint256"
        },
        {
          "name": "_customerAddress",
          "type": "address"
        }
      ],
      "name": "buyFor",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_toAddress",
          "type": "address"
        },
        {
          "name": "_amountOfTokens",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "name": "lockedTokenBalanceLedger",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "_stakeIndex",
          "type": "uint256"
        },
        {
          "name": "_stakeIdParam",
          "type": "uint40"
        },
        {
          "name": "_uniqueID",
          "type": "uint256"
        }
      ],
      "name": "_stakeEnd",
      "outputs": [
        {
          "name": "",
          "type": "uint16"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_symbol",
          "type": "string"
        }
      ],
      "name": "setSymbol",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "approvedAddress1",
      "outputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_name",
          "type": "string"
        }
      ],
      "name": "setName",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalPlayer",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "roll",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [
        {
          "name": "",
          "type": "address"
        }
      ],
      "name": "playerStats",
      "outputs": [
        {
          "name": "deposits",
          "type": "uint256"
        },
        {
          "name": "withdrawals",
          "type": "uint256"
        },
        {
          "name": "staked",
          "type": "uint256"
        },
        {
          "name": "stakedNetProfitLoss",
          "type": "int256"
        },
        {
          "name": "activeStakes",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "buy",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_amountOfTokens",
          "type": "uint256"
        }
      ],
      "name": "sell",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [],
      "name": "exit",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalDonation",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "constant": false,
      "inputs": [
        {
          "name": "_stakeIndex",
          "type": "uint256"
        },
        {
          "name": "_stakeIdParam",
          "type": "uint40"
        },
        {
          "name": "_uniqueID",
          "type": "uint256"
        }
      ],
      "name": "stakeEnd",
      "outputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "payable": true,
      "stateMutability": "payable",
      "type": "fallback"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "price",
          "type": "uint256"
        }
      ],
      "name": "onDistribute",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "incomingHEX",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "tokensMinted",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "timestamp",
          "type": "uint256"
        }
      ],
      "name": "onTokenPurchase",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "tokensBurned",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "hexEarned",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "timestamp",
          "type": "uint256"
        }
      ],
      "name": "onTokenSell",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "hexRolled",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "tokensMinted",
          "type": "uint256"
        }
      ],
      "name": "onRoll",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "hexWithdrawn",
          "type": "uint256"
        }
      ],
      "name": "onWithdraw",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "tokens",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "uniqueID",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "timestamp",
          "type": "uint256"
        }
      ],
      "name": "onStakeStart",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "customerAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "name": "uniqueID",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "returnAmount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "name": "timestamp",
          "type": "uint256"
        }
      ],
      "name": "onStakeEnd",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    }
  ] as const
}

