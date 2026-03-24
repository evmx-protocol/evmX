import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Provides a live seconds-elapsed counter that ticks every second.
 * Components use it to locally interpolate timer values between poll cycles.
 */
export function useTimer(interval = 1000) {
  const [tick, setTick] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    const id = setInterval(() => {
      setTick(Math.floor((Date.now() - startRef.current) / 1000))
    }, interval)
    return () => clearInterval(id)
  }, [interval])

  /** Reset the counter (call after each pool data refresh) — stable ref */
  const reset = useCallback(() => {
    startRef.current = Date.now()
    setTick(0)
  }, [])

  return { elapsed: tick, reset }
}
