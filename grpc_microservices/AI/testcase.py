# =============================================================================
# testcase.py — OpenAI GPT -prompt-engineering-kokeilu (kyberturva-aihe)
# =============================================================================
# EI liity ultraääni-QA:han eikä putkeen — erillinen kokeilu, jossa testataan
# GPT-mallin ohjaamista "system"-roolilla (tässä: ransomware-tunnistus).
# Tiedoston lopussa on kommentoituna esimerkkejä few-shot-ohjauksesta. Jätetty
# repoon mallipohjaksi siitä, miten mallin roolia ja parametreja säädetään.
# =============================================================================

import os
from openai import OpenAI
#import openai
import logging

# Lue OpenAI-avain ympäristömuuttujasta.
openai_api_key = os.getenv("OPENAI_API_KEY")

# Luo OpenAI-asiakas. (Jos api_key jätetään pois, kirjasto lukee sen itse
# OPENAI_API_KEY-ympäristömuuttujasta — tässä annetaan silti eksplisiittisesti.)
client = OpenAI(
    api_key=openai_api_key,  # This is the default and can be omitted
)

logger = logging.getLogger(__name__)


def generate_response(user_input):
    """
    Generates a response from OpenAI's GPT model using prompt engineering.
    """
    # Rakennetaan viestilista: system-rooli asettaa asiantuntija-persoonan,
    # user-rooli sisältää varsinaisen kysymyksen. Tässä EI säilytetä historiaa
    # (jokainen kutsu on itsenäinen, toisin kuin chat-skripteissä).
    messages = [
        {"role": "system", "content": "You are an cyber security expert who has special expertise in ransomware detection."},
        {"role": "user", "content": user_input}
    ]

    # Parametrit ohjaavat vastausta tarkemmin kuin chat-skripteissä:
    #   temperature=0.7       -> hieman luovempi vastaus
    #   frequency/presence_penalty -> vähentää toistoa ja kannustaa uusiin aiheisiin
    response = client.chat.completions.create(
        #model="gpt-4o-mini",  # Use "gpt-3.5-turbo" if needed
        model="gpt-3.5-turbo",  # Use "gpt-3.5-turbo" if needed
        messages=messages,
        temperature=0.7,
        max_tokens=200,
        top_p=1.0,
        frequency_penalty=0.5,
        presence_penalty=0.3
    )

    # Poimi ja palauta mallin vastausteksti.
    return response.choices[0].message.content


# Esimerkkikäyttö: ajetaan vain kun tiedosto käynnistetään suoraan.
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    user_query = "there are changes in files, please inform if they are anamolous and give explaination: "
    ai_response = generate_response(user_query)
    logger.info(ai_response)


""""
Few-shot learning

messages = [
    {"role": "system", "content": "You are a cybersecurity expert providing concise, well-structured answers."},
    {"role": "user", "content": "How can I secure an API?"},
    {"role": "assistant", "content": "To secure an API, use authentication (OAuth, API keys), encryption (HTTPS, TLS), rate limiting, and input validation."},
    {"role": "user", "content": "How can I secure a microservice architecture?"}
]

"""


"""
Optimizing for a Specific Domain

If you're integrating this into a security, XR, or multi-agent system, you can adjust the system message accordingly. Example:

{"role": "system", "content": "You are an expert in AI-driven cybersecurity and cloud-based distributed systems. Provide responses with a strong technical depth."}
"""
