import { useState, useCallback, useRef, useEffect } from 'react'
import { ethers } from 'ethers'
import { BASE_RPC, FALLBACK_RPCS, CHAIN_ID, CHAIN_NAME, SCAN_BASE, CONTRACT_ADDRESS } from '@/lib/constants'
import { EVMX_ABI } from '@/lib/abi'

export function useProvider() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [userAddr, setUserAddr] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const rpcIndexRef = useRef(0)
  const roProviderRef = useRef<ethers.JsonRpcProvider | null>(null)
  const roContractRef = useRef<ethers.Contract | null>(null)
  const signerContractRef = useRef<ethers.Contract | null>(null)

  // Initialize read-only provider
  useEffect(() => {
    try {
      const rp = new ethers.JsonRpcProvider(BASE_RPC)
      roProviderRef.current = rp
      roContractRef.current = new ethers.Contract(CONTRACT_ADDRESS, EVMX_ABI, rp)
    } catch (e) {
      console.error('RPC init error:', e)
    }
  }, [])

  const getContract = useCallback(() => {
    return signerContractRef.current || roContractRef.current
  }, [])

  const getReadOnlyContract = useCallback(() => {
    return roContractRef.current
  }, [])

  const reconnectRpc = useCallback(() => {
    rpcIndexRef.current = (rpcIndexRef.current + 1) % FALLBACK_RPCS.length
    const url = FALLBACK_RPCS[rpcIndexRef.current]
    try {
      const rp = new ethers.JsonRpcProvider(url)
      roProviderRef.current = rp
      roContractRef.current = new ethers.Contract(CONTRACT_ADDRESS, EVMX_ABI, rp)
    } catch (e) {
      console.error('RPC reconnect failed:', e)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('No wallet detected')
    const bp = new ethers.BrowserProvider(window.ethereum)
    const accs = await bp.send('eth_requestAccounts', [])
    const net = await bp.getNetwork()
    if (Number(net.chainId) !== CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + CHAIN_ID.toString(16) }],
        })
      } catch (e: unknown) {
        const err = e as { code?: number }
        if (err.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x' + CHAIN_ID.toString(16),
              chainName: CHAIN_NAME,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [BASE_RPC],
              blockExplorerUrls: [SCAN_BASE],
            }],
          })
        } else throw e
      }
    }
    const s = await bp.getSigner()
    const addr = accs[0]
    setProvider(bp)
    setSigner(s)
    setUserAddr(addr)
    setIsConnected(true)
    signerContractRef.current = new ethers.Contract(CONTRACT_ADDRESS, EVMX_ABI, s)
    return addr
  }, [])

  const disconnect = useCallback(() => {
    setProvider(null)
    setSigner(null)
    setUserAddr(null)
    setIsConnected(false)
    signerContractRef.current = null
  }, [])

  return {
    provider, signer, userAddr, isConnected,
    connect, disconnect, reconnectRpc,
    getContract, getReadOnlyContract,
  }
}
