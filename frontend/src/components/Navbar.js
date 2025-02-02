import React from "react";
import { NavLink } from "react-router-dom";
import "../styles/Navbar.css"; // Import the new styles

const Navbar = () => {
  return (
    <nav className="navbar">
      <NavLink to="/" className="logo">
        InterviewPrep AI
      </NavLink>
      <div className="nav-links">
        <NavLink
          to="/"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
          end
        >
          Home
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Interview
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Profile
        </NavLink>
      </div>
    </nav>
  );
};

export default Navbar;
