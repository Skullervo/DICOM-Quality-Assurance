# =============================================================================
# test_apikey.py — OpenAI API-avaimen toimivuuden pikatesti
# =============================================================================
# Pienin mahdollinen savutesti: lataa API-avain .env:stä, lähettää yhden
# viestin GPT:lle ja tulostaa vastauksen. Jos tämä toimii, avain ja yhteys
# OpenAI:hin ovat kunnossa. Hyödyllinen ensiaskel ennen muiden AI-skriptien ajoa.
# =============================================================================

import os
from dotenv import load_dotenv
import openai
import logging

logger = logging.getLogger(__name__)


def main():
    # Lataa .env-tiedosto TÄMÄN tiedoston hakemistosta (ei nykyisestä työhakemistosta),
    # jotta avain löytyy riippumatta siitä, mistä skripti käynnistetään.
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    load_dotenv(dotenv_path=env_path)

    # Luo OpenAI-asiakas ladatulla avaimella.
    api_key = os.getenv("OPENAI_API_KEY")
    client = openai.OpenAI(api_key=api_key)

    # Lähetä yksi testiviesti GPT:lle.
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": "Hei GPT, toimiiko tämä?"}
        ]
    )

    # Tulosta mallin vastaus — jos tähän päästään, avain toimii.
    logger.info(response.choices[0].message.content)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    main()

