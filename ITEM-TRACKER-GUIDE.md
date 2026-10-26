# Your item tracker is connected

## Try it

1. Restart the website after this update: in its terminal, press Ctrl+C, then run `npm.cmd start`.
2. Refresh the website and sign in with your own Google account.
3. Scroll to **My drives** and choose a practice drive.
4. Click **Item tracker**, then **Add an item**.
5. Enter **Cans of food**, **30** needed, and **12** received. Save it.
6. The tracker should show **18 still needed**.
7. Choose **Update item**. Change the received total to **35**. It should show **Goal reached**, with 35 received and a goal of 30.

Enter the TOTAL received so far, not just the latest delivery. If you have 12 cans and receive 3 more, enter 15. Correcting the total down is allowed if you made a counting mistake.

Visitors can click **Items needed** on a drive card to see its tracker. Only its organizer can add or update items. Each drive stores its own item list. Old drives start with no tracked items; the website does not guess quantities from earlier text descriptions.

The tracker is a separate inventory total. Checking a donor's **Received** box does not change item quantities, and changing quantities does not check off a donor or stop that donor's reminders. Use both controls as needed. Even an ended drive's organizer can correct its final item totals.

## How YOUR Python function reaches the website

1. The website asks the server for a drive's saved items.
2. The server reads `drive_items` from SQLite.
3. `item_tracker_bridge.py` imports `items_remaining` from `student_features.py`.
4. Your function calculates the remaining amount for each item.
5. The server sends those results to the page.

Your existing `items_remaining(goal, current)` function was preserved. Changes you save to it are used the next time you open the tracker—no need to run `build_features()` for this calculation. Keep returning a non-negative whole number.

The example `drive_items` list in your Python file is still practice data. It is not automatically inserted into the real database. The numbers entered through **Add an item** are the real saved item records.

## Which code is yours, and which code was supplied?

Your current calculation is in `student_features.py`. Codex supplied the database setup, server endpoints, Python adapter, forms, display, and integration checks. Document that help in your build log alongside the work you personally wrote and tested.

## If Python cannot run

Python 3 must be installed on the machine running the server. On Windows the server uses `py -3`; on other systems it uses `python3`. You can optionally set `PYTHON_PATH` in `.env` to the full path of your Python executable, then restart the server. Do not add quotes or command-line flags to that setting.

The server creates the item table automatically if it is missing. Running `py item_database.py` manually is still safe.
