"""Spike: Wiedergabe direkt über die lokale API von go-librespot starten (ohne Spotify Web API).

So wird es später der box-daemon machen: Token aufgelegt -> POST /player/play an localhost:3678.
"""
import argparse
import json
import time

import requests

try:
    import websocket  # optional: pip install websocket-client
except ImportError:
    websocket = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("uri", help="z. B. spotify:album:...")
    parser.add_argument("--host", default="http://localhost:3678")
    parser.add_argument("--position", type=int, default=0, help="Startposition im ersten Titel in ms")
    parser.add_argument("--skip-to", help="Titel-URI innerhalb des Albums/der Playlist, bei dem gestartet wird")
    parser.add_argument("--volume", type=int, default=40)
    args = parser.parse_args()

    status = requests.get(f"{args.host}/status", timeout=5)
    status.raise_for_status()
    print("status:", json.dumps(status.json(), indent=2, ensure_ascii=False))

    body = {"uri": args.uri, "position": args.position}
    if args.skip_to:
        body["skip_to_uri"] = args.skip_to
    resp = requests.post(f"{args.host}/player/play", json=body, timeout=10)
    print("play:", resp.status_code, resp.text)
    requests.post(f"{args.host}/player/volume", json={"volume": args.volume}, timeout=5)

    if websocket is None:
        print("Für die Event-Ausgabe: pip install websocket-client")
        return
    ws = websocket.create_connection(args.host.replace("http", "ws", 1) + "/events", timeout=1)
    end = time.time() + 10
    while time.time() < end:
        try:
            print("event:", ws.recv())
        except websocket.WebSocketTimeoutException:
            pass
    ws.close()


if __name__ == "__main__":
    main()
