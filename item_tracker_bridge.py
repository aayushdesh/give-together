import json
import sys
from student_features import items_remaining


def calculate_items(items):
    results = []
    for item in items:
        remaining = items_remaining(item["needed"], item["donated"])
        if type(remaining) is not int or remaining < 0:
            raise ValueError("items_remaining must return a non-negative whole number.")
        results.append({**item, "remaining": remaining})
    return results


if __name__ == "__main__":
    print(json.dumps(calculate_items(json.load(sys.stdin))))
