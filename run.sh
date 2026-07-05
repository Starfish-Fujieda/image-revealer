#!/bin/sh
# Start the Slow Reveal server (default port 8000; pass another as $1)
cd "$(dirname "$0")"
exec python3 server.py "${1:-8000}"
