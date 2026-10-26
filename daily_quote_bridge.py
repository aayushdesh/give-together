import json
from datetime import date
from greetings import positive_message

quote = positive_message()
if not isinstance(quote, str) or not quote.strip() or len(quote) > 500:
    raise ValueError("The greeting must be text between 1 and 500 characters.")
print(json.dumps({"quote": quote, "date": date.today().isoformat()}))
