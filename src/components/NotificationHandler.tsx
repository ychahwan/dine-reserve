import { useEffect, useCallback } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface NotificationHandlerProps {
  children: React.ReactNode;
}

/**
 * Handles push notification registration and lifecycle.
 * Wrap this around your app to enable push notifications.
 */
export function NotificationHandler({ children }: NotificationHandlerProps) {
  const { user } = useAuth();
  const saveToken = useMutation(api.notifications.saveToken);
  const removeToken = useMutation(api.notifications.removeToken);

  const handleNotificationReceived = useCallback(
    (notification: { title?: string; body?: string }) => {
      // Show in-app toast when notification received while app is open
      toast.info(notification.title || "New Notification", {
        description: notification.body,
        duration: 5000,
      });
    },
    [],
  );

  const handleNotificationAction = useCallback(
    (action: { notification?: { data?: Record<string, unknown> } }) => {
      // Handle notification tap - navigate based on data
      const data = action.notification?.data;
      if (data?.type === "booking_confirmed" && data?.bookingId) {
        window.location.href = `/my-bookings`;
      } else if (data?.type === "waitlist_alert" && data?.restaurantId) {
        window.location.href = `/restaurant/${data.restaurantId}`;
      }
    },
    [],
  );

  const { token, registered, register } = usePushNotifications({
    onNotificationReceived: handleNotificationReceived,
    onNotificationAction: handleNotificationAction,
  });

  // Save token to backend when user is logged in and token is available
  useEffect(() => {
    if (user && token && registered) {
      saveToken({
        token,
        platform: "android",
        userId: user._id,
      }).catch(console.error);
    }
  }, [user, token, registered, saveToken]);

  // Remove token when user logs out
  useEffect(() => {
    if (!user && token) {
      removeToken({ token }).catch(console.error);
    }
  }, [user, token, removeToken]);

  // Auto-register when component mounts (if user is logged in)
  useEffect(() => {
    if (user && !registered) {
      register().catch(console.error);
    }
  }, [user, registered, register]);

  return <>{children}</>;
}

/**
 * Button to manually request notification permissions
 */
export function NotificationPermissionButton() {
  const { register, registered, loading } = usePushNotifications();

  if (registered) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <span>✓</span>
        <span>Notifications enabled</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => register()}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
    >
      {loading ? (
        <>
          <span className="animate-spin">⟳</span>
          <span>Enabling...</span>
        </>
      ) : (
        <>
          <span>🔔</span>
          <span>Enable Notifications</span>
        </>
      )}
    </button>
  );
}
