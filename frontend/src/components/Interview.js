import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import VideoRecorder from "./VideoRecorder";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Volume2, Loader2 } from "lucide-react";
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

  const handleStartRecording = () => setIsRecording(true);
  const handleStopRecording = () => setIsRecording(false);

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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
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

  useEffect(() => {
    if (currentQuestion) {
      const timer = setTimeout(() => readQuestionAloud(currentQuestion), 500);
      return () => clearTimeout(timer);
    }
  }, [currentQuestion]);

  if (feedback) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="w-full">
          <CardHeader>
            <h2 className="text-2xl font-bold text-center">
              Interview Complete
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown>{feedback}</ReactMarkdown>
            </div>
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
            <Button
              variant="outline"
              size="icon"
              onClick={() => readQuestionAloud(currentQuestion)}
              className="h-8 w-8"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
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
            />

            <div className="flex justify-center">
              {!isRecording ? (
                <Button
                  onClick={handleStartRecording}
                  disabled={loading}
                  className="w-full max-w-sm"
                >
                  Start Recording
                </Button>
              ) : (
                <Button
                  onClick={handleStopRecording}
                  disabled={loading}
                  variant="destructive"
                  className="w-full max-w-sm"
                >
                  Stop Recording
                </Button>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p>Analyzing your answer...</p>
            </div>
          )}

          {answerAnalysis && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Interview;
