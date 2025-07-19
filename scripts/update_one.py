# scripts/update_one.py
import sys
import json
import os
import datetime
import time
import random
import instaloader
from instaloader.exceptions import ConnectionException

if len(sys.argv) < 2:
    print("Usage: update_one.py <username>")
    exit(1)

username = sys.argv[1]
data_dir = os.path.join(os.getcwd(), "public", "data")
os.makedirs(data_dir, exist_ok=True)
data_file = os.path.join(data_dir, f"{username}.json")

loader = instaloader.Instaloader()

# Add rate limiting and error handling
try:
    print(f"Fetching profile for {username}...")
    profile = instaloader.Profile.from_username(loader.context, username)
    followers = profile.followers
    following = profile.followees
    today = datetime.date.today().isoformat()
    print(f"Successfully fetched data for {username}: {followers} followers, {following} following.")
except ConnectionException as e:
    print(f"ERROR: Rate limit or connection error for {username}: {e}")
    print("Try again later with longer delays between requests.")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: Unexpected error for {username}: {e}")
    sys.exit(1)

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
