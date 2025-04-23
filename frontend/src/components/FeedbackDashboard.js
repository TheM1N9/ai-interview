import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import ReactMarkdown from "react-markdown";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function FeedbackDashboard({ interviewHistory, dashboardData }) {
  if (!dashboardData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              Loading feedback data...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overall_metrics, detailed_analysis, interview_summary } =
    dashboardData;

  // Prepare data for bar chart
  const barChartData = {
    labels: [
      "Technical Accuracy",
      "Communication Clarity",
      "Body Language",
      "Eye Contact",
      "Speaking Pace",
    ],
    datasets: [
      {
        label: "Average Scores",
        data: [
          overall_metrics.technical_accuracy,
          overall_metrics.communication_clarity,
          overall_metrics.body_language,
          overall_metrics.eye_contact,
          overall_metrics.speaking_pace,
        ],
        backgroundColor: [
          "rgba(255, 99, 132, 0.6)",
          "rgba(54, 162, 235, 0.6)",
          "rgba(255, 206, 86, 0.6)",
          "rgba(75, 192, 192, 0.6)",
          "rgba(153, 102, 255, 0.6)",
        ],
        borderColor: [
          "rgba(255, 99, 132, 1)",
          "rgba(54, 162, 235, 1)",
          "rgba(255, 206, 86, 1)",
          "rgba(75, 192, 192, 1)",
          "rgba(153, 102, 255, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };

  // Calculate overall performance percentage
  const overallScore = (
    Object.values(overall_metrics).reduce((acc, val) => acc + val, 0) / 5
  ).toFixed(1);

  // Prepare data for doughnut chart
  const doughnutChartData = {
    labels: ["Overall Score", "Remaining"],
    datasets: [
      {
        data: [overallScore, 5 - overallScore],
        backgroundColor: [
          "rgba(75, 192, 192, 0.6)",
          "rgba(211, 211, 211, 0.3)",
        ],
        borderColor: ["rgba(75, 192, 192, 1)", "rgba(211, 211, 211, 0.5)"],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Interview Performance Analysis",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 5,
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Overall Performance",
      },
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Performance Metrics</h3>
          </CardHeader>
          <CardContent>
            <Bar data={barChartData} options={chartOptions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Overall Score</h3>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <div className="w-64 h-64">
                <Doughnut data={doughnutChartData} options={doughnutOptions} />
              </div>
            </div>
            <div className="text-center mt-4">
              <p className="text-2xl font-bold">{overallScore}/5</p>
              <p className="text-muted-foreground">Overall Performance</p>
              <Badge
                className="mt-2"
                variant={
                  detailed_analysis.readiness_level === "Ready"
                    ? "default"
                    : "destructive"
                }
              >
                {detailed_analysis.readiness_level}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <h3 className="text-lg font-semibold">Detailed Analysis</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">Overall Assessment</h4>
                <div className="prose prose-invert max-w-none markdown-feedback dark:prose-invert">
                  <ReactMarkdown className="markdown-content">
                    {detailed_analysis.overall_assessment}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Strengths</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {detailed_analysis.strengths.map((strength, index) => (
                      <li key={index}>{strength}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Areas for Improvement</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {detailed_analysis.weaknesses.map((weakness, index) => (
                      <li key={index}>{weakness}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Technical Analysis</h4>
                  <div className="prose prose-invert max-w-none markdown-feedback dark:prose-invert">
                    <ReactMarkdown className="markdown-content">
                      {detailed_analysis.technical_analysis}
                    </ReactMarkdown>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Communication Analysis</h4>
                  <div className="prose prose-invert max-w-none markdown-feedback dark:prose-invert">
                    <ReactMarkdown className="markdown-content">
                      {detailed_analysis.communication_analysis}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Recommendations</h4>
                <ul className="list-disc list-inside space-y-1">
                  {detailed_analysis.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <h3 className="text-lg font-semibold">Interview Summary</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {interview_summary.total_questions}
                </p>
                <p className="text-muted-foreground">Questions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {interview_summary.interview_duration}
                </p>
                <p className="text-muted-foreground">Duration</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {interview_summary.company}
                </p>
                <p className="text-muted-foreground">Company</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {interview_summary.timestamp}
                </p>
                <p className="text-muted-foreground">Date</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Final Feedback Text with Markdown */}
        {detailed_analysis.final_feedback && (
          <Card className="md:col-span-2">
            <CardHeader>
              <h3 className="text-lg font-semibold">Final Feedback</h3>
            </CardHeader>
            <CardContent>
              <div className="prose prose-invert max-w-none markdown-feedback dark:prose-invert">
                <ReactMarkdown className="markdown-content">
                  {detailed_analysis.final_feedback}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default FeedbackDashboard;
