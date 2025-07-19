import json
import datetime
import os
import sys
import time
import random
import instaloader
from instaloader.exceptions import ConnectionException

# --- Setup Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")
SESSION_FILE = os.path.join(BASE_DIR, "instagram.session")
print(f"Base directory: {BASE_DIR}")
print(f"Data directory: {DATA_DIR}")

# --- Initialize Instaloader ---
loader = instaloader.Instaloader(
    quiet=False,
    user_agent=None,
    dirname_pattern=None,
    filename_pattern=None,
    download_video_thumbnails=False,
    download_geotags=False,
    download_comments=False,
    save_metadata=False,
    compress_json=False,
    post_metadata_txt_pattern=None,
    max_connection_attempts=1  # Reduce connection attempts to avoid rapid retries
)

# Try to load a session file
try:
    loader.load_session_from_file("cristianofagundes", SESSION_FILE)
    print("Session loaded successfully.")
except FileNotFoundError:
    print("Session file not found. Using anonymous access.")
    print("WARNING: Anonymous access has much stricter rate limits.")

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
# Limit to 3 accounts per run to avoid hitting rate limits
MAX_ACCOUNTS_PER_RUN = 3
accounts_to_process = accounts[:MAX_ACCOUNTS_PER_RUN]

if len(accounts) > MAX_ACCOUNTS_PER_RUN:
    print(f"NOTE: Processing only {MAX_ACCOUNTS_PER_RUN} out of {len(accounts)} accounts to avoid rate limits.")
    print(f"Accounts to process: {', '.join(accounts_to_process)}")
    print(f"Remaining accounts: {', '.join(accounts[MAX_ACCOUNTS_PER_RUN:])}")
else:
    print(f"Processing all {len(accounts)} accounts: {', '.join(accounts_to_process)}")

for username in accounts_to_process:
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
        # Handle specific connection errors which are likely rate limit related
        print(f"ERROR: A connection error occurred for {username}: {e}")
        print("This is likely due to Instagram rate-limiting or blocking the request.")
        print("Implementing exponential backoff...")
        
        # Exponential backoff: wait much longer for 401 errors
        backoff_time = random.uniform(900, 1800)  # 15-30 minutes
        print(f"Waiting {backoff_time:.2f} seconds before continuing...")
        time.sleep(backoff_time)
        print("The script will continue with the next user.")
    except Exception as e:
        # Handle any other unexpected errors
        print(f"An unexpected error occurred while processing {username}: {e}")
    
    # Add very conservative delay to avoid 401 errors
    # Instagram is very aggressive with rate limiting, use 5-15 minutes between requests
    sleep_time = random.uniform(300, 900)  # 5-15 minutes
    print(f"Waiting for {sleep_time:.2f} seconds before next account...")
    time.sleep(sleep_time)


print("\n--- Script finished ---")