import React, { useState, useRef, useEffect } from "react";
import "../styles/VideoRecorder.css";

const VideoRecorder = ({
  onRecordingComplete,
  isRecording,
  onStopRecording,
}) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Failed to access camera and microphone");
      console.error("Error accessing media devices:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  useEffect(() => {
    if (isRecording && stream) {
      startRecording();
    } else if (!isRecording && mediaRecorderRef.current) {
      stopRecording();
    }
  }, [isRecording, stream]);

  const startRecording = () => {
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onRecordingComplete(blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      onStopRecording();
    }
  };

  return (
    <div className="video-recorder">
      {error && <div className="error-message">{error}</div>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="video-preview"
      />
      <div className="recording-indicator">
        {isRecording && <div className="recording-dot">Recording</div>}
      </div>
    </div>
  );
};

export default VideoRecorder;
