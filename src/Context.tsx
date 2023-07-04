import { createContext } from 'react'
import { HexData } from './hex_contract'

export const HexContext = createContext(undefined as HexData | undefined)

