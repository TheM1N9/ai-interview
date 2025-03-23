import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./components/Landing";
import Login from "./components/Login";
import Register from "./components/Register";
import Profile from "./components/Profile";
import Interview from "./components/Interview";
import UploadForm from "./components/UploadForm";
import FeedbackDashboard from "./components/FeedbackDashboard";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import "./App.css";
import "./styles/Landing.css";

const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="loading-spinner"></div>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return token ? children : <Navigate to="/login" />;
};

const AppLayout = ({ children }) => (
  <div className="app-layout">
    <Navbar />
    <div className="app-background">
      <div className="gradient-sphere gradient-1"></div>
      <div className="gradient-sphere gradient-2"></div>
    </div>
    <div className="app-content">{children}</div>
    <Footer />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <UploadForm />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/interview"
              element={
                <PrivateRoute>
                  <Interview />
                </PrivateRoute>
              }
            />
          </Routes>
        </AppLayout>
      </Router>
    </AuthProvider>
  );
}

export default App;
