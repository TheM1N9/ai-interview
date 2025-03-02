import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import VideoRecorder from "./VideoRecorder";
import "../styles/Landing.css";
import "../styles/Interview.css";
import "../styles/Dashboard.css";
import "../styles/VideoRecorder.css";

function Interview() {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState(
    location.state?.firstQuestion || ""
  );
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [questionCount, setQuestionCount] = useState(1);
  const [answerAnalysis, setAnswerAnalysis] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const handleStartRecording = () => {
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
  };

  const handleRecordingComplete = async (videoBlob) => {
    setLoading(true);
    const formData = new FormData();
    formData.append("video", videoBlob, "interview_video.webm");
    formData.append("previous_question", currentQuestion);
    formData.append("company", location.state?.company);
    formData.append("question_count", questionCount);

    try {
      const token = localStorage.getItem("token");

      const response = await fetch("http://localhost:8000/next-question", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setAnswerAnalysis(data.analysis);

      if (data.done) {
        setFeedback(data.final_feedback);
      } else {
        setCurrentQuestion(data.next_question);
        setQuestionCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const readQuestionAloud = (question) => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(question);

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const englishVoice = voices.find(
        (voice) => voice.lang.includes("en") && voice.name.includes("Female")
      );

      utterance.voice = englishVoice || voices[0];
    }

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (currentQuestion) {
      const timer = setTimeout(() => {
        readQuestionAloud(currentQuestion);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentQuestion]);

  if (feedback) {
    return (
      <div className="interview-container">
        <h2 className="interview-complete-title">Interview Complete</h2>
        <div className="feedback-card">
          <h3>Final Feedback</h3>
          <div className="feedback-content">
            <ReactMarkdown>{feedback}</ReactMarkdown>
          </div>
          <button className="feedback-button" onClick={() => navigate("/")}>
            Start New Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-container">
      <h2 className="dashboard-title">
        Technical Interview{" "}
        {questionCount > 0 ? `- Question ${questionCount}` : ""}
      </h2>
      <div className="question-card">
        {/* <h3>Question:</h3> */}
        <div className="question-container">
          <h3>{currentQuestion}</h3>
          <button
            className="read-aloud-button"
            onClick={() => readQuestionAloud(currentQuestion)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
            Read Aloud
          </button>
        </div>

        <div className="video-section">
          <VideoRecorder
            onRecordingComplete={handleRecordingComplete}
            isRecording={isRecording}
            onStopRecording={handleStopRecording}
          />
          <div className="recording-controls">
            {!isRecording ? (
              <button
                className="record-button"
                onClick={handleStartRecording}
                disabled={loading}
              >
                Start Recording
              </button>
            ) : (
              <button
                className="stop-button"
                onClick={handleStopRecording}
                disabled={loading}
              >
                Stop Recording
              </button>
            )}
          </div>
        </div>

        {loading && <p className="loading-message">Analyzing your answer...</p>}

        {answerAnalysis && (
          <div className="answer-analysis">
            <h4>Previous Answer Analysis:</h4>
            <ul>
              <li>
                Technical Accuracy: {answerAnalysis.technical_accuracy}/10
              </li>
              <li>
                Communication Clarity: {answerAnalysis.communication_clarity}/10
              </li>
              <li>Body Language: {answerAnalysis.body_language}/10</li>
              <li>Eye Contact: {answerAnalysis.eye_contact}/10</li>
              <li>Speaking Pace: {answerAnalysis.speaking_pace}/10</li>
            </ul>
            <p>
              <strong>Feedback:</strong> {answerAnalysis.feedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Interview;
