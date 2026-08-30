import {
  PushNotifications,
  PushNotificationSchema,
  PushNotificationActionPerformed,
  Token,
} from "@capacitor/push-notifications";
import {
  useState,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";

const MAX_RECENT_NOTIFICATIONS = 50;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const [notifications, setNotifications] = useState<PushNotificationSchema[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleNotificationReceived = useEffectEvent(
    (notification: PushNotificationSchema) => {
      options?.onNotificationReceived?.(notification);
    },
  );
  const handleNotificationAction = useEffectEvent(
    (action: PushNotificationActionPerformed) => {
      options?.onNotificationAction?.(action);
    },
  );

  // Deferred resolution: register() awaits the token delivered asynchronously
  // by the "registration" listener instead of returning stale state (H-24).
  const pendingResolveRef = useRef<((token: string | null) => void) | null>(
    null,
  );

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const result = await PushNotifications.requestPermissions();
      return result.receive === "granted";
    } catch (err: unknown) {
      setRegistrationError(errorMessage(err, "Failed to request permissions"));
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

      const tokenPromise = new Promise<string | null>((resolve) => {
        pendingResolveRef.current = resolve;
      });

      // Register for push notifications — the listener resolves the deferred.
      await PushNotifications.register();

      // Safety valve so the caller never hangs forever if the OS never fires
      // registration (the late token still lands in state via the listener).
      const result = await Promise.race([
        tokenPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]);
      return result;
    } catch (err: unknown) {
      setRegistrationError(
        errorMessage(err, "Failed to register for push notifications"),
      );
      return null;
    } finally {
      pendingResolveRef.current = null;
      setLoading(false);
    }
  }, [requestPermissions]);

  const unregister = useCallback(async (): Promise<void> => {
    try {
      await PushNotifications.unregister();
      setToken(null);
      setRegistered(false);
    } catch (err: unknown) {
      console.error("Failed to unregister:", err);
    }
  }, []);

  const getDeliveredNotifications = useCallback(async (): Promise<
    PushNotificationSchema[]
  > => {
    try {
      const result = await PushNotifications.getDeliveredNotifications();
      return result.notifications;
    } catch (err: unknown) {
      console.error("Failed to get delivered notifications:", err);
      return [];
    }
  }, []);

  const clearDeliveredNotifications = useCallback(async (): Promise<void> => {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
      setNotifications([]);
    } catch (err: unknown) {
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
        // Resolve any in-flight register() call.
        pendingResolveRef.current?.(token.value);
        pendingResolveRef.current = null;
      },
    );

    // Listen for registration errors
    const regErrorListener = PushNotifications.addListener(
      "registrationError",
      (error: unknown) => {
        setRegistrationError(errorMessage(error, "Registration failed"));
        pendingResolveRef.current?.(null);
        pendingResolveRef.current = null;
      },
    );

    // Listen for incoming notifications (foreground)
    const receivedListener = PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        setNotifications((prev) =>
          [notification, ...prev].slice(0, MAX_RECENT_NOTIFICATIONS),
        );
        handleNotificationReceived(notification);
      },
    );

    // Listen for notification actions (tap)
    const actionListener = PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: PushNotificationActionPerformed) => {
        handleNotificationAction(action);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize with the native OS registration API
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
