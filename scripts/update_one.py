import datetime
import json
import os
import sys

import instaloader
from instaloader import exceptions as insta_exc
import psycopg
from psycopg.extras import execute_values

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME", "cristianofagundes")
SESSION_FILE = os.getenv(
    "INSTAGRAM_SESSION_FILE",
    os.path.join(BASE_DIR, "instagram.session"),
)
SESSION_ID = os.getenv("INSTAGRAM_SESSION_ID")

if len(sys.argv) < 2:
    print("Usage: update_one.py <username>")
    sys.exit(1)

username = sys.argv[1].strip().lower()
if not username:
    print("Username cannot be empty")
    sys.exit(1)

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


def ensure_schema(conn: psycopg.Connection):
    with conn.cursor() as cur:
        for statement in SCHEMA_STATEMENTS:
            cur.execute(statement)
    conn.commit()


loader = instaloader.Instaloader()


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

    if not SESSION_FILE or not os.path.exists(SESSION_FILE):
        return False

    try:
        loader.load_session_from_file(INSTAGRAM_USERNAME, SESSION_FILE)
        print("Session loaded successfully from session file.")
        return True
    except FileNotFoundError:
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: Failed to load session file as Instaloader session: {exc}")

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


if not load_session(loader):
    print("Session credentials not provided. Using anonymous access.")
    print("WARNING: Anonymous access has much stricter rate limits.")

try:
    print(f"Fetching profile for {username}...")
    profile = instaloader.Profile.from_username(loader.context, username)
    followers = profile.followers
    following = profile.followees
    today = datetime.date.today()
    print(
        f"Successfully fetched data for {username}: {followers} followers, {following} following."
    )

    follower_records: list[dict[str, object]] | None = []
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
                print(f"Fetched {idx} followers so far for {username}")

        print(
            f"Collected {len(follower_records)} followers for {username}."
        )
    except insta_exc.InstaloaderException as follower_error:
        print(
            f"WARNING: Failed to fetch followers for {username}: {follower_error}"
        )
        follower_records = None
    except Exception as follower_error:  # noqa: BLE001
        print(
            f"WARNING: Unexpected error while fetching followers for {username}: {follower_error}"
        )
        follower_records = None
except insta_exc.ProfileNotExistsException as exc:
    print(f"ERROR: Profile for {username} not found: {exc}")
    sys.exit(1)
except insta_exc.ConnectionException as exc:
    print(f"ERROR: Connection issue for {username}: {exc}")
    sys.exit(1)
except Exception as exc:  # noqa: BLE001
    print(f"ERROR: Unexpected error for {username}: {exc}")
    sys.exit(1)

try:
    with psycopg.connect(**DB_CONFIG) as conn:
        ensure_schema(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accounts (username, is_deleted, deleted_at)
                VALUES (%s, FALSE, NULL)
                ON CONFLICT (username) DO UPDATE
                SET username = EXCLUDED.username,
                    is_deleted = FALSE,
                    deleted_at = NULL
                RETURNING id
                """,
                (username,),
            )
            account_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO follower_history (account_id, date, followers, following)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (account_id, date)
                DO UPDATE SET followers = EXCLUDED.followers,
                              following = EXCLUDED.following
                """,
                (account_id, today, followers, following),
            )

            if follower_records is not None:
                cur.execute(
                    "DELETE FROM account_followers WHERE account_id = %s",
                    (account_id,),
                )

                if follower_records:
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
                                record["username"],
                                record.get("full_name"),
                                record.get("profile_pic_url"),
                                record.get("is_private"),
                                record.get("is_verified"),
                            )
                            for record in follower_records
                        ],
                        page_size=1000,
                    )
        conn.commit()
    if follower_records is not None:
        print("Database updated successfully, including follower list.")
    else:
        print("Database updated successfully (follower list not refreshed).")
except psycopg.OperationalError as exc:
    print(f"ERROR: Could not connect to database: {exc}")
    sys.exit(1)
except Exception as exc:  # noqa: BLE001
    print(f"ERROR: Failed to write data for {username}: {exc}")
    sys.exit(1)
