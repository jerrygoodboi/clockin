#!/usr/bin/env python3
"""
Keka Automated Clock-In & Clock-Out Tool for the GOAT Jerry
"""

import sys
import os
import json
import time
import random
import subprocess
import argparse
from datetime import datetime, timezone
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
LOG_PATH = os.path.join(BASE_DIR, "keka.log")


def log(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] {message}"
    print(formatted)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception as e:
        print(f"Failed to write to log file: {e}")


def notify(title, message, urgency="normal"):
    """Send desktop notification on Linux if notify-send is available"""
    try:
        subprocess.run(
            ["notify-send", "-u", urgency, title, message],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG_PATH):
        log(f"Config file not found at {CONFIG_PATH}. Please copy config.example.json to config.json and fill in your details.", "ERROR")
        sys.exit(1)

    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception as e:
        log(f"Error parsing {CONFIG_PATH}: {e}", "ERROR")
        sys.exit(1)

    # Basic validations
    if not cfg.get("subdomain") or cfg.get("subdomain") == "YOUR_COMPANY_SUBDOMAIN":
        log("Please configure your 'subdomain' in config.json (e.g., 'acme' for acme.keka.com)", "ERROR")
        sys.exit(1)

    token = cfg.get("bearer_token", "").strip()
    if not token or token == "PASTE_YOUR_BEARER_TOKEN_HERE":
        log("Please configure your 'bearer_token' in config.json.", "ERROR")
        sys.exit(1)

    return cfg


def get_headers(cfg):
    token = cfg.get("bearer_token", "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": f"https://{cfg['subdomain']}.keka.com",
        "Referer": f"https://{cfg['subdomain']}.keka.com/",
    }

    # Optional custom cookies
    cookies = cfg.get("cookies")
    if cookies:
        headers["Cookie"] = cookies

    return headers


def get_clock_payload(cfg, note=""):
    # UTC timestamp in format: 2026-09-02T13:45:00.000Z
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    
    loc = cfg.get("location", {})
    return {
        "timestamp": now_utc,
        "locationAddress": loc.get("address", ""),
        "latitude": loc.get("latitude", None),
        "longitude": loc.get("longitude", None),
        "note": note or cfg.get("default_note", "")
    }


def perform_punch(action, no_jitter=False):
    cfg = load_config()
    subdomain = cfg["subdomain"].strip()
    
    # Random jitter delay to mimic realistic human timing
    jitter_minutes = cfg.get("random_jitter_minutes", 0)
    if not no_jitter and jitter_minutes > 0:
        delay_seconds = random.randint(0, int(jitter_minutes * 60))
        log(f"Applying human jitter delay: waiting {delay_seconds} seconds before {action}...")
        time.sleep(delay_seconds)

    action_name = "Clock-In" if action == "in" else "Clock-Out"
    log(f"Initiating Keka {action_name} for {subdomain}.keka.com...")

    headers = get_headers(cfg)
    payload = get_clock_payload(cfg)

    # Primary and fallback endpoints
    endpoint_suffix = "webclockin" if action == "in" else "webclockout"
    urls = [
        f"https://{subdomain}.keka.com/k/attendance/api/mytime/attendance/{endpoint_suffix}",
        f"https://{subdomain}.keka.com/api/v1/attendance/{endpoint_suffix}"
    ]

    last_error = None
    for url in urls:
        try:
            log(f"Sending POST request to: {url}")
            resp = requests.post(url, headers=headers, json=payload, timeout=20)
            
            if resp.status_code in [200, 201]:
                data = {}
                try:
                    data = resp.json()
                except Exception:
                    data = {"raw": resp.text}

                log(f"SUCCESS: Keka {action_name} recorded! Status: {resp.status_code}, Response: {json.dumps(data)}")
                if cfg.get("notify_desktop", True):
                    notify(f"Keka {action_name} Successful", f"Logged at {datetime.now().strftime('%H:%M:%S')}")
                return True

            elif resp.status_code == 401:
                log("Authentication Failed (401 Unauthorized): Your bearer_token may have expired. Please update it in config.json.", "ERROR")
                if cfg.get("notify_desktop", True):
                    notify("Keka Auth Failed", "Bearer token expired! Update config.json", urgency="critical")
                return False

            elif resp.status_code == 400:
                log(f"Bad Request (400) from {url}: {resp.text}. You may already be clocked in/out.", "WARNING")
                return False

            else:
                log(f"Unexpected response code {resp.status_code} from {url}: {resp.text}", "WARNING")
                last_error = f"HTTP {resp.status_code}: {resp.text}"

        except Exception as e:
            log(f"Network error trying {url}: {e}", "WARNING")
            last_error = str(e)

    log(f"FAILED: Could not complete {action_name}. Details: {last_error}", "ERROR")
    if cfg.get("notify_desktop", True):
        notify(f"Keka {action_name} Failed", str(last_error), urgency="critical")
    return False


def check_status():
    cfg = load_config()
    subdomain = cfg["subdomain"].strip()
    headers = get_headers(cfg)

    log(f"Checking current attendance status for {subdomain}.keka.com...")
    urls = [
        f"https://{subdomain}.keka.com/k/attendance/api/mytime/attendance/summary",
        f"https://{subdomain}.keka.com/k/attendance/api/mytime/attendance/today",
        f"https://{subdomain}.keka.com/api/v1/attendance/summary"
    ]

    for url in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code == 200:
                log(f"Status check successful (from {url}):")
                try:
                    data = resp.json()
                    print(json.dumps(data, indent=2))
                except Exception:
                    print(resp.text)
                return
            elif resp.status_code == 401:
                log("Authentication failed: bearer_token is expired or invalid.", "ERROR")
                return
        except Exception as e:
            continue

    log("Could not retrieve attendance summary. Verify your token or endpoints.", "WARNING")


def test_connection():
    cfg = load_config()
    subdomain = cfg["subdomain"].strip()
    headers = get_headers(cfg)

    log(f"Testing connectivity and token validity for {subdomain}.keka.com...")
    test_url = f"https://{subdomain}.keka.com/k/attendance/api/mytime/attendance/summary"
    try:
        resp = requests.get(test_url, headers=headers, timeout=15)
        if resp.status_code == 200:
            log("SUCCESS: Connected to Keka API and token is valid!", "INFO")
            print("Response payload received successfully.")
        elif resp.status_code == 401:
            log("FAILED: 401 Unauthorized. Token has expired or is invalid.", "ERROR")
        else:
            log(f"API responded with status code {resp.status_code}: {resp.text}", "WARNING")
    except Exception as e:
        log(f"Connection test failed: {e}", "ERROR")


def main():
    parser = argparse.ArgumentParser(description="Keka Clock-In & Clock-Out Automation for the GOAT Jerry")
    parser.add_argument("action", choices=["in", "out", "clock-in", "clock-out", "status", "test"],
                        help="Action to perform")
    parser.add_argument("--no-jitter", action="store_true",
                        help="Disable random time jitter delay (execute immediately)")

    args = parser.parse_args()

    action = args.action.lower()
    if action in ["in", "clock-in"]:
        success = perform_punch("in", no_jitter=args.no_jitter)
        sys.exit(0 if success else 1)
    elif action in ["out", "clock-out"]:
        success = perform_punch("out", no_jitter=args.no_jitter)
        sys.exit(0 if success else 1)
    elif action == "status":
        check_status()
    elif action == "test":
        test_connection()


if __name__ == "__main__":
    main()
