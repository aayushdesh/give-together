import json
from pathlib import Path

CATEGORIES = ["Food", "Toys", "Clothes", "School supplies", "Junk","Other"]


def donation_ideas(category):
    if category == "Food":
        return ["Canned goods", "Pasta", "Rice", "Cereal"]
    elif category == "Toys":
        return ["Board games", "Stuffed animals", "Action figures"]
    elif category == "Clothes":
        return ["Winter coats", "Sweaters", "Pants"]
    elif category == "School supplies":
        return ["Notebooks", "Pens", "Backpacks"]
    elif category == "Junk":
        return ["Old newspapers", "Magazines", "Bottles"]
    else:
        return ["Ask the drive organizer what they need most."]


def progress_message(percent):
    if percent == 0:
        return "Time to get going! Everything counts."
    elif percent < 50:
        return "Nice going! Keep it up!"
    elif percent == 50:
        return "Halfway there! Great job!"
    elif percent  >50 and percent < 100:
        return "Almost there! Keep up the good work!"
    elif percent == 100:
        return "Congratulations! You've reached your goal!"


def build_features():
    ideas = {}
    for category in CATEGORIES:
        result = donation_ideas(category)
        if not isinstance(result, list) or not all(isinstance(x, str) for x in result):
            raise ValueError("donation_ideas must return a list of strings.")
        ideas[category] = result

    messages = []
    for percent in range(101):
        message = progress_message(percent)
        if not isinstance(message, str):
            raise ValueError("progress_message must return a string.")
        messages.append(message)

    result = {"ideas": ideas, "progressMessages": messages}
    output = Path(__file__).parent / "public" / "student-features.json"
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("Saved your Python features! Refresh Give Together to see them.")

def items_remaining(goal, current):
    return max(0, goal - current)

drive_items = [
    {"name": "Canned goods", "needed": 30, "donated": 12},
    {"name": "Boxes of pasta", "needed": 20, "donated": 5},
]
if __name__ == "__main__":
    build_features()

    #remaining = items_remaining(30, 12)
    #print("Items remaining:", remaining)
    for item in drive_items:
            remaining = items_remaining(item["needed"], item["donated"])
            print(item["name"], "— still needed:", remaining)