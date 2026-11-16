import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AltaSplashScreen from "./components/AltaSplashScreen";
import { isAuthenticated } from "./api";
import { isCryptoUnlocked } from "./crypto";

// Route-level code splitting keeps the first screen small on slower connections.
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const RoomsPage = lazy(() => import("./pages/RoomsPage"));
const ChatRoomPage = lazy(() => import("./pages/ChatRoomPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const InviteJoinPage = lazy(() => import("./pages/InviteJoinPage"));

function Protected({ children }: { children: JSX.Element }) {
  const location = useLocation();
  return isAuthenticated() && isCryptoUnlocked() ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

export default function App() {
  return (
    <Suspense fallback={<AltaSplashScreen />}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/invite/:token" element={<Protected><InviteJoinPage /></Protected>} />
        <Route path="/" element={<Protected><RoomsPage /></Protected>} />
        <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
        <Route path="/rooms/:roomId" element={<Protected><ChatRoomPage /></Protected>} />
        <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
