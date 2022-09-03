'use strict'

import React from 'react'
import Enzyme, { shallow, mount, render } from 'enzyme'
import Adapter from 'enzyme-adapter-react-16'
Enzyme.configure({ adapter: new Adapter() })

import App from './App'

jest.mock('./util')
import util from './util'

jest.mock('web3') // see __mocks__/
import Web3 from 'web3' // <-- this line is needed to activate the mock. WHAT?! Jest is WEIRD.

/*
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});
*/

// let windowSpy
let selectWeb3ModalWalletSpy
beforeEach(() => {
    const fakeWeb3Provider = new Web3()
    global.window.web3 = fakeWeb3Provider
    global.window.Trust = function(args) { 
        return fakeWeb3Provider
    }
    selectWeb3ModalWalletSpy = jest.spyOn(App.prototype, 'selectWeb3ModalWallet')
    selectWeb3ModalWalletSpy.mockImplementation(() => Promise.resolve(null) )
    util.detectTrustWallet = () => false
})

afterEach(() => {
    selectWeb3ModalWalletSpy.mockRestore()
})

describe("App", () => {
    test('initial state (constructor working)', () => {
        const wrapper = shallow(<App />)
        expect(wrapper.instance().state).toMatchSnapshot()
    })

    it('should render without throwing an error', () => {
        const wrapper = shallow(<App />)
        expect(wrapper.exists('#hexmob_header')).toBe(true)
    })

    it('should not call connectWeb3ModalWallet() if TrustWallet detected', () => {
        util.detectTrustWallet = () => false
        const wrapper = shallow(<App />)
        expect(wrapper.exists('#hexmob_header')).toBe(true)
        expect(selectWeb3ModalWalletSpy).not.toHaveBeenCalled()
    })

    it('should not call selectWeb3ModalWallet() unless [Connect Wallet] button pressed', () => {
        const wrapper = mount(<App />)
        expect(selectWeb3ModalWalletSpy).not.toHaveBeenCalled()
        wrapper.find('Button#connect_wallet').invoke('onClick')()
        expect(selectWeb3ModalWalletSpy).toHaveBeenCalled()
    })
    
})
