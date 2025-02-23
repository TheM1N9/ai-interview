from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import google.generativeai as genai
import os
from typing import Dict, Optional
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
model = genai.GenerativeModel("gemini-1.5-pro")


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
        prompt = f"""Based on this resume, generate ONE technical interview question that might be asked at {company}.
        The question should be challenging but appropriate for the candidate's experience level.
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
    current_user: dict = Depends(get_current_user),
):
    # Analyze the answer first
    video_analysis = await analyze_interview_video(
        video=video,
        question=previous_question,
        company=company,
        question_count=question_count,
    )

    print(f"video_analysis: {video_analysis}")

    # Determine if we should continue the interview
    average_score = (
        video_analysis[0]["technical_accuracy"]
        + video_analysis[0]["communication_clarity"]
        + video_analysis[0]["body_language"]
        + video_analysis[0]["eye_contact"]
        + video_analysis[0]["speaking_pace"]
    ) / 5

    logging.debug(f"average_score: {average_score}")

    continue_interview = True
    if average_score < 3:
        continue_interview = False

    if not continue_interview:
        final_prompt = f"""Based on all the previous interactions, provide a comprehensive feedback summary for the candidate.
        Include:
        1. Overall technical proficiency
        2. Key strengths demonstrated
        3. Areas for improvement
        4. Readiness for a role at {company}
        
        Make it constructive and actionable."""

        final_feedback = model.generate_content(final_prompt)
        return {
            "done": True,
            "analysis": str(video_analysis),
            "final_feedback": final_feedback.text.strip(),
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

    # Use the model to generate the next question
    result = model.generate_content(next_question_prompt)

    print(f"next question:{result.text.strip()}")

    return {
        "done": False,
        "next_question": result.text.strip(),
        "analysis": video_analysis,
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
        prompt = f"""Based on this resume, generate ONE technical interview question that might be asked at {request["company"]}.
        The question should be challenging but appropriate for the candidate's experience level.
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


def analyze_video(video_path: str) -> tuple[dict, str]:
    scores = {
        "technical_accuracy": 0,
        "communication_clarity": 0,
        "body_language": 0,
        "eye_contact": 0,
        "speaking_pace": 0,
    }

    feedback = ""

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
                Analyze the video and provide feedback, and provide detailed analysis. 
                The feedback should be in the following format:
                ```json
                {
                    scores = {
                    "technical_accuracy": 0,
                    "communication_clarity": 0,
                    "body_language": 0,
                    "eye_contact": 0,
                    "speaking_pace": 0,
                   },
                feedback = ""
                }
                ```
                if some of the scores are not applicable, set them to 0.
                """

    chat_session = model.start_chat(history=[])

    json_response = chat_session.send_message([prompt, video_file]).text
    # print(json_response)

    response = re.search(r"```json\n(.*?)\n```", json_response, re.DOTALL)
    if response:
        feedback = json.loads(response.group(1))
        scores = feedback.get("scores", {})
        feedback = feedback.get("feedback", "")

    return scores, feedback


@app.post("/analyze-video")
async def analyze_interview_video(
    video: UploadFile = File(...),
    question: str = Form(...),
    company: str = Form(...),
    question_count: int = Form(...),
) -> tuple[Dict[str, int], str]:
    scores: Dict[str, int] = {}
    feedback: str = ""

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        content = await video.read()
        temp_video.write(content)
        temp_video.flush()

        scores, feedback = analyze_video(temp_video.name)
        # scores = json.loads(scores)
        # os.unlink(temp_video.name)

    return scores, feedback
