from openai import OpenAI
#import openai

# Set your API key
openai_api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    api_key=openai_api_key,  # This is the default and can be omitted
)

def generate_response(user_input):
    """
    Generates a response from OpenAI's GPT model using prompt engineering.
    """
    messages = [
        {"role": "system", "content": "You are an cyber security expert who has special expertise in ransomware detection."},
        {"role": "user", "content": user_input}
    ]
    
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

    # Correct way to extract content
    return response.choices[0].message.content

# Example Usage
if __name__ == "__main__":
    user_query = "there are changes in files, please inform if they are anamolous and give explaination: "
    ai_response = generate_response(user_query)
    print(ai_response)


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
