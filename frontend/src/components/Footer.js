import React from "react";
import { Link } from "react-router-dom";
import "../styles/Footer.css";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>InterviewPrep AI</h4>
          <p>Empowering students to ace their interviews</p>
        </div>
        <div className="footer-section">
          <h4>Quick Links</h4>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
        <div className="footer-section">
          <h4>Resources</h4>
          <Link to="/dashboard">Practice Interview</Link>
          <Link to="/profile">My Profile</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} InterviewPrep AI. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
