# scripts/update_one.py
import sys
import json
import os
import datetime
import instaloader

if len(sys.argv) < 2:
    print("Usage: update_one.py <username>")
    exit(1)

username = sys.argv[1]
data_dir = os.path.join(os.getcwd(), "public", "data")
os.makedirs(data_dir, exist_ok=True)
data_file = os.path.join(data_dir, f"{username}.json")

loader = instaloader.Instaloader()
profile = instaloader.Profile.from_username(loader.context, username)
followers = profile.followers
following = profile.followees
today = datetime.date.today().isoformat()

# Load or create data
if os.path.exists(data_file):
    with open(data_file, "r") as f:
        data = json.load(f)
else:
    data = {"username": username, "history": []}

# Avoid duplicates
if not any(entry["date"] == today for entry in data["history"]):
    data["history"].append({"date": today, "followers": followers, "following": following})

with open(data_file, "w") as f:
    json.dump(data, f, indent=2)
