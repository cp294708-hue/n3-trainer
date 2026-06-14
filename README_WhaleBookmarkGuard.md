# WhaleBookmarkGuard

PowerShell-based inspection and cleanup tool for Windows PCs where unknown bookmarks keep appearing in Naver Whale.

## What it does

- Automatically searches the default Whale user-data directory: `%LOCALAPPDATA%\Naver\Naver Whale\User Data`.
- Finds every profile that has a `Bookmarks` file, such as `Default`, `Profile 1`, and `Profile 2`.
- Backs up profile `Bookmarks` and `Preferences` files before every run.
- Writes logs to `%USERPROFILE%\Documents\WhaleBookmarkGuard\logs`.
- Stores backups in `%USERPROFILE%\Documents\WhaleBookmarkGuard\backup`.
- Supports four modes: `report`, `init`, `clean`, and `install-task`.

## Manual checklist before using automatic cleanup

1. Open `whale://extensions` and delete any extension you do not recognize.
2. In Whale settings, turn off bookmark sync under Sync settings.
3. If needed, reset server-side sync data from Whale sync data management.
4. Manually clean your bookmarks until only trusted bookmarks remain, then run `init` mode.
5. Run `install-task` mode to keep cleaning unapproved bookmarks automatically.

## Safety rules

- `clean` will not run unless `allowlist.json` exists.
- `clean` refuses to modify bookmarks while the Whale process is running. Close Whale completely first.
- The script backs up files before each mode.
- The script stores removal candidates in `removed_candidates.json` before/while cleaning.
- The script stops if a profile cleanup would remove all bookmarks.
- Bookmark files are parsed as JSON and saved atomically through a temporary file replacement.
- The scheduled task is registered for the current user and does not require administrator privileges in normal cases.

## Usage

Open PowerShell and run commands from this repository directory.

### 1. Report mode

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\WhaleBookmarkGuard.ps1 report
```

Prints:

- Whale profile list.
- Bookmark count for each profile.
- Recently added bookmarks.
- Installed extensions from the `Extensions` folder and `Preferences` file.
- Extensions with the `bookmarks` permission marked with `*` as suspicious.

### 2. Init mode

Run this only after manually removing unwanted bookmarks.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\WhaleBookmarkGuard.ps1 init
```

Creates:

```text
%USERPROFILE%\Documents\WhaleBookmarkGuard\allowlist.json
```

The allowlist stores bookmarks by URL, title, and folder path.

### 3. Clean mode

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\WhaleBookmarkGuard.ps1 clean
```

Removes bookmarks that are not in `allowlist.json`. If Whale is still running, the script stops and asks you to close Whale first.

### 4. Install scheduled task mode

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\WhaleBookmarkGuard.ps1 install-task
```

Registers or updates a Windows Task Scheduler task named `WhaleBookmarkGuard`.

The task runs:

- when the current user logs in;
- every 30 minutes afterward.

The scheduled task copies the script to:

```text
%USERPROFILE%\Documents\WhaleBookmarkGuard\WhaleBookmarkGuard.ps1
```

## Optional custom Whale path

If your Whale data is stored somewhere else:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\WhaleBookmarkGuard.ps1 report -UserDataPath "D:\Whale\User Data"
```

## Restore from backup

1. Close Whale completely.
2. Go to `%USERPROFILE%\Documents\WhaleBookmarkGuard\backup`.
3. Find the newest backup file for the affected profile, for example `20260614-120000-Default-Bookmarks`.
4. Copy it back to the matching Whale profile folder and rename it to `Bookmarks`.
5. Start Whale and verify your bookmarks.

## Notes about suspicious extensions

An extension with the `bookmarks` permission is not always malicious. Password managers, bookmark managers, and productivity tools may legitimately request it. Treat it as a review signal and remove any extension you do not recognize or no longer use.
