import datetime
import json
import os
import random
import sys
import time

import instaloader
from instaloader.exceptions import ConnectionException, InstaloaderException
import psycopg
from psycopg.rows import dict_row
from psycopg.extras import execute_values

# --- Setup Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME", "cristianofagundes")
SESSION_FILE = os.getenv(
    "INSTAGRAM_SESSION_FILE",
    os.path.join(BASE_DIR, "instagram.session"),
)
SESSION_ID = os.getenv("INSTAGRAM_SESSION_ID")
print(f"Base directory: {BASE_DIR}")
print(f"Data directory: {DATA_DIR}")

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "user": os.getenv("POSTGRES_USER", "devuser"),
    "password": os.getenv("POSTGRES_PASSWORD", "devpass"),
    "dbname": os.getenv("POSTGRES_DB", "insta-followers"),
}

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS follower_history (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      followers INTEGER NOT NULL,
      following INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT follower_history_unique UNIQUE(account_id, date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS account_followers (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      follower_username TEXT NOT NULL,
      full_name TEXT,
      profile_pic_url TEXT,
      is_private BOOLEAN,
      is_verified BOOLEAN,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT account_followers_unique UNIQUE(account_id, follower_username)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS account_followers_account_id_idx
      ON account_followers (account_id)
    """,
    """
    ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    """,
    """
    ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    """,
    """
    CREATE INDEX IF NOT EXISTS accounts_is_deleted_idx
    ON accounts (is_deleted, COALESCE(deleted_at, '1970-01-01'::timestamptz), username)
    """,
    """
    CREATE TABLE IF NOT EXISTS admin_devices (
      id SERIAL PRIMARY KEY,
      device_uuid TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
)


def get_db_connection():
    print(
        "Connecting to Postgres with host={host} port={port} db={dbname}".format(
            **DB_CONFIG
        )
    )
    return psycopg.connect(**DB_CONFIG)


def ensure_schema(conn: psycopg.Connection):
    with conn.cursor() as cur:
        for statement in SCHEMA_STATEMENTS:
            cur.execute(statement)
    conn.commit()


def fetch_accounts(conn: psycopg.Connection):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, username, is_deleted, deleted_at
            FROM accounts
            ORDER BY is_deleted ASC,
                     COALESCE(deleted_at, to_timestamp(0)) ASC,
                     username ASC
            """
        )
        return cur.fetchall()


def load_session(loader: instaloader.Instaloader) -> bool:
    if SESSION_ID:
        loader.context.session.cookies.set(
            "sessionid",
            SESSION_ID,
            domain=".instagram.com",
            path="/",
        )
        print("Session loaded from INSTAGRAM_SESSION_ID environment variable.")
        return True

    if not SESSION_FILE:
        return False

    if not os.path.exists(SESSION_FILE):
        return False

    try:
        loader.load_session_from_file(INSTAGRAM_USERNAME, SESSION_FILE)
        print("Session loaded successfully from session file.")
        return True
    except FileNotFoundError:
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: Failed to load session file as Instaloader session: {exc}")

    # Try reading as JSON with a sessionid field
    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as file:
            content = file.read().strip()
            try:
                data = json.loads(content)
                session_value = data.get("sessionid")
            except json.JSONDecodeError:
                session_value = content if content else None
        if session_value:
            loader.context.session.cookies.set(
                "sessionid",
                session_value,
                domain=".instagram.com",
                path="/",
            )
            print("Session loaded from session file using raw sessionid.")
            return True
    except OSError as exc:
        print(f"WARNING: Could not read session file: {exc}")

    return False


def upsert_history(account_id: int, target_date: datetime.date, followers: int, following: int | None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO follower_history (account_id, date, followers, following)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (account_id, date)
                DO UPDATE SET followers = EXCLUDED.followers,
                              following = EXCLUDED.following
                """,
                (account_id, target_date, followers, following),
            )
        conn.commit()


def replace_followers(account_id: int, followers: list[dict[str, object]]):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM account_followers WHERE account_id = %s",
                (account_id,),
            )

            if followers:
                execute_values(
                    cur,
                    """
                    INSERT INTO account_followers (
                        account_id,
                        follower_username,
                        full_name,
                        profile_pic_url,
                        is_private,
                        is_verified
                    )
                    VALUES %s
                    """,
                    [
                        (
                            account_id,
                            follower["username"],
                            follower.get("full_name"),
                            follower.get("profile_pic_url"),
                            follower.get("is_private"),
                            follower.get("is_verified"),
                        )
                        for follower in followers
                    ],
                    page_size=1000,
                )
        conn.commit()


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
    max_connection_attempts=1,
)

# Try to load a session file
if not load_session(loader):
    print("Session credentials not provided. Using anonymous access.")
    print("WARNING: Anonymous access has much stricter rate limits.")

accounts: list[dict[str, object]] = []

try:
    with get_db_connection() as conn:
        ensure_schema(conn)
        accounts = fetch_accounts(conn)
except psycopg.OperationalError as exc:
    print(f"ERROR: Could not connect to database: {exc}")
    sys.exit(1)

if not accounts:
    print("No accounts found in the database. Exiting.")
    sys.exit(0)

active_accounts = [acc for acc in accounts if not acc.get("is_deleted")]
deleted_accounts = [acc for acc in accounts if acc.get("is_deleted")]
ordered_accounts = active_accounts + deleted_accounts

print(
    "Found {total} accounts to update ({active} active, {deleted} deleted).".format(
        total=len(ordered_accounts),
        active=len(active_accounts),
        deleted=len(deleted_accounts),
    )
)
if active_accounts:
    print(
        "Active queue: " + ", ".join(acc["username"] for acc in active_accounts)
    )
if deleted_accounts:
    print(
        "Soft-deleted queue: "
        + ", ".join(acc["username"] for acc in deleted_accounts)
    )

# --- Update Followers ---
account_limit_env = os.getenv("MAX_ACCOUNTS_PER_RUN", "").strip()
account_limit: int | None = None

if account_limit_env:
    try:
        parsed_limit = int(account_limit_env)
        if parsed_limit > 0:
            account_limit = parsed_limit
    except ValueError:
        print(
            f"WARNING: Ignoring invalid MAX_ACCOUNTS_PER_RUN value '{account_limit_env}'."
        )

if account_limit is None:
    accounts_to_process = ordered_accounts
    print(
        f"Processing all {len(accounts_to_process)} accounts: "
        + ", ".join(
            f"{acc['username']}{' (deleted)' if acc.get('is_deleted') else ''}"
            for acc in accounts_to_process
        )
    )
else:
    accounts_to_process = ordered_accounts[:account_limit]
    print(
        f"Processing {len(accounts_to_process)} of {len(ordered_accounts)} accounts"
        f" due to MAX_ACCOUNTS_PER_RUN={account_limit}."
    )
    print(
        "Accounts to process: "
        + ", ".join(
            f"{acc['username']}{' (deleted)' if acc.get('is_deleted') else ''}"
            for acc in accounts_to_process
        )
    )
    if len(ordered_accounts) > account_limit:
        remaining = ordered_accounts[account_limit:]
        skipped_deleted = [acc for acc in remaining if acc.get("is_deleted")]
        skipped_active = [acc for acc in remaining if not acc.get("is_deleted")]
        if skipped_active:
            print(
                "WARNING: Reached account limit while still having active accounts pending: "
                + ", ".join(acc["username"] for acc in skipped_active)
            )
        if skipped_deleted:
            print(
                "Skipped soft-deleted accounts this run due to limit: "
                + ", ".join(acc["username"] for acc in skipped_deleted)
            )

for account in accounts_to_process:
    username = account["username"]
    is_deleted = bool(account.get("is_deleted"))
    label = f"{username} ({'deleted' if is_deleted else 'active'})"
    print(f"\n--- Processing {label} ---")
    try:
        print(f"Fetching profile for {username}...")
        profile = instaloader.Profile.from_username(loader.context, username)
        followers = profile.followers
        following = profile.followees
        today = datetime.date.today()
        print(
            f"Successfully fetched data for {username}: {followers} followers, {following} following."
        )

        upsert_history(account["id"], today, followers, following)
        print(f"Successfully wrote updates for {username} to the database.")

        follower_records: list[dict[str, object]] = []
        print(f"Fetching followers list for {username}...")
        try:
            for idx, follower in enumerate(profile.get_followers(), start=1):
                follower_records.append(
                    {
                        "username": follower.username,
                        "full_name": follower.full_name,
                        "profile_pic_url": follower.profile_pic_url,
                        "is_private": follower.is_private,
                        "is_verified": follower.is_verified,
                    }
                )

                if idx % 200 == 0:
                    print(
                        f"Fetched {idx} followers so far for {username}"
                    )

            replace_followers(account["id"], follower_records)
            print(
                f"Stored {len(follower_records)} followers for {username} in the database."
            )
        except InstaloaderException as follower_error:
            print(
                f"WARNING: Could not fetch followers list for {username}: {follower_error}"
            )
        except Exception as follower_error:  # noqa: BLE001
            print(
                f"WARNING: Unexpected error while fetching followers for {username}: {follower_error}"
            )

    except ConnectionException as e:
        print(f"ERROR: A connection error occurred for {username}: {e}")
        print("This is likely due to Instagram rate-limiting or blocking the request.")
        print("Implementing exponential backoff...")
        if is_deleted:
            backoff_range = (900, 1800)
        else:
            backoff_range = (120, 360)
        backoff_time = random.uniform(*backoff_range)
        print(
            "Waiting {seconds:.2f} seconds before continuing (".format(seconds=backoff_time)
            + ("soft-deleted account" if is_deleted else "active account quick retry")
            + ")..."
        )
        time.sleep(backoff_time)
        print("The script will continue with the next user.")
    except Exception as e:  # noqa: BLE001
        print(f"An unexpected error occurred while processing {username}: {e}")

    if is_deleted:
        sleep_range = (300, 900)
    else:
        sleep_range = (90, 180)
    sleep_time = random.uniform(*sleep_range)
    print(
        f"Waiting for {sleep_time:.2f} seconds before next account"
        + (" (soft-deleted)" if is_deleted else "")
        + "..."
    )
    time.sleep(sleep_time)

print("\n--- Script finished ---")
