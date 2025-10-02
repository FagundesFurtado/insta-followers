import datetime
import json
import os
import sys
from glob import glob

import psycopg

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
ACCOUNTS_FILE = os.path.join(DATA_DIR, "accounts.json")

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


def load_accounts() -> set[str]:
    usernames: set[str] = set()
    if os.path.exists(ACCOUNTS_FILE):
        try:
            with open(ACCOUNTS_FILE, "r", encoding="utf-8") as file:
                data = json.load(file)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        usernames.add(item.strip().lower())
                    elif isinstance(item, dict) and item.get("username"):
                        usernames.add(str(item["username"]).strip().lower())
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARNING: Failed to parse {ACCOUNTS_FILE}: {exc}")
    return usernames


def load_history() -> dict[str, list[dict]]:
    history: dict[str, list[dict]] = {}
    for path in glob(os.path.join(DATA_DIR, "*.json")):
        if os.path.basename(path) == "accounts.json":
            continue
        try:
            with open(path, "r", encoding="utf-8") as file:
                data = json.load(file)
            username = str(data.get("username") or os.path.splitext(os.path.basename(path))[0]).strip().lower()
            if not username:
                continue
            entries = data.get("history", [])
            if not isinstance(entries, list):
                continue
            history[username] = entries
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARNING: Failed to parse {path}: {exc}")
    return history


def main():
    usernames = load_accounts()
    history_data = load_history()

    usernames.update(history_data.keys())

    if not usernames:
        print("No accounts found in JSON files. Nothing to import.")
        return

    try:
        with psycopg.connect(**DB_CONFIG) as conn:
            ensure_schema(conn)
            with conn.cursor() as cur:
                account_ids: dict[str, int] = {}
                for username in sorted(usernames):
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
                    account_ids[username] = account_id

                for username, entries in history_data.items():
                    account_id = account_ids.get(username)
                    if account_id is None:
                        print(f"WARNING: Skipping history for {username}; account was not created.")
                        continue
                    for entry in entries:
                        date_value = entry.get("date")
                        followers = entry.get("followers")
                        following = entry.get("following")
                        try:
                            parsed_date = datetime.date.fromisoformat(date_value)
                        except (TypeError, ValueError):
                            print(
                                f"WARNING: Skipping invalid date '{date_value}' for {username}."
                            )
                            continue
                        if followers is None:
                            print(
                                f"WARNING: Skipping entry without followers count for {username} on {date_value}."
                            )
                            continue
                        cur.execute(
                            """
                            INSERT INTO follower_history (account_id, date, followers, following)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (account_id, date)
                            DO UPDATE SET followers = EXCLUDED.followers,
                                          following = EXCLUDED.following
                            """,
                            (account_id, parsed_date, followers, following),
                        )
            conn.commit()
        print("Import completed successfully.")
    except psycopg.OperationalError as exc:
        print(f"ERROR: Could not connect to database: {exc}")
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: Failed to import data: {exc}")
        sys.exit(1)
if __name__ == "__main__":
    main()
