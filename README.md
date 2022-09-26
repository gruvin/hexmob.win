# Solidity API

## TimeCapsule

### PENALTY_RATE

```solidity
uint256 PENALTY_RATE
```

### NO_EXPECTATIONS

```solidity
address NO_EXPECTATIONS
```

### owner

```solidity
address owner
```

_Regarding the (yet to be developed) penalty income stash and its
        distribution to founders; Nothing has been decided but the general
        thought suggests some form of arbitrator contract that ensure claims
        from founder addresses are each locked to the whatever proportion we end
        up agreeing on (personally a 1:1:1 ratio suites but we should obviously
        discuss this. For example, ongoing front development could stretch out
        far beyond contract deployment ... so maybe we lock down "founder" as
        opposed to hours of labour or something? (Labour of course should
        forever remain within the ethos of No Hexpectations.)_

### Lock

```solidity
struct Lock {
  uint256 lockedAmount;
  uint256 sumWithdrawn;
  uint256 lockTime;
  uint256 unlockTime;
}
```

### _locks

```solidity
mapping(address => struct TimeCapsule.Lock[]) _locks
```

### deadmanTimer

```solidity
uint256 deadmanTimer
```

### deadmanAddress

```solidity
address deadmanAddress
```

### lastWriteTime

```solidity
uint256 lastWriteTime
```

### constructor

```solidity
constructor() public
```

### onlyCapsuleOwner

```solidity
modifier onlyCapsuleOwner()
```

_Because this contract is cloned from a factory contract (Clone.sol)
          functions herein get called **twice**. The first call has `msg.sender`
          set as the address of the caller, as usual. The second _proxy_ call
          has `msg.sender` set to this contract's own address. The present
          solution is to roll our own 'Ownable' (minus transferability) and with
          a different name rather than 'onlyOwner', to avoid confusion._

### initialize

```solidity
function initialize(address _newOwner, uint256 _deadmanTimer, address _deadmanAddress) public
```

### lockData

```solidity
function lockData(address extERC20, uint256 index) public view returns (struct TimeCapsule.Lock lock)
```

### lockCount

```solidity
function lockCount(address extERC20) public view returns (uint256 count)
```

### hasDeadmanAddress

```solidity
function hasDeadmanAddress() public view returns (bool)
```

### Locked

```solidity
event Locked(address owner, address extERC20, uint256 amount, uint256 lockTime, uint256 unlockTime)
```

Emitted upon successful token lock

_**DESIGN DECISION**: We probably shouldn't be emitting the owner here_

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | The vault's owner address |
| extERC20 | address | Address of the external ERC20 token contract |
| amount | uint256 | The value locked expressed in the external token's native base unit |
| lockTime | uint256 | Start time of the new lock (UNIX timestamp). Can be in the future, in which case `amount` will be free to withdraw prior to this time. (Seven day withdrawal timelock still aplies.) |
| unlockTime | uint256 | End time of the new lock (UNIX timestamp). Must be after `lockTime`) |

### createLock

```solidity
function createLock(address _externalERC20address, uint256 _lockAmount, uint256 _lockTime, uint256 _unlockTime) public
```

_Requires that user has approved >= units to be transferred by us to
       our user's capsule._

### estimateAllowance

```solidity
function estimateAllowance(address extERC20, uint256 index) public view returns (uint256 withdrawalAllowance)
```

**NOTE**: For small locked amounts over longer lock terms,
       calculations _could potentially_ round to zero over short time frames
       (until enough additional time has been served for the next 'drip').

_**TODO**: Ensure the frontend UI captures this detail when/if it crops up
       in practice.)_

| Name | Type | Description |
| ---- | ---- | ----------- |
| extERC20 | address | Address of the external ERC20 token contract to be locked        in this SmartVault |
| index | uint256 | lock array index for this extERC20 address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| withdrawalAllowance | uint256 | available balance to withdraw in the ERC's        native base unit |

### Retired

```solidity
event Retired(address owner, address extERC20)
```

### Withdrawal

```solidity
event Withdrawal(address owner, address extERC20, uint256 amount)
```

### initiateWithdrawal

```solidity
function initiateWithdrawal(address _externalERC20address, uint256 _lockIndex) public returns (bool)
```

### sendWithdrawal

```solidity
function sendWithdrawal(address _externalERC20address, uint256 _lockIndex) public returns (bool)
```

### _verifyTimeSignature

```solidity
function _verifyTimeSignature(bytes signature, uint256 unix_time, uint256 deadline) public view returns (address)
```

_This function may no longer be needed. It was originally to check
       signed messages from our server. It may become useful again later so I'm
       leaving it here for now._

## TimeCapsuleFactory

### timeCapsuleImplementation

```solidity
address timeCapsuleImplementation
```

### constructor

```solidity
constructor() public
```

### TimeCapsuleCreated

```solidity
event TimeCapsuleCreated(address capsuleAddress)
```

### createTimeCapsule

```solidity
function createTimeCapsule(uint256 _deadmanTimer, address _deadmanAddress) public returns (address capsuleAddress)
```

### createTimeCapsule

```solidity
function createTimeCapsule(uint256 _deadmanTimer) public returns (address cloneAddress)
```

### createTimeCapsule

```solidity
function createTimeCapsule() public returns (address cloneAddress)
```

## SomeToken

### constructor

```solidity
constructor(uint256 initialSupply) public
```

### decimals

```solidity
function decimals() public view virtual returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless this function is
overridden;

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

