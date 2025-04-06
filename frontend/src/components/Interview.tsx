import React, { useState } from "react";
import { Box, Button, Typography, Paper } from "@mui/material";
import CompanySelector from "./CompanySelector";

const Interview: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompanySelect = (company: string) => {
    setSelectedCompany(company);
  };

  const generateQuestions = async () => {
    if (!selectedCompany) {
      setError("Please select a company first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "http://localhost:8000/generate-questions-from-data",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company: selectedCompany,
            num_questions: 5, // You can adjust this number
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate questions");
      }

      const data = await response.json();
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Interview Preparation
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <CompanySelector
          selectedCompany={selectedCompany}
          onCompanySelect={handleCompanySelect}
        />

        <Button
          variant="contained"
          onClick={generateQuestions}
          disabled={loading || !selectedCompany}
          sx={{ mt: 2 }}
        >
          {loading ? "Generating Questions..." : "Generate Questions"}
        </Button>

        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </Paper>

      {questions.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Generated Questions for {selectedCompany}:
          </Typography>
          <ol>
            {questions.map((question, index) => (
              <li key={index}>
                <Typography>{question}</Typography>
              </li>
            ))}
          </ol>
        </Paper>
      )}
    </Box>
  );
};

export default Interview;
