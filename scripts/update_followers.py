import datetime
import json
import os
from pathlib import Path
from typing import Iterable

import instaloader
from instaloader import exceptions as insta_exc

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "public" / "data"
ACCOUNTS_FILE = DATA_DIR / "accounts.json"
INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME", "cristianofagundes")
SESSION_FILE = os.getenv(
    "INSTAGRAM_SESSION_FILE",
    str(BASE_DIR / "instagram.session"),
)
SESSION_ID = os.getenv("INSTAGRAM_SESSION_ID")


def load_accounts() -> list[str]:
    usernames: list[str] = []

    if ACCOUNTS_FILE.exists():
        try:
            with ACCOUNTS_FILE.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, list):
                for entry in data:
                    if isinstance(entry, str):
                        usernames.append(entry.strip().lower())
                    elif isinstance(entry, dict) and entry.get("username"):
                        usernames.append(str(entry["username"]).strip().lower())
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARNING: Failed to read {ACCOUNTS_FILE}: {exc}")

    if not usernames:
        for path in DATA_DIR.glob("*.json"):
            if path.name == ACCOUNTS_FILE.name:
                continue
            try:
                with path.open("r", encoding="utf-8") as handle:
                    data = json.load(handle)
                username = str(
                    data.get("username") or path.stem
                ).strip().lower()
                if username:
                    usernames.append(username)
            except (json.JSONDecodeError, OSError) as exc:
                print(f"WARNING: Could not parse {path}: {exc}")

    unique_usernames = sorted(set(filter(None, usernames)))

    if not unique_usernames:
        raise SystemExit("No accounts found in JSON snapshots.")

    return unique_usernames


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


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

    if SESSION_FILE and Path(SESSION_FILE).exists():
        try:
            loader.load_session_from_file(INSTAGRAM_USERNAME, SESSION_FILE)
            print("Session loaded successfully from session file.")
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: Failed to load session file: {exc}")

        try:
            with Path(SESSION_FILE).open("r", encoding="utf-8") as handle:
                content = handle.read().strip()
                if content:
                    try:
                        data = json.loads(content)
                        session_value = data.get("sessionid")
                    except json.JSONDecodeError:
                        session_value = content
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


def append_history(username: str, followers: int, following: int | None) -> None:
    ensure_directory(DATA_DIR)
    user_file = DATA_DIR / f"{username}.json"
    today = datetime.date.today().isoformat()

    if user_file.exists():
        try:
            with user_file.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARNING: Could not read {user_file}: {exc}; resetting file")
            payload = {"username": username, "history": []}
    else:
        payload = {"username": username, "history": []}

    history: list[dict[str, object]] = payload.setdefault("history", [])  # type: ignore[assignment]

    if not any(entry.get("date") == today for entry in history):
        history.append(
            {
                "date": today,
                "followers": followers,
                "following": following,
            }
        )
        history.sort(key=lambda entry: entry.get("date") or "")
    else:
        for entry in history:
            if entry.get("date") == today:
                entry["followers"] = followers
                entry["following"] = following

    payload["username"] = username

    with user_file.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)

    print(
        f"Stored {followers} followers and {following} following for {username} on {today}."
    )


def process_accounts(usernames: Iterable[str]) -> None:
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

    if not load_session(loader):
        print("Session credentials not provided. Using anonymous access.")
        print("WARNING: Anonymous access has much stricter rate limits.")

    for username in usernames:
        print(f"\n--- Processing {username} ---")
        try:
            profile = instaloader.Profile.from_username(loader.context, username)
            followers = profile.followers
            following = profile.followees
            print(
                f"Fetched {username}: followers={followers} following={following}"
            )
            append_history(username, followers, following)
        except insta_exc.ConnectionException as exc:
            print(
                f"ERROR: Connection issue while updating {username}: {exc}. Skipping."
            )
        except insta_exc.InstaloaderException as exc:
            print(
                f"ERROR: Instaloader error while updating {username}: {exc}. Skipping."
            )
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: Unexpected error for {username}: {exc}. Skipping.")

    print("\n--- Script finished ---")


if __name__ == "__main__":
    accounts = load_accounts()
    print(f"Found {len(accounts)} accounts: {', '.join(accounts)}")
    process_accounts(accounts)
