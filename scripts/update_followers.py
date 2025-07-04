import json
import datetime
import os
import sys
import time
import instaloader
from instaloader.exceptions import ConnectionException

# --- Setup Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")
print(f"Base directory: {BASE_DIR}")
print(f"Data directory: {DATA_DIR}")

# --- Initialize Instaloader ---
loader = instaloader.Instaloader()
print("Instaloader initialized anonymously.")

# --- Load Accounts ---
try:
    with open(ACCOUNTS_FILE, "r") as f:
        accounts = json.load(f)
    print(f"Found {len(accounts)} accounts to update: {', '.join(accounts)}")
except FileNotFoundError:
    print(f"ERROR: Accounts file not found at {ACCOUNTS_FILE}")
    sys.exit(1)
except json.JSONDecodeError:
    print(f"ERROR: Could not decode JSON from {ACCOUNTS_FILE}")
    sys.exit(1)


# --- Update Followers ---
for username in accounts:
    print(f"\n--- Processing {username} ---")
    try:
        # Fetch profile data
        print(f"Fetching profile for {username}...")
        profile = instaloader.Profile.from_username(loader.context, username)
        followers = profile.followers
        following = profile.followees
        today = datetime.date.today().isoformat()
        print(f"Successfully fetched data for {username}: {followers} followers, {following} following.")

        # Prepare to write data
        user_file = os.path.join(DATA_DIR, f"{username}.json")
        print(f"Target data file: {user_file}")

        if os.path.exists(user_file):
            print("Data file exists. Reading existing data.")
            with open(user_file, "r") as f:
                data = json.load(f)
        else:
            print("Data file does not exist. Creating new data structure.")
            data = {"username": username, "history": []}

        # Check if today's data already exists
        if not any(entry["date"] == today for entry in data["history"]):
            print(f"No entry for today ({today}). Appending new data.")
            data["history"].append({"date": today, "followers": followers, "following": following})
            
            # Write updated data to file
            with open(user_file, "w") as f:
                json.dump(data, f, indent=2)
            print(f"Successfully wrote updates for {username} to {user_file}.")
        else:
            print(f"Data for today ({today}) already exists for {username}. Skipping write operation.")

    except ConnectionException as e:
        # Handle specific connection errors which are likely on GitHub Actions
        print(f"ERROR: A connection error occurred for {username}: {e}")
        print("This is likely due to Instagram rate-limiting or blocking the request.")
        print("The script will continue with the next user.")
    except Exception as e:
        # Handle any other unexpected errors
        print(f"An unexpected error occurred while processing {username}: {e}")
    
    # Add a small delay to be less aggressive
    print("Waiting for 5 seconds before next account...")
    time.sleep(5)


print("\n--- Script finished ---")