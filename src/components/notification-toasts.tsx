"use client"

import { useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { subscribeToNotifications, type NotificationRecord } from "@/services/notifications"
import { toastInfo, toastWarning } from "@/lib/toast"

/**
 * Subscribes to realtime notifications and shows toasts for tracker-relevant events.
 * Currently: displays a toast when a new pin is reported (type: pin_reported).
 */
export function NotificationToasts() {
  const { user, isAuthenticated } = useAuth()
  const recipientType = user?.isOrg ? 'organization' as const : 'user' as const

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return

    const channel = subscribeToNotifications(
      user.id,
      (n: NotificationRecord) => {
        try {
          if (n.type === "pin_reported" || n.type === "pin_confirmed" || n.type === "pin_confirmed_owner") {
            const payload = typeof n.payload === "string" ? JSON.parse(n.payload) : (n.payload || {})
            const isDamaged = payload?.type === "damaged"

            const title = n.title || (isDamaged ? "Pin Notification" : "Pin Notification")
            const descBase = n.body || payload?.description || "There is a new pin update."
            const desc = typeof descBase === "string" ? descBase : JSON.stringify(descBase)

            if (isDamaged) {
              toastWarning(title, desc)
            } else {
              toastInfo(title, desc)
            }
          }
        } catch (err) {
          // Avoid breaking subscription on any parse errors
          console.warn("[NotificationToasts] handler error", err)
        }
      },
      { recipientType }
    )

    return () => {
      try { (channel as any)?.unsubscribe?.() } catch {}
    }
  }, [isAuthenticated, recipientType, user?.id])

  return null
}
