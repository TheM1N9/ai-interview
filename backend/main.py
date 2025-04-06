from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import google.generativeai as genai
import os
from typing import Dict, Optional, List
import tempfile
from pathlib import Path
from dotenv import load_dotenv
import re
import json
from pymongo import MongoClient
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from fastapi.responses import FileResponse
import time
import logging
import pandas as pd
import random
from csv import QUOTE_ALL

load_dotenv()

app = FastAPI()

# MongoDB setup
client = MongoClient("mongodb://localhost:27017/")
db = client["interview_prep"]
users_collection = db["users"]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# Models
class User(BaseModel):
    username: str
    email: str
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class ResumeInfo(BaseModel):
    filename: str
    upload_date: str
    file_path: str


class CompanyResponse(BaseModel):
    companies: List[str]


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini AI
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.0-flash")


# Auth functions
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401)
        user = users_collection.find_one({"username": username})
        if user:
            # Convert ObjectId to string and remove password
            user["_id"] = str(user["_id"])  # Convert ObjectId to string
            user.pop("password", None)  # Remove password from response
            return user
    except:
        raise HTTPException(status_code=401)


# Auth endpoints
@app.post("/register")
async def register(user: User):
    if users_collection.find_one({"username": user.username}):
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = pwd_context.hash(user.password)
    user_dict = user.dict()
    user_dict["password"] = hashed_password
    users_collection.insert_one(user_dict)
    return {"message": "User created successfully"}


@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_collection.find_one({"username": form_data.username})
    if not user or not pwd_context.verify(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return current_user


@app.put("/profile")
async def update_profile(
    user_update: UserUpdate, current_user: dict = Depends(get_current_user)
):
    updates = {}
    if user_update.email:
        updates["email"] = user_update.email

    if user_update.current_password and user_update.new_password:
        user = users_collection.find_one({"username": current_user["username"]})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not pwd_context.verify(user_update.current_password, user["password"]):
            raise HTTPException(status_code=400, detail="Incorrect current password")
        updates["password"] = pwd_context.hash(user_update.new_password)

    if updates:
        users_collection.update_one(
            {"username": current_user["username"]}, {"$set": updates}
        )

    return {"message": "Profile updated successfully"}


@app.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    company: str = Form(...),
    job_description: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    temp_file_path = None
    file_location = None
    try:
        # Create resumes directory if it doesn't exist
        os.makedirs("resumes", exist_ok=True)

        # Save the file with a unique name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{current_user['username']}_{timestamp}_{file.filename}"
        file_location = f"resumes/{filename}"

        # Save the file permanently
        with open(file_location, "wb+") as file_object:
            content = await file.read()
            file_object.write(content)
            file_object.flush()

        # Store resume information in the database
        resume_info = {
            "filename": file.filename,
            "upload_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "file_path": file_location,
        }

        # Update user's resumes in database
        users_collection.update_one(
            {"username": current_user["username"]}, {"$push": {"resumes": resume_info}}
        )

        # Upload file to Gemini for interview question generation
        resume_file = genai.upload_file(Path(file_location))

        # Generate prompt for single question
        prompt = f"""Based on this resume and the following job description:
        {job_description}
        
        Generate ONE technical interview question that might be asked at {company} for this specific role.
        The question should be challenging but appropriate for the candidate's experience level and relevant to the job requirements.
        Return ONLY the question as a string, no additional text or formatting."""

        # Generate response using Gemini
        result = model.generate_content([resume_file, "\n\n", prompt])

        return {"question": result.text.strip()}
    except Exception as e:
        # If there's an error, try to clean up the saved file
        if file_location and os.path.exists(file_location):
            try:
                os.remove(file_location)
            except:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/next-question")
async def get_next_question(
    video: UploadFile = File(...),
    previous_question: str = Form(...),
    company: str = Form(...),
    question_count: int = Form(...),
    interview_history: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    # Analyze the answer first
    video_analysis = await analyze_interview_video(
        video=video,
        question=previous_question,
        company=company,
        question_count=question_count,
    )

    # Add current Q&A to history
    current_qa = {
        "question": previous_question,
        "answer": video_analysis[2],  # The answer
        "feedback": video_analysis[1],  # The feedback
        "scores": video_analysis[0],  # The scores
    }

    # Parse existing history and append current Q&A
    history = json.loads(interview_history) if interview_history else []
    history.append(current_qa)

    # Calculate average score
    average_score = (
        video_analysis[0]["technical_accuracy"]
        + video_analysis[0]["communication_clarity"]
        + video_analysis[0]["body_language"]
        + video_analysis[0]["eye_contact"]
        + video_analysis[0]["speaking_pace"]
    ) / 5

    continue_interview = average_score >= 3

    if not continue_interview:
        # Create a comprehensive summary of the entire interview
        qa_summary = "\n".join(
            [
                f"""
            Question {i+1}: {qa['question']}
            Answer: {qa['answer']}
            Feedback: {qa['feedback']}
            Scores:
            - Technical Accuracy: {qa['scores']['technical_accuracy']}
            - Communication Clarity: {qa['scores']['communication_clarity']}
            - Body Language: {qa['scores']['body_language']}
            - Eye Contact: {qa['scores']['eye_contact']}
            - Speaking Pace: {qa['scores']['speaking_pace']}
            """
                for i, qa in enumerate(history)
            ]
        )

        # Calculate overall metrics
        overall_metrics = {
            "technical_accuracy": sum(
                qa["scores"]["technical_accuracy"] for qa in history
            )
            / len(history),
            "communication_clarity": sum(
                qa["scores"]["communication_clarity"] for qa in history
            )
            / len(history),
            "body_language": sum(qa["scores"]["body_language"] for qa in history)
            / len(history),
            "eye_contact": sum(qa["scores"]["eye_contact"] for qa in history)
            / len(history),
            "speaking_pace": sum(qa["scores"]["speaking_pace"] for qa in history)
            / len(history),
        }

        # Generate detailed analysis prompt
        analysis_prompt = f"""Based on the complete interview history:

        {qa_summary}

        For a role at {company}, provide a detailed analysis in the following JSON format:
        {{
            "overall_assessment": "Overall assessment of the candidate's performance",
            "strengths": ["List of key strengths demonstrated"],
            "weaknesses": ["List of areas needing improvement"],
            "technical_analysis": "Detailed analysis of technical knowledge and problem-solving",
            "communication_analysis": "Analysis of communication skills and clarity",
            "recommendations": ["Specific actionable recommendations for improvement"],
            "readiness_level": "Assessment of readiness for the role (e.g., 'Ready', 'Needs Improvement', 'Not Ready')",
            "interview_duration": "Estimated duration of the interview",
            "question_count": {len(history)}
        }}

        Make the analysis constructive and actionable. Return ONLY the JSON object, no additional text or formatting."""

        # Generate detailed analysis
        analysis_result = model.generate_content(analysis_prompt)
        try:
            # Try to find JSON in the response
            json_match = re.search(
                r"```json\n(.*?)\n```", analysis_result.text, re.DOTALL
            )
            if json_match:
                analysis_data = json.loads(json_match.group(1))
            else:
                # If no JSON block found, try to parse the entire response
                analysis_data = json.loads(analysis_result.text)
        except json.JSONDecodeError:
            print("Failed to parse analysis JSON, using default values")
            analysis_data = {
                "overall_assessment": "Unable to generate detailed analysis",
                "strengths": [],
                "weaknesses": [],
                "technical_analysis": "Analysis not available",
                "communication_analysis": "Analysis not available",
                "recommendations": [],
                "readiness_level": "Unknown",
                "interview_duration": "Unknown",
                "question_count": len(history),
            }

        # Generate final feedback
        final_prompt = f"""Based on the complete interview history:

        {qa_summary}

        For a role at {company}, provide a comprehensive feedback summary for the candidate.
        Include:
        1. Overall technical proficiency across all questions
        2. Key strengths demonstrated throughout the interview
        3. Areas for improvement based on consistent patterns
        4. Readiness for a role at {company}
        5. Specific recommendations for improvement

        Give Feedback in MarkDown format.
        
        Make it constructive and actionable."""

        final_feedback = model.generate_content(final_prompt)

        return {
            "done": True,
            "analysis": str(video_analysis),
            "final_feedback": final_feedback.text.strip(),
            "interview_history": history,
            "dashboard_data": {
                "overall_metrics": overall_metrics,
                "detailed_analysis": analysis_data,
                "interview_summary": {
                    "total_questions": len(history),
                    "average_scores": overall_metrics,
                    "company": company,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
            },
        }

    # Generate next question if continuing
    next_question_prompt = f"""Based on the previous question: '{previous_question}'
    
    The answer was rated as follows:
    {video_analysis}
    
    Generate a follow-up technical question that:
    1. Addresses any weaknesses shown in the previous answer
    2. Progressively increases in difficulty
    3. Stays relevant to the candidate's experience
    
    Return ONLY the question as a string."""

    result = model.generate_content(next_question_prompt)

    return {
        "done": False,
        "next_question": result.text.strip(),
        "analysis": video_analysis,
        "interview_history": history,
    }


@app.post("/upload-user-resume")
async def upload_user_resume(
    file: UploadFile = File(...), current_user: dict = Depends(get_current_user)
):
    try:
        os.makedirs("resumes", exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{current_user['username']}_{timestamp}_{file.filename}"
        file_location = f"resumes/{filename}"

        with open(file_location, "wb+") as file_object:
            file_object.write(await file.read())

        # Store resume information in the database
        resume_info = {
            "filename": file.filename,
            "upload_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "file_path": file_location,
        }

        # Update user's resumes in database (create array if it doesn't exist)
        users_collection.update_one(
            {"username": current_user["username"]}, {"$push": {"resumes": resume_info}}
        )

        return {"detail": "Resume uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user-resumes")
async def get_user_resumes(current_user: dict = Depends(get_current_user)):
    try:
        user = users_collection.find_one(
            {"username": current_user["username"]}, {"resumes": 1}
        )
        if user:
            return {"resumes": user.get("resumes", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/delete-resume/{filename}")
async def delete_resume(filename: str, current_user: dict = Depends(get_current_user)):
    try:
        # Find the resume in the user's resumes
        user = users_collection.find_one({"username": current_user["username"]})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        resumes = user.get("resumes", [])

        resume_to_delete = next((r for r in resumes if r["filename"] == filename), None)

        if not resume_to_delete:
            raise HTTPException(status_code=404, detail="Resume not found")

        # Delete file from filesystem
        if os.path.exists(resume_to_delete["file_path"]):
            os.remove(resume_to_delete["file_path"])

        # Remove resume from database
        users_collection.update_one(
            {"username": current_user["username"]},
            {"$pull": {"resumes": {"filename": filename}}},
        )

        return {"detail": "Resume deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/use-existing-resume")
async def use_existing_resume(
    request: dict, current_user: dict = Depends(get_current_user)
):
    try:
        # Find the resume in user's resumes
        user = users_collection.find_one({"username": current_user["username"]})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        resumes = user.get("resumes", [])
        resume_info = next(
            (r for r in resumes if r["filename"] == request["filename"]), None
        )

        if not resume_info:
            raise HTTPException(status_code=404, detail="Resume not found")

        # Upload file to Gemini
        resume_file = genai.upload_file(Path(resume_info["file_path"]))

        # Generate prompt for single question
        prompt = f"""Based on this resume and the following job description:
        {request["job_description"]}
        
        Generate ONE technical interview question that might be asked at {request["company"]} for this specific role.
        The question should be challenging but appropriate for the candidate's experience level and relevant to the job requirements.
        Ask the question based on the resume.
        Return ONLY the question as a string, no additional text or formatting."""

        # Generate response using Gemini
        result = model.generate_content([resume_file, "\n\n", prompt])

        return {"question": result.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/view-resume/{filename}")
async def view_resume(
    filename: str,
    token: str = Query(...),
):
    try:
        # Verify token and get user
        current_user = verify_token(token)
        if not current_user:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Find the resume in user's resumes
        user = users_collection.find_one({"username": current_user["username"]})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        resumes = user.get("resumes", [])
        resume_info = next((r for r in resumes if r["filename"] == filename), None)

        if not resume_info:
            raise HTTPException(status_code=404, detail="Resume not found")

        file_path = resume_info["file_path"]
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            file_path,
            media_type="application/pdf",
            filename=filename,
            # Add these headers to make the PDF open in the browser
            headers={
                "Content-Disposition": "inline; filename=" + filename,
                "Content-Type": "application/pdf",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            return None
        user = users_collection.find_one({"username": username})
        return user
    except Exception as e:
        print(e)
        return None


# Video analysis function
def upload_to_gemini(path, mime_type=None):
    """Uploads the given file to Gemini."""
    file = genai.upload_file(path, mime_type=mime_type)
    print(f"Uploaded file '{file.display_name}' as: {file.uri}")
    return file


def wait_for_files_active(files):
    """Waits for the given files to be active."""
    print("Waiting for file processing...")
    for name in (file.name for file in files):
        file = genai.get_file(name)
        while file.state.name == "PROCESSING":
            print(".", end="", flush=True)
            time.sleep(10)
            file = genai.get_file(name)
        if file.state.name != "ACTIVE":
            raise Exception(f"File {file.name} failed to process")
    print("...all files ready")
    print()


def analyze_video(video_path: str) -> tuple[dict, str, str]:
    scores = {
        "technical_accuracy": 0,
        "communication_clarity": 0,
        "body_language": 0,
        "eye_contact": 0,
        "speaking_pace": 0,
    }

    feedback = ""
    answer = ""

    # Upload video to Gemini
    video_file = upload_to_gemini(video_path, mime_type="video/mp4")

    # Wait for the video file to be processed
    wait_for_files_active([video_file])

    # Create the model for analysis
    generation_config = {
        "temperature": 1,
        "top_p": 0.95,
        "top_k": 64,
        "max_output_tokens": 8192,
        "response_mime_type": "text/plain",
    }

    model = genai.GenerativeModel(
        model_name="gemini-2.0-pro-exp-02-05",
        generation_config=generation_config,
    )

    prompt = """
                You are an interviewer. Analyze the video and provide feedback, and provide detailed analysis. 
                Answer is what is the candidate saying.
                The feedback should be in the following format:
                ```json
                {
                    "scores": {
                        "technical_accuracy": 0,
                        "communication_clarity": 0,
                        "body_language": 0,
                        "eye_contact": 0,
                        "speaking_pace": 0
                    },
                    "feedback": "",
                    "answer": ""
                }
                ```
                if some of the scores are not applicable, set them to 0.
                """

    chat_session = model.start_chat(history=[])

    json_response = chat_session.send_message([prompt, video_file]).text

    response = re.search(r"```json\n(.*?)\n```", json_response, re.DOTALL)
    if response:
        try:
            response_dict = json.loads(response.group(1))
            scores = response_dict.get("scores", scores)
            feedback = response_dict.get("feedback", "")
            answer = response_dict.get("answer", "")
        except json.JSONDecodeError:
            print("Failed to parse JSON response")
    else:
        print("No JSON response found")

    return scores, feedback, answer


@app.post("/analyze-video")
async def analyze_interview_video(
    video: UploadFile = File(...),
    question: str = Form(...),
    company: str = Form(...),
    question_count: int = Form(...),
) -> tuple[Dict[str, int], str, str]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        content = await video.read()
        temp_video.write(content)
        temp_video.flush()

        scores, feedback, answer = analyze_video(temp_video.name)
        # Remove the temporary file
        # os.unlink(temp_video.name)

    return scores, feedback, answer


@app.get("/companies")
async def get_companies():
    try:
        # Read the CSV file with proper quoting
        df = pd.read_excel("data.xlsx")
        # Get unique companies and sort them
        companies = sorted(df["company"].unique().tolist())
        return {"companies": companies}
    except Exception as e:
        print(f"Error reading CSV: {str(e)}")  # Add logging for debugging
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-questions-from-data")
async def generate_questions_from_data(
    request,
):  # -> dict[str, Any | list[str] | list[Any]]:# -> dict[str, Any | list[str] | list[Any]]:# -> dict[str, Any | list[str] | list[Any]]:
    try:
        # Read the CSV file
        df = pd.read_csv("data.csv")

        # Filter questions for the specific company
        company_data = df[df["company"].str.lower() == request.company.lower()]

        if company_data.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No questions found for company: {request.company}",
            )

        # Get all questions for the company
        questions = company_data["questions"].tolist()

        # If we have more questions than requested, randomly sample
        if len(questions) > request.num_questions:
            questions = random.sample(questions, request.num_questions)

        # Generate prompt for Gemini to analyze and enhance the questions
        prompt = f"""Based on these existing questions for {request.company}:
        {json.dumps(questions)}
        
        Please analyze and enhance these questions to make them more relevant and challenging.
        Return the enhanced questions as a JSON array of strings.
        Keep the same number of questions as provided."""

        result = model.generate_content(prompt)

        try:
            # Try to find JSON in the response
            json_match = re.search(r"\[.*\]", result.text, re.DOTALL)
            if json_match:
                enhanced_questions = json.loads(json_match.group())
            else:
                # If no JSON array found, split by newlines and clean up
                enhanced_questions = [
                    q.strip() for q in result.text.split("\n") if q.strip()
                ]
                enhanced_questions = enhanced_questions[
                    : len(questions)
                ]  # Keep same number of questions
        except json.JSONDecodeError:
            enhanced_questions = (
                questions  # Fall back to original questions if parsing fails
            )

        return {"questions": enhanced_questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
