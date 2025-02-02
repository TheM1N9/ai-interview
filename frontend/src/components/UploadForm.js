import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Notification from "./Notification";
import "../styles/Dashboard.css";

function UploadForm() {
  const [file, setFile] = useState(null);
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [userResumes, setUserResumes] = useState([]);
  const [selectedResume, setSelectedResume] = useState("");
  const [uploadMode, setUploadMode] = useState(false);
  const [notification, setNotification] = useState({
    message: "",
    type: "success",
  });
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    fetchUserResumes();
  }, []);

  const fetchUserResumes = async () => {
    try {
      const response = await fetch("http://localhost:8000/user-resumes", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUserResumes(data.resumes || []);
      }
    } catch (error) {
      console.error("Failed to fetch resumes");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      setFile(droppedFile);
    } else {
      alert("Please upload a valid PDF file.");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      if (uploadMode) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("company", company);

        response = await fetch("http://localhost:8000/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      } else {
        response = await fetch("http://localhost:8000/use-existing-resume", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: selectedResume,
            company: company,
          }),
        });
      }

      const data = await response.json();

      if (response.ok) {
        if (uploadMode) {
          setNotification({
            message: "Resume uploaded successfully!",
            type: "success",
          });
        }

        // Wait a brief moment to show the success notification
        setTimeout(() => {
          navigate("/interview", {
            state: {
              firstQuestion: data.question,
              company: company,
            },
          });
        }, 1000);
      } else {
        setNotification({
          message: data.detail || "An error occurred",
          type: "error",
        });
      }
    } catch (error) {
      setNotification({
        message: "Failed to process request",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <Notification
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ message: "", type: "success" })}
      />
      <h2>Enter Details</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          {/* <label>Company Name</label> */}

          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            placeholder="Enter company name"
          />
        </div>

        <div className="resume-selection-container">
          <div className="resume-toggle">
            <button
              type="button"
              className={`toggle-button ${!uploadMode ? "active" : ""}`}
              onClick={() => setUploadMode(false)}
            >
              Select Existing Resume
            </button>
            <button
              type="button"
              className={`toggle-button ${uploadMode ? "active" : ""}`}
              onClick={() => setUploadMode(true)}
            >
              Upload New Resume
            </button>
          </div>

          {uploadMode ? (
            <div className="form-group">
              <div
                className="upload-area"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {file ? (
                  <p>{file.name}</p>
                ) : (
                  <p>Choose a file or drag it here.</p>
                )}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files[0])}
                  style={{ display: "none" }}
                  id="file-input"
                />
                <label htmlFor="file-input" className="upload-button">
                  Choose File
                </label>
              </div>
            </div>
          ) : (
            <div className="form-group">
              {/* <label>Select Resume</label> */}
              <select
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                required={!uploadMode}
              >
                <option value="">Select a resume</option>
                {userResumes.map((resume, index) => (
                  <option key={index} value={resume.filename}>
                    {resume.filename} ({resume.upload_date})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="start-interview-button"
          disabled={
            loading || (!uploadMode && !selectedResume) || (uploadMode && !file)
          }
        >
          {loading ? "Processing..." : "Start Interview"}
        </button>
      </form>
    </div>
  );
}

export default UploadForm;
