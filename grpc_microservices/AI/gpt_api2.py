# =============================================================================
# gpt_api2.py — OpenAI GPT -integraatio: FastAPI-palvelin + terminaalichat samassa
# =============================================================================
# Kehittyneempi versio gpt_api.py:stä: käynnistää FastAPI-palvelimen (uvicorn)
# TAUSTASÄIKEESSÄ ja avaa samalla interaktiivisen chatin terminaaliin, joka
# puhuu palvelimelle HTTP:llä. Näin voi testata koko HTTP-reittiä (ei vain
# suoraa funktiokutsua) yhdellä ajolla. AI-raportoinnin prototyyppi, ei putken osa.
#
# HUOM (tekninen velka): globaali conversation_history (jaettu + kasvaa rajatta).
# =============================================================================

import os
import openai
import uvicorn                               # ASGI-palvelin FastAPI:n ajamiseen
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import threading                             # palvelin ajetaan omassa säikeessään
import logging

# Lataa ympäristömuuttujat (.env) ja lue OpenAI-avain.
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")


# Keskeytä heti jos avain puuttuu.
if openai_api_key is None:
    raise ValueError("OpenAI API key is missing! Set it in the .env file.")

# Luo OpenAI-asiakas annetulla avaimella.
client = openai.OpenAI(api_key=openai_api_key)

# Luo FastAPI-sovellusolio.
app = FastAPI(title="Ultraäänikuvien Laadunvalvonta Chat", version="1.0")

# Keskusteluhistoria (simuloitu muisti). "system"-viesti ohjaa mallin roolin.
conversation_history = [
    {"role": "system", "content": "You are an expert in ultrasound quality control. You specialize in explaining numerical results from ultrasound images, particularly s_depth, u_cov, u_skew, and u_low."}
]

logger = logging.getLogger(__name__)

# API:lle saapuvan JSON-rungon malli (kenttä "message"); Pydantic validoi.
class ChatRequest(BaseModel):
    message: str

# HTTP POST /chat — sama logiikka kuin gpt_api.py:ssä: kysymys -> GPT -> vastaus.
@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Lähettää käyttäjän viestin OpenAI:lle ja palauttaa vastauksen.
    """
    user_input = request.message

    # Tyhjä viesti -> HTTP 400.
    if not user_input:
        raise HTTPException(status_code=400, detail="No message provided")

    # Lisää käyttäjän viesti historiaan.
    conversation_history.append({"role": "user", "content": user_input})

    # OpenAI API kutsu.
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Voit vaihtaa "gpt-3.5-turbo"
        messages=conversation_history,
        temperature=0.5,
        max_tokens=300
    )

    # Hae AI:n vastaus ja lisää historiaan.
    ai_response = response.choices[0].message.content
    conversation_history.append({"role": "assistant", "content": ai_response})

    return {"response": ai_response}

# HTTP GET / — terveystarkistus.
@app.get("/")
async def root():
    return {"message": "Ultrasound Image Quality Control Chat is running!"}

# 🔹 Käynnistetään Uvicorn palvelimena taustalla
# Ajaa FastAPI-sovelluksen portissa 8003 kaikissa verkkoliitännöissä (0.0.0.0).
# Tätä kutsutaan taustasäikeestä, jotta pääsäie voi pyörittää chattia.
def run_server():
    uvicorn.run(app, host="0.0.0.0", port=8003)

# 🔹 Interaktiivinen chat terminaalissa
# Lukee kysymyksiä terminaalista ja lähettää ne taustalla pyörivälle palvelimelle
# HTTP:llä (eli testaa koko reitin, ei vain suoraa funktiokutsua).
def interactive_chat():
    import requests

    url = "http://127.0.0.1:8003/chat"  # paikallinen osoite omaan palvelimeen

    logger.info("\n💬 Ultrasound Image Quality Control AI Chat\nType 'exit' to exit.\n")

    while True:
        user_message = input("Ask question: ")
        # Lopetussanat katkaisevat silmukan.
        if user_message.lower() in ["exit", "quit", "lopeta"]:
            logger.info("AI: Thanks for the discussion! 😊")
            break

        # Lähetä kysymys palvelimelle ja tulosta JSON-vastauksen "response"-kenttä.
        response = requests.post(url, json={"message": user_message})
        logger.info("AI: %s\n", response.json()['response'])

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # Käynnistetään API-palvelin taustalle daemon-säikeessä (loppuu kun pääohjelma loppuu).
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Käynnistetään chat suoraan terminaalissa (pääsäie jää tähän silmukkaan).
    interactive_chat()
