import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Notification from "./Notification";
import "../styles/Profile.css"; // Import new styles

function Profile() {
  const { user, logout } = useAuth();
  const [resume, setResume] = useState(null);
  const [userResumes, setUserResumes] = useState([]);
  const [notification, setNotification] = useState({
    message: "",
    type: "success",
  });

  useEffect(() => {
    fetchUserResumes();
  }, []);

  const fetchUserResumes = async () => {
    try {
      const response = await fetch("http://localhost:8000/user-resumes", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUserResumes(data.resumes || []);
      } else {
        setNotification({
          message: "Failed to fetch resumes",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "Failed to fetch resumes",
        type: "error",
      });
    }
  };

  const handleResumeUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("file", resume);

    try {
      const response = await fetch("http://localhost:8000/upload-user-resume", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setNotification({
          message: "Resume uploaded successfully 📄",
          type: "success",
        });
        setResume(null);
        // Reset the file input
        e.target.reset();
        // Refresh the resumes list
        fetchUserResumes();
      } else {
        setNotification({
          message:
            typeof data.detail === "object"
              ? data.detail.msg
              : data.detail || "Resume upload failed",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "Failed to upload resume. Please try again.",
        type: "error",
      });
    }
  };

  const handleDeleteResume = async (filename) => {
    try {
      const response = await fetch(
        `http://localhost:8000/delete-resume/${filename}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.ok) {
        setNotification({
          message: "Resume deleted successfully",
          type: "success",
        });
        fetchUserResumes();
      } else {
        setNotification({
          message: "Failed to delete resume",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "Failed to delete resume",
        type: "error",
      });
    }
  };

  const handleResumeClick = (filename) => {
    const token = localStorage.getItem("token");
    // Encode the token to handle special characters
    const encodedToken = encodeURIComponent(token);
    // Include encoded token as a query parameter
    window.open(
      `http://localhost:8000/view-resume/${encodeURIComponent(
        filename
      )}?token=${encodedToken}`,
      "_blank"
    );
  };

  return (
    <div className="profile-container">
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "success" })}
      />

      <h2>Profile Information</h2>

      <div className="user-info">
        <div className="info-section">
          <h3>Personal Details</h3>
          <div className="info-grid">
            <div className="info-group">
              <label>Full Name</label>
              <p>{`${user?.firstName || ""} ${user?.lastName || ""}`}</p>
            </div>
            <div className="info-group">
              <label>Username</label>
              <p>{user?.username}</p>
            </div>
            <div className="info-group">
              <label>Email</label>
              <p>{user?.email}</p>
            </div>
            <div className="info-group">
              <label>Mobile</label>
              <p>{user?.mobile || "Not provided"}</p>
            </div>
          </div>
        </div>

        <div className="info-section">
          <h3>Academic & Professional</h3>
          <div className="info-grid">
            <div className="info-group">
              <label>College/University</label>
              <p>{user?.college || "Not provided"}</p>
            </div>
            <div className="info-group">
              <label>Graduation Year</label>
              <p>{user?.graduationYear || "Not provided"}</p>
            </div>
            <div className="info-group">
              <label>Current Role</label>
              <p>{user?.currentRole || "Not provided"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <h3>Your Resumes</h3>
        <div className="resumes-list">
          {userResumes.length === 0 ? (
            <p className="no-resumes">No resumes uploaded yet</p>
          ) : (
            userResumes.map((resume, index) => (
              <div key={index} className="resume-item">
                <div
                  className="resume-info"
                  onClick={() => handleResumeClick(resume.filename)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="resume-icon">📄</span>
                  <div className="resume-details">
                    <p className="resume-name">{resume.filename}</p>
                    <p className="resume-date">{resume.upload_date}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteResume(resume.filename)}
                  className="delete-resume-button"
                  title="Delete resume"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="profile-section">
        <h3>Upload Resume</h3>
        <form onSubmit={handleResumeUpload} className="resume-form">
          <div className="file-upload-container">
            <input
              type="file"
              id="resume-upload"
              className="file-upload-input"
              accept=".pdf"
              onChange={(e) => setResume(e.target.files[0])}
              required
            />
            <label htmlFor="resume-upload" className="file-upload-label">
              <span className="file-upload-icon">📄</span>
              <span className="file-upload-text">
                {resume ? resume.name : "Choose PDF file"}
              </span>
            </label>
          </div>
          <button type="submit" className="upload-button">
            Upload Resume
          </button>
        </form>
      </div>

      <button onClick={logout} className="logout-button">
        Logout
      </button>
    </div>
  );
}

export default Profile;
