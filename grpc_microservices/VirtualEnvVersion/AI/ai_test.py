import os
import openai
from dotenv import load_dotenv

# Lataa API-avain .env-tiedostosta
load_dotenv()
openai_api_key = os.getenv("OPENAI_API_KEY")

if openai_api_key is None:
    raise ValueError("OpenAI API key is missing! Set it in the .env file.")

# Luo OpenAI-asiakasobjekti
client = openai.OpenAI(api_key=openai_api_key)

# AI:n muisti - keskusteluhistoriaa varten
conversation_history = [
    {"role": "system", "content": "You are an expert in ultrasound quality control. You specialize in explaining numerical results from ultrasound images, particularly s_depth, u_cov, u_skew, and u_low. Your task is to provide professional explanations of these values, indicating whether they are good or bad and what they mean for image quality."}
]

def generate_response(user_input):
    """
    Lähettää viestin AI:lle ja palauttaa vastauksen.
    """
    # Lisää käyttäjän viesti keskusteluhistoriaan
    conversation_history.append({"role": "user", "content": user_input})

    # Kutsu OpenAI API:a
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Vaihda "gpt-3.5-turbo" jos haluat
        messages=conversation_history,
        temperature=0.5,
        max_tokens=300,
        top_p=1.0
    )

    # Get the answer
    ai_response = response.choices[0].message.content

    # Add AI's response to the conversation history
    conversation_history.append({"role": "assistant", "content": ai_response})

    return ai_response

# Interactive chat loop
if __name__ == "__main__":
    print("🔍 Ultrasound Quality Control AI Consultant - Type 'exit' to exit.")
    while True:
        user_query = input("You: ")
        if user_query.lower() in ["exit", "quit", "lopeta"]:
            print("AI: Thanks for the discussion! 😊")
            break

        ai_response = generate_response(user_query)
        print(f"AI: {ai_response}\n")
