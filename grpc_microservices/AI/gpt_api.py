# =============================================================================
# gpt_api.py — OpenAI GPT -integraatio HTTP-rajapintana (FastAPI)
# =============================================================================
# ROOLI PUTKESSA:  AI-avusteinen QA-raportointi web-rajapinnan takana.
# Tarjoaa HTTP-POST-päätepisteen /chat, jonne web-frontend/backend voi lähettää
# käyttäjän kysymyksen ultraäänikuvan QA-luvuista ja saada GPT:n selityksen.
# Tämä on FastAPI-versio (vrt. ai_test.py/gpt_chat.py, jotka ovat komentorivillä).
#
# HUOM (tunnettu tekninen velka): conversation_history on globaali -> kaikki
# käyttäjät/pyynnöt jakavat saman historian (ei istuntokohtainen) ja se kasvaa
# rajatta. Tuotannossa tila pitää eriyttää pyyntö-/istuntokohtaiseksi.
# =============================================================================

import os
import openai
from fastapi import FastAPI, HTTPException   # kevyt web-framework + HTTP-virheet
from pydantic import BaseModel               # pyyntörungon validointi/mallinnus
from dotenv import load_dotenv

# Lataa ympäristömuuttujat (.env) ja lue OpenAI-avain.
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

# Keskeytä heti jos avain puuttuu.
if openai_api_key is None:
    raise ValueError("OpenAI API key is missing! Set it in the .env file.")

# Luo OpenAI-asiakas annetulla avaimella.
client = openai.OpenAI(api_key=openai_api_key)

# Luo FastAPI-sovellusolio (reitit kiinnitetään tähän @app-dekoraattoreilla).
app = FastAPI(title="Ultraäänikuvien Laadunvalvonta Chat", version="1.0")

# Keskusteluhistoria (simuloitu muisti). "system"-viesti ohjaa mallin roolin.
conversation_history = [
    {"role": "system", "content": "You are an expert in ultrasound quality control. You specialize in explaining numerical results from ultrasound images, particularly s_depth, u_cov, u_skew, and u_low."}
]

# Määritellään API:lle saapuvan datan malli: JSON-runko jossa kenttä "message".
# Pydantic validoi automaattisesti, että pyyntö sisältää tekstikentän message.
class ChatRequest(BaseModel):
    message: str

# HTTP POST /chat — ottaa vastaan käyttäjän viestin ja palauttaa AI:n vastauksen.
@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Lähettää käyttäjän viestin OpenAI:lle ja palauttaa vastauksen.
    """
    user_input = request.message

    # Tyhjä viesti -> HTTP 400 Bad Request.
    if not user_input:
        raise HTTPException(status_code=400, detail="No message provided")

    # Lisää käyttäjän viesti historiaan.
    conversation_history.append({"role": "user", "content": user_input})

    # OpenAI API kutsu (temperature=0.5, max_tokens=300 rajaa pituuden).
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Voit vaihtaa "gpt-3.5-turbo"
        messages=conversation_history,
        temperature=0.5,
        max_tokens=300
    )

    # Hae AI:n vastaus ja lisää se historiaan.
    ai_response = response.choices[0].message.content
    conversation_history.append({"role": "assistant", "content": ai_response})

    # Palauta vastaus JSON-muodossa frontendille.
    return {"response": ai_response}

# HTTP GET / — yksinkertainen terveystarkistus ("palvelu on pystyssä").
@app.get("/")
async def root():
    return {"message": "Ultraäänikuvien Laadunvalvonta Chat on käynnissä!"}

