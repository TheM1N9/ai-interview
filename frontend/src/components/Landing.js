import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Landing.css";

function Landing() {
  const { token } = useAuth();

  return (
    <div className="landing-container">
      <div className="hero-section">
        <h1>Master Your Interviews</h1>
        <p className="hero-subtitle">
          AI-powered interview preparation tailored to your experience and
          target companies
        </p>
        <div className="cta-buttons">
          {token ? (
            <Link to="/dashboard" className="cta-button primary">
              Start an Interview
            </Link>
          ) : (
            <>
              <Link to="/register" className="cta-button primary">
                Get Started
              </Link>
              <Link to="/login" className="cta-button secondary">
                Sign In
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="features-section">
        <h2>Why Choose InterviewPrep AI?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Personalized Questions</h3>
            <p>Questions tailored to your resume and target company</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💡</div>
            <h3>Real-time Feedback</h3>
            <p>Instant analysis of your answers with detailed feedback</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Skill Progress</h3>
            <p>Track your improvement across different topics</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI-Powered</h3>
            <p>Advanced AI technology for realistic interview scenarios</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Landing;
