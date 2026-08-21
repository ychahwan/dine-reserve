import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const SetPassword = lazy(() => import("./pages/SetPassword.tsx"));
const AdminShell = lazy(() => import("./components/AdminShell.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminRestaurants = lazy(() => import("./pages/admin/AdminRestaurants.tsx"));
const AdminRestaurantDetail = lazy(() => import("./pages/admin/AdminRestaurantDetail.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail.tsx"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews.tsx"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit.tsx"));
const AdminRegister = lazy(() => import("./pages/admin/AdminRegister.tsx"));
const AdminTag = lazy(() => import("./pages/admin/AdminTag.tsx"));
const Explore = lazy(() => import("./pages/Explore.tsx"));
const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail.tsx"));
const MyBookings = lazy(() => import("./pages/MyBookings.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard.tsx"));
const OwnerRestaurant = lazy(() => import("./pages/OwnerRestaurant.tsx"));
const Invite = lazy(() => import("./pages/Invite.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              {/* Role router: onboarding → customer / owner workspace */}
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              {/* Forced password change for restaurant accounts tagged by admin */}
              <Route
                path="/set-password"
                element={
                  <RequireAuth>
                    <SetPassword />
                  </RequireAuth>
                }
              />
              {/* Platform admin console (role-gated in AdminShell) */}
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminShell />
                  </RequireAuth>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="restaurants" element={<AdminRestaurants />} />
                <Route path="restaurants/:id" element={<AdminRestaurantDetail />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:id" element={<AdminUserDetail />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="register" element={<AdminRegister />} />
                <Route path="tag" element={<AdminTag />} />
              </Route>
              {/* Customer app */}
              <Route
                path="/explore"
                element={
                  <RequireAuth>
                    <Explore />
                  </RequireAuth>
                }
              />
              <Route
                path="/restaurant/:id"
                element={
                  <RequireAuth>
                    <RestaurantDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/bookings"
                element={
                  <RequireAuth>
                    <MyBookings />
                  </RequireAuth>
                }
              />
              <Route
                path="/account"
                element={
                  <RequireAuth>
                    <Account />
                  </RequireAuth>
                }
              />
              {/* Owner app */}
              <Route
                path="/owner"
                element={
                  <RequireAuth>
                    <OwnerDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/owner/restaurant/:id"
                element={
                  <RequireAuth>
                    <OwnerRestaurant />
                  </RequireAuth>
                }
              />
              {/* Group invites */}
              <Route
                path="/invite/:code"
                element={
                  <RequireAuth>
                    <Invite />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
