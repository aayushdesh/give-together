import sqlite3
from pathlib import Path


def setup_item_table():
    database_path = Path(__file__).parent / "data" / "give-together.sqlite"

    if not database_path.exists():
        raise FileNotFoundError(
            "Put this file in your give-together folder and start the app first."
        )

    connection = sqlite3.connect(database_path.resolve().as_uri() + "?mode=rw", uri=True)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS drive_items (
                id INTEGER PRIMARY KEY,
                drive_id INTEGER NOT NULL REFERENCES drives(id),
                name TEXT NOT NULL,
                needed INTEGER NOT NULL CHECK (needed > 0),
                donated INTEGER NOT NULL DEFAULT 0 CHECK (donated >= 0)
            )
        """)
        connection.commit()
    finally:
        connection.close()

    print("The item tracker table is ready!")


if __name__ == "__main__":
    setup_item_table()
