import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import "../styles/Landing.css";
import "../styles/Interview.css";
import "../styles/Dashboard.css";

function Interview() {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState(
    location.state?.firstQuestion || ""
  );
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [questionCount, setQuestionCount] = useState(1);
  const [answerAnalysis, setAnswerAnalysis] = useState(null);

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/next-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          previous_question: currentQuestion,
          answer: answer,
          company: location.state?.company,
          question_count: questionCount,
        }),
      });

      const data = await response.json();

      // Update answer analysis
      setAnswerAnalysis(data.analysis);

      if (data.done) {
        // Interview is complete
        setFeedback(data.final_feedback);
      } else {
        // Continue with next question
        setCurrentQuestion(data.next_question);
        setAnswer("");
        setQuestionCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

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
        Technical Interview - Question {questionCount}
      </h2>
      <div className="question-card">
        <h3>Question:</h3>
        <p>{currentQuestion}</p>

        <form onSubmit={handleSubmitAnswer}>
          <div className="form-group">
            <label>Your Answer:</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows="4"
              required
              className="answer-textarea"
            />
          </div>
          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? "Processing..." : "Submit Answer"}
          </button>
        </form>

        {answerAnalysis && (
          <div className="answer-analysis">
            <h4>Previous Answer Analysis:</h4>
            <ul>
              <li>
                Technical Accuracy: {answerAnalysis.technical_accuracy}/10
              </li>
              <li>Completeness: {answerAnalysis.completeness}/10</li>
              <li>
                Communication Clarity: {answerAnalysis.communication_clarity}/10
              </li>
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
