import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import VideoRecorder from "./VideoRecorder";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { VolumeX, RotateCcw, Loader2 } from "lucide-react";
import FeedbackDashboard from "./FeedbackDashboard";
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
  const [isMuted, setIsMuted] = useState(false);
  const [interviewHistory, setInterviewHistory] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleStartRecording = () => setIsRecording(true);
  const handleStopRecording = () => setIsRecording(false);

  const handleRecordingStart = () => {
    // Stop any ongoing speech when recording starts
    window.speechSynthesis.cancel();
  };

  const handleRecordingComplete = async (blob) => {
    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("video", blob, "recording.webm");
      formData.append("previous_question", currentQuestion);
      formData.append("company", location.state?.company);
      formData.append("question_count", questionCount);
      formData.append("interview_history", JSON.stringify(interviewHistory));

      const token = localStorage.getItem("token");
      console.log("Sending request to backend...");
      const response = await fetch("http://localhost:8000/next-question", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${
            errorData.detail || "Unknown error"
          }`
        );
      }

      const data = await response.json();
      console.log("Received response from backend:", data);

      if (!data.done) {
        setCurrentQuestion(data.next_question);
        setQuestionCount((prev) => prev + 1);
        setInterviewHistory(data.interview_history);
      } else {
        setShowFeedback(true);
        setDashboardData(data.dashboard_data);
        setInterviewHistory(data.interview_history);
        setFeedback(data.final_feedback);

        // Ensure final feedback is added to the dashboardData
        if (data.dashboard_data && data.final_feedback) {
          setDashboardData({
            ...data.dashboard_data,
            detailed_analysis: {
              ...data.dashboard_data.detailed_analysis,
              final_feedback: data.final_feedback,
            },
          });
        }
      }
    } catch (error) {
      console.error("Error in handleRecordingComplete:", error);
      setFeedback(`Failed to process recording: ${error.message}`);
      setShowFeedback(true);
    } finally {
      setIsLoading(false);
      setIsRecording(false);
    }
  };

  const readQuestionAloud = (question) => {
    if (isMuted) return; // Don't read if muted

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

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

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      window.speechSynthesis.cancel();
    } else if (currentQuestion) {
      readQuestionAloud(currentQuestion);
    }
  };

  useEffect(() => {
    if (currentQuestion && !isMuted) {
      const timer = setTimeout(() => readQuestionAloud(currentQuestion), 500);
      return () => clearTimeout(timer);
    }
  }, [currentQuestion, isMuted]);

  if (showFeedback) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="w-full">
          <CardHeader>
            <h2 className="text-2xl font-bold text-center">
              Interview Complete
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <FeedbackDashboard
              interviewHistory={interviewHistory}
              dashboardData={dashboardData}
            />
            <Button className="w-full mt-4" onClick={() => navigate("/")}>
              Start New Interview
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              Technical Interview{" "}
              {questionCount > 0 && `- Question ${questionCount}`}
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMute}
                className={`h-8 w-8 ${isMuted ? "text-red-500" : ""}`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <VolumeX className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => readQuestionAloud(currentQuestion)}
                className="h-8 w-8"
                disabled={isMuted}
                title="Replay question"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-lg">{currentQuestion}</p>
          </div>

          <div className="space-y-4">
            <VideoRecorder
              onRecordingComplete={handleRecordingComplete}
              isRecording={isRecording}
              onStopRecording={handleStopRecording}
              onRecordingStart={handleRecordingStart}
            />

            <div className="flex justify-center">
              {!isRecording ? (
                <Button
                  onClick={handleStartRecording}
                  disabled={isLoading}
                  className="w-full max-w-sm"
                >
                  Start Recording
                </Button>
              ) : (
                <Button
                  onClick={handleStopRecording}
                  disabled={isLoading}
                  variant="destructive"
                  className="w-full max-w-sm"
                >
                  Stop Recording
                </Button>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p>Analyzing your answer...</p>
            </div>
          )}

          {/* {answerAnalysis && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">
                  Previous Answer Analysis
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Technical Accuracy</span>
                      <span className="font-semibold">
                        {answerAnalysis.technical_accuracy}/10
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Communication Clarity</span>
                      <span className="font-semibold">
                        {answerAnalysis.communication_clarity}/10
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Body Language</span>
                      <span className="font-semibold">
                        {answerAnalysis.body_language}/10
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Eye Contact</span>
                      <span className="font-semibold">
                        {answerAnalysis.eye_contact}/10
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speaking Pace</span>
                      <span className="font-semibold">
                        {answerAnalysis.speaking_pace}/10
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="font-semibold">Feedback:</p>
                  <p className="mt-2">{answerAnalysis.feedback}</p>
                </div>
              </CardContent>
            </Card>
          )} */}
        </CardContent>
      </Card>
    </div>
  );
}

export default Interview;
