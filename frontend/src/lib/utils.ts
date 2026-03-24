import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtEth(v: number): string {
  if (v >= 1000) return v.toFixed(1) + 'K'
  if (v >= 100) return v.toFixed(1)
  if (v >= 1) return v.toFixed(3)
  if (v >= 0.01) return v.toFixed(4)
  if (v >= 0.0001) return v.toFixed(6)
  if (v > 0) return '<0.0001'
  return '0'
}

export function fmtTimer(s: number): string {
  if (s <= 0) return 'Ready!'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function fmtAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export function fmtUsd(eth: number, price: number): string {
  if (eth <= 0 || price <= 0) return ''
  return '$' + (eth * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function sanitizeHex(s: string): string {
  return typeof s === 'string' ? s.replace(/[^a-fA-F0-9x]/g, '') : ''
}
