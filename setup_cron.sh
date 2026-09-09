#!/usr/bin/env bash
# Attendance automation scheduler for the GOAT Jerry
# Supports systemd user timers (native on modern Linux) and fallback to crontab

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOCKIN_SCRIPT="$DIR/run_clockin.sh"
CLOCKOUT_SCRIPT="$DIR/run_clockout.sh"

chmod +x "$CLOCKIN_SCRIPT" "$CLOCKOUT_SCRIPT" "$DIR/keka.js"

SYSTEMD_DIR="$HOME/.config/systemd/user"

# Uninstallation
if [ "$1" == "remove" ] || [ "$1" == "uninstall" ]; then
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop keka-clockin.timer keka-clockout.timer 2>/dev/null || true
        systemctl --user disable keka-clockin.timer keka-clockout.timer 2>/dev/null || true
        rm -f "$SYSTEMD_DIR/keka-clockin.service" "$SYSTEMD_DIR/keka-clockin.timer"
        rm -f "$SYSTEMD_DIR/keka-clockout.service" "$SYSTEMD_DIR/keka-clockout.timer"
        systemctl --user daemon-reload 2>/dev/null || true
        echo "Removed Keka systemd timers."
    fi
    if command -v crontab >/dev/null 2>&1; then
        crontab -l 2>/dev/null | grep -v "# KEKA_AUTO_ATTENDANCE" | crontab -
        echo "Removed Keka crontab jobs."
    fi
    echo "✅ Keka attendance schedules removed successfully."
    exit 0
fi

# Check if systemd --user is available (default on modern Linux)
if command -v systemctl >/dev/null 2>&1; then
    echo "Configuring native systemd user timers for the GOAT Jerry..."
    mkdir -p "$SYSTEMD_DIR"

    # 1. Clock-in Service & Timer (09:15 Mon-Fri)
    cat <<EOF > "$SYSTEMD_DIR/keka-clockin.service"
[Unit]
Description=Keka Clock-In for the GOAT Jerry

[Service]
Type=oneshot
WorkingDirectory=$DIR
ExecStart=/bin/bash $CLOCKIN_SCRIPT
EOF

    cat <<EOF > "$SYSTEMD_DIR/keka-clockin.timer"
[Unit]
Description=Keka Clock-In Timer (09:15 AM Mon-Fri)

[Timer]
OnCalendar=Mon..Fri *-*-* 09:15:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # 2. Clock-out Service & Timer (18:40 Mon-Fri)
    cat <<EOF > "$SYSTEMD_DIR/keka-clockout.service"
[Unit]
Description=Keka Clock-Out for the GOAT Jerry

[Service]
Type=oneshot
WorkingDirectory=$DIR
ExecStart=/bin/bash $CLOCKOUT_SCRIPT
EOF

    cat <<EOF > "$SYSTEMD_DIR/keka-clockout.timer"
[Unit]
Description=Keka Clock-Out Timer (18:31 PM Mon-Fri)

[Timer]
OnCalendar=Mon..Fri *-*-* 18:31:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable --now keka-clockin.timer
    systemctl --user enable --now keka-clockout.timer

    echo "=========================================================="
    echo "✅ Keka attendance timers installed and activated!"
    echo "=========================================================="
    echo "Upcoming scheduled triggers:"
    systemctl --user list-timers | grep -E "keka-clockin|keka-clockout|NEXT" || systemctl --user list-timers
    echo "=========================================================="
    echo "To remove anytime, run: ./setup_cron.sh remove"
    exit 0
fi

# Fallback to crontab if systemctl is not present
if command -v crontab >/dev/null 2>&1; then
    TAG="# KEKA_AUTO_ATTENDANCE"
    CURRENT_CRON=$(crontab -l 2>/dev/null | grep -v "$TAG")
    NEW_CRON=$(cat <<EOF
$CURRENT_CRON
15 9 * * 1-5 /bin/bash $CLOCKIN_SCRIPT $TAG (Clock-in at 09:15 AM Mon-Fri)
31 18 * * 1-5 /bin/bash $CLOCKOUT_SCRIPT $TAG (Clock-out at 18:31 PM Mon-Fri)
EOF
    )
    echo "$NEW_CRON" | crontab -
    echo "✅ Keka attendance crontab installed successfully!"
    crontab -l | grep "$TAG"
    exit 0
fi

echo "❌ Neither systemctl nor crontab is available."
exit 1
