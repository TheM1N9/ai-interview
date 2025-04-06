import React, { useState, useEffect } from "react";
import { Select, FormControl, InputLabel, MenuItem, Box } from "@mui/material";

interface CompanySelectorProps {
  onCompanySelect: (company: string) => void;
  selectedCompany: string;
}

const CompanySelector: React.FC<CompanySelectorProps> = ({
  onCompanySelect,
  selectedCompany,
}) => {
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch("http://localhost:8000/companies");
        if (!response.ok) {
          throw new Error("Failed to fetch companies");
        }
        const data = await response.json();
        setCompanies(data.companies);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  if (loading) {
    return <Box>Loading companies...</Box>;
  }

  if (error) {
    return <Box color="error.main">{error}</Box>;
  }

  return (
    <FormControl fullWidth>
      <InputLabel id="company-select-label">Select Company</InputLabel>
      <Select
        labelId="company-select-label"
        value={selectedCompany}
        label="Select Company"
        onChange={(e) => onCompanySelect(e.target.value)}
      >
        {companies.map((company) => (
          <MenuItem key={company} value={company}>
            {company}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default CompanySelector;
