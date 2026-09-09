#!/usr/bin/env bash
# Keka Auto Clock-Out Wrapper (18:31 PM Mon-Fri)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DISPLAY="${DISPLAY:-:0}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"

# Ensure node is in PATH (checks NVM, local bin, standard usr bin)
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM_NODE=$(ls -d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_NVM_NODE" ] && [ -d "$LATEST_NVM_NODE/bin" ]; then
        export PATH="$LATEST_NVM_NODE/bin:$PATH"
    fi
fi
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$DIR" || exit 1
node "$DIR/keka.js" out >> "$DIR/keka.log" 2>&1
