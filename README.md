# InterviewPrep AI

InterviewPrep AI is a web application that helps users prepare for technical interviews through AI-powered video analysis and adaptive questioning. The application also analyzes and reviews interview responses and provide personalized feedback.

## Features

- 🎥 Real-time video interview practice
- 🤖 AI-powered response analysis
- 📊 Comprehensive feedback on:
  - Technical accuracy
  - Communication clarity
  - Body language
  - Eye contact
  - Speaking pace
- 📝 Resume-based question generation
- 🔄 Adaptive follow-up questions
- 👤 User profile management
- 📄 Multiple resume support

## Tech Stack

### Backend
- FastAPI (Python)
- MongoDB
- Google Gemini AI
- JWT Authentication

### Frontend
- React.js
- Tailwind CSS
- React Router
- Context API for state management

## Installation

### Prerequisites
- Python 3.8+
- Node.js 14+
- MongoDB
- Google AI API key (for Gemini AI)

### Backend Setup

1. Clone the repository
```bash
git clone https://github.com/TheM1N9/interview.git
cd interview
```

2. Create and activate a virtual environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install Python dependencies
```bash
cd backend
pip install -r requirements.txt
```

4. Create a .env file in the backend directory
```env
GEMINI_API_KEY=your_gemini_api_key
SECRET_KEY=your_jwt_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

5. Start the backend server
```bash
uvicorn main:app --reload
```

### Frontend Setup

1. Install dependencies
```bash
cd frontend
npm install
```

2. Start the development server
```bash
npm start
```

## Usage

1. **Register/Login**: Create an account or login to access the interview platform

2. **Upload Resume**: 
   - Navigate to Profile section
   - Upload your resume in PDF format
   - You can manage multiple resumes

3. **Start Interview**:
   - Choose a company
   - Select or upload a resume
   - The AI will generate relevant technical questions based on your resume and the company

4. **During Interview**:
   - Answer questions through video recording
   - Receive real-time feedback on your performance
   - Get follow-up questions based on your responses

5. **Review Feedback**:
   - Get detailed analysis of your responses
   - Review technical accuracy
   - Receive communication and presentation feedback

## AI Capabilities

The application uses Google's Gemini AI for:
- Analyzing video responses for technical accuracy
- Evaluating communication skills and body language
- Generating relevant technical questions based on resume content
- Creating adaptive follow-up questions based on previous responses
- Providing comprehensive feedback and improvement suggestions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

