import random
from datetime import date 

def positive_message():
    messages = [
        "Small acts of kindness can make a big difference!",
        "You can help make today a little brighter.",
        "Every kind action counts.",
        "You do not have to be perfect to make a difference.",
        "Helping others starts with one small step.",
        "Your ideas can help your community grow.",
        "A little sharing can bring a lot of joy.",
        "Be proud of the kindness you choose to show.",
        "Together, we can do more good.",
        "You have something special to offer the world.",
        "Kindness can be as simple as listening.",
        "It is okay to start small.",
        "Thank you for caring about your neighbors!",
        "One thoughtful choice can brighten someone's day.",
        "Your time and care matter, too."]
    today = date.today().isoformat()
    daily_random = random.Random(today)
    return daily_random.choice(messages)
if __name__ == "__main__":
    print(positive_message())