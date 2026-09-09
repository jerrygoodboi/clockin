# ⏰ Keka Attendance Automation (`clockin`)

> Fully automated, persistent, and unattended Keka HR attendance bot powered by Playwright and headless Chromium/Chrome.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Core-blue.svg)](https://playwright.dev/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#)

---

## ✨ Features

- 🔐 **Log In Once**: Saves your authenticated browser session locally (`.keka_profile/`). No fragile API bearer tokens that expire after 24 hours.
- ⚡ **Native System Scheduling**: Supports Linux `systemd --user` timers (with fallback to standard `cron`) to clock in and out automatically even after system reboots.
- 🎲 **Anti-Detection Human Jitter**: Configurable random delay (0–2 min) so clock-in/out timestamps never look robotic.
- 👥 **Live Team Attendance Viewer**: See who in your team is **Clocked In** (🟢 IN), **Clocked Out** (🔴 OUT), **Working Remotely** (🏠 REMOTE), or **On Leave** (🏖️ LEAVE).
- 🏖️ **Flexible Skip & Pause**: Skip single days (sick/vacation) or pause automation entirely with a single command.
- 📸 **Visual Proof**: Automatically captures timestamped screenshots of every punch action in `screenshots/`.
- 🔔 **Desktop Notifications**: Native desktop alert popups on punch completion or errors.

---

## 🚀 Quick Start (2 Minutes Setup)

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Google Chrome / Chromium / Brave / Thorium** installed on your system

### 2. Clone and Install Dependencies
```bash
git clone git@github.com:jerrygoodboi/clockin.git
cd clockin
npm install
```

### 3. Create Your Configuration
Copy the example config:
```bash
cp config.example.json config.json
```
Edit `config.json` and set your company subdomain:
```json
{
  "subdomain": "yourcompany",
  "chrome_path": "",
  "random_jitter_minutes": 2,
  "notify_desktop": true,
  "skip_dates": []
}
```
*(If your Keka URL is `https://acme.keka.com`, set `"subdomain": "acme"`)*

---

### 4. One-Time Login (Takes 30 Seconds)
Run the login command:
```bash
npm run login
```
1. This opens your browser to your Keka login portal.
2. Sign in using your standard credentials, SSO, or 2FA (and check *"Stay signed in"*).
3. Once your Keka dashboard loads, return to the terminal and press **ENTER**.

Your authenticated profile is saved in `.keka_profile/` and will run unattended!

---

### 5. Install Automated Schedule
To automatically clock in at **09:15 AM** and clock out at **18:31 PM (06:31 PM)** Monday through Friday:
```bash
./setup_cron.sh
```

---

## 🛠 Command Reference

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run in` | **Clock In** | Triggers instant Clock-In with configured jitter |
| `npm run out` | **Clock Out** | Triggers instant Clock-Out with configured jitter |
| `npm run status` | **Personal Status** | Checks your current personal punch status (In/Out) |
| `npm run team` | **Team Status** | Displays live attendance table of your entire team |
| `npm run skip` | **Skip Today** | Skips automated clock-in/out for today only |
| `npm run unskip` | **Cancel Skip** | Re-enables automated clock-in/out for today |
| `npm run pause` | **Pause Timers** | Pauses all automated system timers (e.g. for long vacations) |
| `npm run resume` | **Resume Timers** | Resumes automated system timers |
| `./setup_cron.sh remove` | **Uninstall** | Uninstalls all systemd timers and cron jobs |

---

## 👥 Live Team Attendance Output

Run:
```bash
npm run team
```

Sample output:
```text
======================================================================
  👥 TEAM ATTENDANCE STATUS (4LABS)
  📅 Date: 2026-09-04 18:46:34
======================================================================

📊 SUMMARY METRICS:
   🟢 On Time:          4
   ⏰ Late:             1
   🏠 Working Remotely: 0
   🏖️ On Leave:         0

📋 TEAM MEMBERS:
----------------------------------------------------------------------
  STATUS       | NAME                         | ROLE               | EMP ID
----------------------------------------------------------------------
  🟢 IN        |    Akshay Krishna Krishnadas | Software Intern    | #425
  🔴 OUT       | ⭐ Jerry Ron Sunny            | Software Intern    | #427
  🟢 IN        |    Maya K C                  | Software Intern    | #420
  🔴 OUT       |    Nandana Kariat            | Software Intern    | #428
  🔴 OUT       |    Rithu Smera Karanipadath  | Software Intern    | #426
----------------------------------------------------------------------

📸 Team snapshot saved: screenshots/team_status_2026-09-04_18-46-34.png
```

---

## ⚙️ Advanced Configuration (`config.json`)

```json
{
  "subdomain": "yourcompany",
  "chrome_path": "/usr/bin/google-chrome",
  "random_jitter_minutes": 2,
  "notify_desktop": true,
  "skip_dates": [
    "2026-09-15",
    "2026-09-16"
  ]
}
```

- **`subdomain`**: Your Keka organization subdomain (`https://<subdomain>.keka.com`).
- **`chrome_path`** *(optional)*: Explicit path to your browser binary (auto-detected by default).
- **`random_jitter_minutes`**: Adds a random human delay between 0 and N minutes before punching.
- **`notify_desktop`**: Set to `false` to disable desktop popups.
- **`skip_dates`**: List of specific dates (`YYYY-MM-DD`) when automation should skip.

---

## 🛡️ Privacy & Security

- **Zero Credentials Stored in Plaintext**: Passwords and 2FA secrets are never saved in code or config files.
- **Ignored Artifacts**: `.keka_profile/`, `config.json`, `keka.log`, and `screenshots/` are strictly ignored by `.gitignore` to prevent leaking sensitive session data or company information.

---

## 📄 License
MIT License. Created with ❤️ for seamless workforce productivity.
