from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import google.generativeai as genai
import os
from typing import Optional
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
async def get_next_question(request: dict):
    # Analyze the answer first
    analysis_prompt = f"""Analyze this answer to the technical question: 
    Question: '{request['previous_question']}'
    Answer: '{request['answer']}'
    
    Rate the answer on:
    1. Technical accuracy (1-10)
    2. Completeness (1-10)
    3. Communication clarity (1-10)
    
    Return the analysis as a JSON object with these fields and a 'continue_interview' boolean 
    indicating if we should continue with more questions. Set it to false if:
    - The answer quality is very poor (average score < 4)
    - We've reached 5 questions
    - The candidate has demonstrated sufficient knowledge or the candidate is not interested in the company or the candidate lacks the skills to be a good fit for the company
    
    Also include a 'feedback' field with specific constructive feedback about the answer."""

    analysis_result = model.generate_content(analysis_prompt)
    print(analysis_result.text.strip())

    # Fix the regex pattern to properly capture the JSON content
    result = re.search(r"```json\n(.*?)\n```", analysis_result.text, re.DOTALL)
    if result:
        try:
            # Extract the JSON content from group 1 (what's inside the parentheses in regex)
            json_str = result.group(1)
            analysis = json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            analysis = {}
    else:
        print("No JSON found in the response")
        analysis = {}

    print(analysis)

    if not analysis.get("continue_interview", True):
        # Return final feedback if we're done
        final_prompt = f"""Based on all the previous interactions, provide a comprehensive feedback summary for the candidate.
        Include:
        1. Overall technical proficiency
        2. Key strengths demonstrated
        3. Areas for improvement
        4. Readiness for a role at {request['company']}
        
        Make it constructive and actionable."""

        final_feedback = model.generate_content(final_prompt)
        return {
            "done": True,
            "analysis": analysis,
            "final_feedback": final_feedback.text.strip(),
        }

    # Generate next question if continuing
    next_question_prompt = f"""Based on the previous question: '{request['previous_question']}'
    and the candidate's answer: '{request['answer']}'
    
    The answer was rated as follows:
    {analysis}
    
    Generate a follow-up technical question that:
    1. Addresses any weaknesses shown in the previous answer
    2. Progressively increases in difficulty
    3. Stays relevant to the candidate's experience
    
    Return ONLY the question as a string."""

    result = model.generate_content(next_question_prompt)
    return {"done": False, "next_question": result.text.strip(), "analysis": analysis}


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
