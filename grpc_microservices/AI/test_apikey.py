import os
from dotenv import load_dotenv
import openai

# Lataa .env API-avain
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

# Luo client
api_key = os.getenv("OPENAI_API_KEY")
client = openai.OpenAI(api_key=api_key)

# Lähetä viesti GPT:lle
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "user", "content": "Hei GPT, toimiiko tämä?"}
    ]
)

print(response.choices[0].message.content)

