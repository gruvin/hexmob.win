'use strict';

import BigNumber from 'bignumber.js'

const Web3 = jest.genMockFromModule('web3')
const fakeAccounts = [ '0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2' ]
class fakeWeb3Provider extends Web3 {
    constructor(params) {
        super(params)
        const _self = this
        this.chainId = '0x1',
        this.name = 'fake provider'
        this.currentProvider = { chainId: '0x1' }
        this.enable = jest.fn(),
        this.eth = { 
            handleRevert: false,
            accounts: fakeAccounts,
            givenProvider: {
                address: fakeAccounts[0], // TrustWallet
                selectedAddress: fakeAccounts[0] // MetaMask
            },
            Contract: class extends Object {
                constructor(params) {
                    super(params)
                    return {
                        methods: {
                            balanceOf: () => function call() { return BigNumber(1000e8).toString() },
                            allocatedSupply: () => function call() { return BigNumber(1000e8).toString() },
                            currentDay: () => function call() { return BigNumber(1000e8).toString() },
                            globals: () => function call() { return BigNumber(1000e8).toString() },
                        }
                    }
                }
            },
        }
        this.setAddress = jest.fn()
        this.providers = { WebsocketProvider: jest.fn() }
        this.eth.givenProvider = this // [Circular]
    }
}

export default fakeWeb3Provider
