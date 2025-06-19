import os
import openai
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

# Lataa ympäristömuuttujat
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

if openai_api_key is None:
    raise ValueError("OpenAI API key is missing! Set it in the .env file.")

# Luo OpenAI-asiakas
client = openai.OpenAI(api_key=openai_api_key)

# Luo FastAPI-sovellus
app = FastAPI(title="Ultraäänikuvien Laadunvalvonta Chat", version="1.0")

# Keskusteluhistoria (simuloitu muisti)
conversation_history = [
    {"role": "system", "content": "You are an expert in ultrasound quality control. You specialize in explaining numerical results from ultrasound images, particularly s_depth, u_cov, u_skew, and u_low."}
]

# Määritellään API:lle saapuvan datan malli
class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Lähettää käyttäjän viestin OpenAI:lle ja palauttaa vastauksen.
    """
    user_input = request.message

    if not user_input:
        raise HTTPException(status_code=400, detail="No message provided")

    # Lisää käyttäjän viesti historiaan
    conversation_history.append({"role": "user", "content": user_input})

    # OpenAI API kutsu
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Voit vaihtaa "gpt-3.5-turbo"
        messages=conversation_history,
        temperature=0.5,
        max_tokens=300
    )

    # Hae AI:n vastaus
    ai_response = response.choices[0].message.content
    conversation_history.append({"role": "assistant", "content": ai_response})

    return {"response": ai_response}

@app.get("/")
async def root():
    return {"message": "Ultraäänikuvien Laadunvalvonta Chat on käynnissä!"}

