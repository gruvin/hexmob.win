import { Address } from 'viem'

const START_DATE_POSIX = 1575331200000  // some browsers cannot parse '2019-12-03 00:00:00[Z|GMT|UTC]' correctly (Safari)
const START_DATE = new Date(START_DATE_POSIX)
const GENESIS_BLOCK = 9041184n
const CLAIM_PHASE_START_DAY = 1n
const CLAIM_PHASE_DAYS = (7n * 50n)
const CLAIM_PHASE_END_DAY = CLAIM_PHASE_START_DAY + CLAIM_PHASE_DAYS
const BIG_PAY_DAY = CLAIM_PHASE_END_DAY + 1n
const CLAIMABLE_BTC_ADDR_COUNT = 27997742n
const CLAIMABLE_SATOSHIS_TOTAL = 910087996911001n
const HEARTS_PER_SATOSHI = 10000n
const DECIMALS = 8
const HEARTS_PER_HEX = 10n ** BigInt(DECIMALS)
const HEART_UINT_SIZE = 72n
const HEART_UINT_MASK = (1n << HEART_UINT_SIZE) - 1n
const SATOSHI_UINT_SIZE = 51n
const SATOSHI_UINT_MASK = (1n << SATOSHI_UINT_SIZE) - 1n
const LPB_BONUS_PERCENT = 20n
const LPB_BONUS_MAX_PERCENT = 200n
const LPB = 364n * 100n / LPB_BONUS_PERCENT
const LPB_MAX_DAYS = LPB * LPB_BONUS_MAX_PERCENT / 100n
const BPB_BONUS_PERCENT = 10n
const BPB_MAX_HEX = 150000000n // 150 * 1E06
const BPB_MAX_HEARTS = BPB_MAX_HEX * HEARTS_PER_HEX
const BPB = BPB_MAX_HEARTS * 100n / BPB_BONUS_PERCENT
const EARLY_PENALTY_MIN_DAYS = 90n
const LATE_PENALTY_GRACE_DAYS = 14n
const LATE_PENALTY_SCALE_DAYS = 700n

export type Contract = { 
  abi: any; 
  address: Address; 
  chainId?: number;
}
export type HexContract = Contract

export interface ClaimStats {
  claimedBtcAddrCount: bigint
  claimedSatoshisTotal: bigint
  unclaimedSatoshisTotal: bigint
}

export interface Globals {
  lockedHeartsTotal: bigint
  nextStakeSharesTotal: bigint
  shareRate: bigint
  stakePenaltyTotal: bigint
  dailyDataCount: bigint
  stakeSharesTotal: bigint
  latestStakeId: bigint
  claimStats?: ClaimStats
}

// Current HEXentric data for contract user
export interface HexData {
  chainId: number
  contract: HexContract
  currentDay: bigint
  walletAddress: Address | undefined
  hexBalance: bigint
  stakeCount: bigint
  allocatedSupply: bigint
  totalSupply: bigint
  globals?: Globals
}

export type DailyData = {
  payoutTotal: bigint
  stakeSharesTotal: bigint
  unclaimedSatoshisTotal: bigint
} | undefined

export type XfLobbyEnter = { data0: bigint; memberAddr: string; referrerAddr: Address; entryId: bigint; }
export type XfLobbyExit = { data0: bigint; memberAddr: string; referrerAddr: Address; entryId: bigint; }
export type StakeEnd = { data0: bigint; data1: bigint; stakerAddr: Address; stakeId: number; }

const CHAIN_ADDRESSES = {
  1: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // ETH mainnet
  369: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // PulseChain
  943: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // PLS testnet v4
  10001: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // ETHw
  31337: "0x7412a5522f21ECaf720c1a679585E5CA3F2F60CC", // Hardhat
  513100: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // ETHf
} as { [index: number]: `0x${string}` }

export const lobbyIsActive = function (): boolean {
  return Date.now() < BigInt(START_DATE_POSIX) + CLAIM_PHASE_END_DAY * 24n * 3600000n
}

const ABI = [
  {
    "inputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "constructor"
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
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data1",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes20",
        "name": "btcAddr",
        "type": "bytes20"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "claimToAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "referrerAddr",
        "type": "address"
      }
    ],
    "name": "Claim",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data1",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data2",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "senderAddr",
        "type": "address"
      }
    ],
    "name": "ClaimAssist",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "updaterAddr",
        "type": "address"
      }
    ],
    "name": "DailyDataUpdate",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint40",
        "name": "stakeId",
        "type": "uint40"
      }
    ],
    "name": "ShareRateChange",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data1",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "stakerAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint40",
        "name": "stakeId",
        "type": "uint40"
      }
    ],
    "name": "StakeEnd",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data1",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "stakerAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint40",
        "name": "stakeId",
        "type": "uint40"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "senderAddr",
        "type": "address"
      }
    ],
    "name": "StakeGoodAccounting",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "stakerAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint40",
        "name": "stakeId",
        "type": "uint40"
      }
    ],
    "name": "StakeStart",
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
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "memberAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "entryId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "referrerAddr",
        "type": "address"
      }
    ],
    "name": "XfLobbyEnter",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "data0",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "memberAddr",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "entryId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "referrerAddr",
        "type": "address"
      }
    ],
    "name": "XfLobbyExit",
    "type": "event"
  },
  {
    "payable": true,
    "stateMutability": "payable",
    "type": "fallback"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "allocatedSupply",
    "outputs": [
      {
        "internalType": "uint256",
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
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
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
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
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
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rawSatoshis",
        "type": "uint256"
      },
      {
        "internalType": "bytes32[]",
        "name": "proof",
        "type": "bytes32[]"
      },
      {
        "internalType": "address",
        "name": "claimToAddr",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyX",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyY",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "claimFlags",
        "type": "uint8"
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
      },
      {
        "internalType": "uint256",
        "name": "autoStakeDays",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "referrerAddr",
        "type": "address"
      }
    ],
    "name": "btcAddressClaim",
    "outputs": [
      {
        "internalType": "uint256",
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
    "inputs": [
      {
        "internalType": "bytes20",
        "name": "",
        "type": "bytes20"
      }
    ],
    "name": "btcAddressClaims",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
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
        "internalType": "bytes20",
        "name": "btcAddr",
        "type": "bytes20"
      },
      {
        "internalType": "uint256",
        "name": "rawSatoshis",
        "type": "uint256"
      },
      {
        "internalType": "bytes32[]",
        "name": "proof",
        "type": "bytes32[]"
      }
    ],
    "name": "btcAddressIsClaimable",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
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
        "internalType": "bytes20",
        "name": "btcAddr",
        "type": "bytes20"
      },
      {
        "internalType": "uint256",
        "name": "rawSatoshis",
        "type": "uint256"
      },
      {
        "internalType": "bytes32[]",
        "name": "proof",
        "type": "bytes32[]"
      }
    ],
    "name": "btcAddressIsValid",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "claimToAddr",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "claimParamHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyX",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyY",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "claimFlags",
        "type": "uint8"
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
    "name": "claimMessageMatchesSignature",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "currentDay",
    "outputs": [
      {
        "internalType": "uint256",
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
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "dailyData",
    "outputs": [
      {
        "internalType": "uint72",
        "name": "dayPayoutTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint72",
        "name": "dayStakeSharesTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint56",
        "name": "dayUnclaimedSatoshisTotal",
        "type": "uint56"
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
        "internalType": "uint256",
        "name": "beginDay",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "endDay",
        "type": "uint256"
      }
    ],
    "name": "dailyDataRange",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "list",
        "type": "uint256[]"
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
        "internalType": "uint256",
        "name": "beforeDay",
        "type": "uint256"
      }
    ],
    "name": "dailyDataUpdate",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
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
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "subtractedValue",
        "type": "uint256"
      }
    ],
    "name": "decreaseAllowance",
    "outputs": [
      {
        "internalType": "bool",
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
    "inputs": [],
    "name": "globalInfo",
    "outputs": [
      {
        "internalType": "uint256[13]",
        "name": "",
        "type": "uint256[13]"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "globals",
    "outputs": [
      {
        "internalType": "uint72",
        "name": "lockedHeartsTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint72",
        "name": "nextStakeSharesTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint40",
        "name": "shareRate",
        "type": "uint40"
      },
      {
        "internalType": "uint72",
        "name": "stakePenaltyTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint16",
        "name": "dailyDataCount",
        "type": "uint16"
      },
      {
        "internalType": "uint72",
        "name": "stakeSharesTotal",
        "type": "uint72"
      },
      {
        "internalType": "uint40",
        "name": "latestStakeId",
        "type": "uint40"
      },
      {
        "internalType": "uint128",
        "name": "claimStats",
        "type": "uint128"
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
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "addedValue",
        "type": "uint256"
      }
    ],
    "name": "increaseAllowance",
    "outputs": [
      {
        "internalType": "bool",
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
        "internalType": "bytes32",
        "name": "merkleLeaf",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32[]",
        "name": "proof",
        "type": "bytes32[]"
      }
    ],
    "name": "merkleProofIsValid",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
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
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pubKeyX",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyY",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "claimFlags",
        "type": "uint8"
      }
    ],
    "name": "pubKeyToBtcAddress",
    "outputs": [
      {
        "internalType": "bytes20",
        "name": "",
        "type": "bytes20"
      }
    ],
    "payable": false,
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pubKeyX",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pubKeyY",
        "type": "bytes32"
      }
    ],
    "name": "pubKeyToEthAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "stakerAddr",
        "type": "address"
      }
    ],
    "name": "stakeCount",
    "outputs": [
      {
        "internalType": "uint256",
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
        "internalType": "uint256",
        "name": "stakeIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "stakeIdParam",
        "type": "uint40"
      }
    ],
    "name": "stakeEnd",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "address",
        "name": "stakerAddr",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "stakeIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "stakeIdParam",
        "type": "uint40"
      }
    ],
    "name": "stakeGoodAccounting",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "stakeLists",
    "outputs": [
      {
        "internalType": "uint40",
        "name": "stakeId",
        "type": "uint40"
      },
      {
        "internalType": "uint72",
        "name": "stakedHearts",
        "type": "uint72"
      },
      {
        "internalType": "uint72",
        "name": "stakeShares",
        "type": "uint72"
      },
      {
        "internalType": "uint16",
        "name": "lockedDay",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "stakedDays",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "unlockedDay",
        "type": "uint16"
      },
      {
        "internalType": "bool",
        "name": "isAutoStake",
        "type": "bool"
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
        "internalType": "uint256",
        "name": "newStakedHearts",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "newStakedDays",
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
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
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
    "name": "totalSupply",
    "outputs": [
      {
        "internalType": "uint256",
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
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
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
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
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
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "xfLobby",
    "outputs": [
      {
        "internalType": "uint256",
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
        "internalType": "address",
        "name": "referrerAddr",
        "type": "address"
      }
    ],
    "name": "xfLobbyEnter",
    "outputs": [],
    "payable": true,
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "memberAddr",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "entryId",
        "type": "uint256"
      }
    ],
    "name": "xfLobbyEntry",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "rawAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "referrerAddr",
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
        "internalType": "uint256",
        "name": "enterDay",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      }
    ],
    "name": "xfLobbyExit",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [],
    "name": "xfLobbyFlush",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
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
    "name": "xfLobbyMembers",
    "outputs": [
      {
        "internalType": "uint40",
        "name": "headIndex",
        "type": "uint40"
      },
      {
        "internalType": "uint40",
        "name": "tailIndex",
        "type": "uint40"
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
        "internalType": "address",
        "name": "memberAddr",
        "type": "address"
      }
    ],
    "name": "xfLobbyPendingDays",
    "outputs": [
      {
        "internalType": "uint256[2]",
        "name": "words",
        "type": "uint256[2]"
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
        "internalType": "uint256",
        "name": "beginDay",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "endDay",
        "type": "uint256"
      }
    ],
    "name": "xfLobbyRange",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "list",
        "type": "uint256[]"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
] as const

export default {
  START_DATE_POSIX,
  START_DATE,
  GENESIS_BLOCK,
  CLAIM_PHASE_START_DAY,
  CLAIM_PHASE_DAYS,
  CLAIM_PHASE_END_DAY,
  BIG_PAY_DAY,
  CLAIMABLE_BTC_ADDR_COUNT,
  CLAIMABLE_SATOSHIS_TOTAL,
  HEARTS_PER_SATOSHI,
  DECIMALS,
  HEARTS_PER_HEX,
  HEART_UINT_SIZE,
  HEART_UINT_MASK,
  SATOSHI_UINT_SIZE,
  SATOSHI_UINT_MASK,
  LPB_BONUS_PERCENT,
  LPB_BONUS_MAX_PERCENT,
  LPB,
  LPB_MAX_DAYS,
  BPB_BONUS_PERCENT,
  BPB_MAX_HEX,
  BPB_MAX_HEARTS,
  BPB,
  EARLY_PENALTY_MIN_DAYS,
  LATE_PENALTY_GRACE_DAYS,
  LATE_PENALTY_SCALE_DAYS,
  CHAIN_ADDRESSES,
  ABI,
}