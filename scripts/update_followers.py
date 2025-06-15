import json
import datetime
import os
import instaloader

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")

loader = instaloader.Instaloader()

with open(ACCOUNTS_FILE, "r") as f:
    accounts = json.load(f)

for username in accounts:
    try:
        profile = instaloader.Profile.from_username(loader.context, username)
        followers = profile.followers
        following = profile.followees
        today = datetime.date.today().isoformat()

        user_file = os.path.join(DATA_DIR, f"{username}.json")
        print(f"Writing to {user_file}")

        if os.path.exists(user_file):
            with open(user_file, "r") as f:
                data = json.load(f)
        else:
            data = {"username": username, "history": []}

        if not any(entry["date"] == today for entry in data["history"]):
            data["history"].append({"date": today, "followers": followers, "following": following})

        with open(user_file, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Updated {username}: followers={followers}, following={following}")
    except Exception as e:
        print(f"Error updating {username}: {e}")