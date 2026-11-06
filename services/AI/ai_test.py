# =============================================================================
# ai_test.py — OpenAI GPT -integraation komentorivikokeilu (ultraääni-QA)
# =============================================================================
# ROOLI PUTKESSA:  tämä on AI-avusteisen raportoinnin varhainen prototyyppi.
# Se EI ole osa varsinaista putkea (Orthanc -> analyysi -> MS SQL), vaan
# erillinen testiskripti, jolla kokeillaan GPT-mallin kykyä selittää
# ultraäänikuvan QA-lukuja (s_depth, u_cov, u_skew, u_low) käyttäjälle.
# Varsinainen tuotantokäyttö tapahtuu web-backendin kautta (ai_chat.py / Go).
#
# HUOM (tunnettu tekninen velka): conversation_history on globaali lista, johon
# kertyy koko keskustelu. Pitkässä ajossa se kasvaa rajatta (muistivuoto) ja on
# jaettu kaikkien kesken. Korjataan tuotannossa pyyntökohtaisella kontekstilla.
# =============================================================================

import os
import openai
from dotenv import load_dotenv
import logging

# Lataa API-avain .env-tiedostosta (OPENAI_API_KEY ei saa olla koodissa).
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

# Keskeytä heti selkeällä virheellä jos avain puuttuu — muuten virhe tulisi
# vasta ensimmäisessä API-kutsussa epäselvempänä.
if openai_api_key is None:
    raise ValueError("OpenAI API key is missing! Set it in the .env file.")

# Luo OpenAI-asiakasobjekti annetulla avaimella.
client = openai.OpenAI(api_key=openai_api_key)

# AI:n muisti - keskusteluhistoriaa varten.
# Ensimmäinen "system"-viesti ohjeistaa mallin roolin (ultraäänilaadunvalvonnan
# asiantuntija). Jokainen käyttäjän ja AI:n viesti lisätään tähän listaan, jotta
# malli muistaa aiemman keskustelun.
conversation_history = [
    {"role": "system", "content": "You are an expert in ultrasound quality control. You specialize in explaining numerical results from ultrasound images, particularly s_depth, u_cov, u_skew, and u_low. Your task is to provide professional explanations of these values, indicating whether they are good or bad and what they mean for image quality."}
]

logger = logging.getLogger(__name__)


def generate_response(user_input):
    """
    Lähettää viestin AI:lle ja palauttaa vastauksen.
    """
    # Lisää käyttäjän viesti keskusteluhistoriaan (malli näkee koko aiemman keskustelun).
    conversation_history.append({"role": "user", "content": user_input})

    # Kutsu OpenAI API:a. Parametrit:
    #   model       = käytettävä kielimalli
    #   temperature = 0.5 -> maltillinen satunnaisuus (ei liian arvaamaton)
    #   max_tokens  = 300 -> rajaa vastauksen pituutta (kustannus/nopeus)
    #   top_p       = 1.0 -> ei lisärajausta sanavalinnoille
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Vaihda "gpt-3.5-turbo" jos haluat
        messages=conversation_history,
        temperature=0.5,
        max_tokens=300,
        top_p=1.0
    )

    # Poimi mallin vastausteksti (ensimmäinen vaihtoehto).
    ai_response = response.choices[0].message.content

    # Lisää AI:n vastaus historiaan, jotta se säilyy seuraavissa kysymyksissä.
    conversation_history.append({"role": "assistant", "content": ai_response})

    return ai_response


# Interaktiivinen chat-silmukka: ajetaan vain kun tiedosto käynnistetään suoraan.
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logger.info("🔍 Ultrasound Quality Control AI Consultant - Type 'exit' to exit.")
    while True:
        user_query = input("You: ")
        # Lopetussanat (eng/suomi) katkaisevat silmukan.
        if user_query.lower() in ["exit", "quit", "lopeta"]:
            logger.info("AI: Thanks for the discussion! 😊")
            break

        # Lähetä kysymys mallille ja tulosta vastaus.
        ai_response = generate_response(user_query)
        logger.info("AI: %s\n", ai_response)
