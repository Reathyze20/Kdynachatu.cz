/**
 * hooks/useSocket.ts — Socket.io client hook with JWT auth and cabin rooms.
 * Connects once per mount, auto-disconnects on unmount.
 * Provides `on`, `off`, `emit` helpers bound to the current connection.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import apiClient from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { markDataReceived } from '@/lib/dataFreshness'

/** Prodleva před ověřením relace: změna vlastního hesla odpojí i tohle zařízení a nový token z odpovědi ověření zruší. */
const SESSION_CHECK_DELAY_MS = 3000

/**
 * Connect to the Socket.io server, authenticated via JWT.
 * Re-connects when the token changes. Disconnects on unmount.
 *
 * @returns `{ on, off, emit, connected }` — socket event helpers
 */
export function useSocket() {
  const { token } = useAuth()
  const socketRef = useRef<Socket | null>(null)
  const [socketGeneration, setSocketGeneration] = useState(0)

  useEffect(() => {
    if (!token) return

    const socket = io({
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    // Server spojení ukončil nebo handshake odmítl (zneplatněné přihlášení, #486): Socket.IO se samo nepřipojí.
    // Rozhodne REST – 401/403 zpracuje interceptor apiClient a pošle na přihlášení; platná relace = připojit znovu.
    let sessionCheck: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const verifySessionSoon = () => {
      clearTimeout(sessionCheck)
      sessionCheck = setTimeout(() => {
        apiClient.get('/users/me').then(() => !closed && socket.connect(), () => undefined)
      }, SESSION_CHECK_DELAY_MS)
    }
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') verifySessionSoon()
    })
    socket.on('connect_error', () => {
      if (!socket.active) verifySessionSoon()
    })

    // Heartbeat realtime spojení: změny chodí socketem, data jsou čerstvá i bez GET (E4, #276)
    socket.io.on('ping', () => markDataReceived())
    socketRef.current = socket
    setSocketGeneration((g) => g + 1)

    return () => {
      closed = true
      clearTimeout(sessionCheck)
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  const on = useCallback(<T = unknown>(event: string, handler: (data: T) => void) => {
    socketRef.current?.on(event, handler as (...args: unknown[]) => void)
  }, [])

  const off = useCallback(<T = unknown>(event: string, handler?: (data: T) => void) => {
    socketRef.current?.off(event, handler as ((...args: unknown[]) => void) | undefined)
  }, [])

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data)
  }, [])

  return { on, off, emit, socketGeneration }
}
