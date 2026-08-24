import {
  PushNotifications,
  PushNotificationSchema,
  PushNotificationActionPerformed,
  Token,
} from "@capacitor/push-notifications";
import { useState, useCallback, useEffect, useRef } from "react";

interface UsePushNotificationsOptions {
  autoRegister?: boolean;
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationAction?: (action: PushNotificationActionPerformed) => void;
}

interface UsePushNotificationsReturn {
  token: string | null;
  registrationError: string | null;
  notifications: PushNotificationSchema[];
  loading: boolean;
  registered: boolean;
  register: () => Promise<string | null>;
  unregister: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  getDeliveredNotifications: () => Promise<PushNotificationSchema[]>;
  clearDeliveredNotifications: () => Promise<void>;
}

/**
 * Hook for handling push notifications with Capacitor.
 *
 * @example
 * ```tsx
 * const { token, register, registered } = usePushNotifications({
 *   onNotificationReceived: (notification) => {
 *     console.log("New notification:", notification);
 *   },
 * });
 *
 * // Send token to your backend for FCM registration
 * useEffect(() => {
 *   if (token) {
 *     saveTokenToBackend(token);
 *   }
 * }, [token]);
 * ```
 */
export function usePushNotifications(
  options?: UsePushNotificationsOptions,
): UsePushNotificationsReturn {
  const [token, setToken] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotificationSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const result = await PushNotifications.requestPermissions();
      return result.receive === "granted";
    } catch (err: any) {
      setRegistrationError(err?.message || "Failed to request permissions");
      return false;
    }
  }, []);

  const register = useCallback(async (): Promise<string | null> => {
    setLoading(true);
    setRegistrationError(null);
    try {
      // Request permission first
      const granted = await requestPermissions();
      if (!granted) {
        setRegistrationError("Notification permission denied");
        return null;
      }

      // Register for push notifications
      await PushNotifications.register();

      // Wait for token (handled in listener)
      return token;
    } catch (err: any) {
      setRegistrationError(err?.message || "Failed to register for push notifications");
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestPermissions, token]);

  const unregister = useCallback(async (): Promise<void> => {
    try {
      await PushNotifications.unregister();
      setToken(null);
      setRegistered(false);
    } catch (err: any) {
      console.error("Failed to unregister:", err);
    }
  }, []);

  const getDeliveredNotifications = useCallback(async (): Promise<PushNotificationSchema[]> => {
    try {
      const result = await PushNotifications.getDeliveredNotifications();
      return result.notifications;
    } catch (err: any) {
      console.error("Failed to get delivered notifications:", err);
      return [];
    }
  }, []);

  const clearDeliveredNotifications = useCallback(async (): Promise<void> => {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
      setNotifications([]);
    } catch (err: any) {
      console.error("Failed to clear delivered notifications:", err);
    }
  }, []);

  useEffect(() => {
    // Listen for registration success
    const regListener = PushNotifications.addListener(
      "registration",
      (token: Token) => {
        setToken(token.value);
        setRegistered(true);
      },
    );

    // Listen for registration errors
    const regErrorListener = PushNotifications.addListener(
      "registrationError",
      (error: any) => {
        setRegistrationError(error?.message || "Registration failed");
      },
    );

    // Listen for incoming notifications (foreground)
    const receivedListener = PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        setNotifications((prev) => [notification, ...prev]);
        optionsRef.current?.onNotificationReceived?.(notification);
      },
    );

    // Listen for notification actions (tap)
    const actionListener = PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: PushNotificationActionPerformed) => {
        optionsRef.current?.onNotificationAction?.(action);
      },
    );

    return () => {
      regListener.then((l) => l.remove());
      regErrorListener.then((l) => l.remove());
      receivedListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
    };
  }, []);

  // Auto-register if enabled
  useEffect(() => {
    if (options?.autoRegister) {
      register();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    token,
    registrationError,
    notifications,
    loading,
    registered,
    register,
    unregister,
    requestPermissions,
    getDeliveredNotifications,
    clearDeliveredNotifications,
  };
}
