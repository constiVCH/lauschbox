"""Spike: Spotify-Wiedergabe auf dem librespot-Gerät der Box per Web API starten.

Ablauf: OAuth (Authorization Code + PKCE) im Browser -> Refresh Token in .spotify_token.json
-> Gerät "Lauschring" suchen -> URI abspielen.
"""
import argparse
import base64
import hashlib
import http.server
import json
import secrets
import time
import urllib.parse
import webbrowser
from pathlib import Path

import requests

REDIRECT_URI = "http://127.0.0.1:8888/callback"
SCOPES = "user-read-playback-state user-modify-playback-state"
TOKEN_FILE = Path(__file__).with_name(".spotify_token.json")
API = "https://api.spotify.com/v1"


def authorize(client_id: str) -> dict:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "scope": SCOPES,
        "state": state,
    })

    result = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            result.update({k: v[0] for k, v in query.items()})
            self.send_response(200)
            self.end_headers()
            self.wfile.write("Login ok – Fenster kann geschlossen werden.".encode())

        def log_message(self, *args):
            pass

    print("Browser öffnet sich für den Spotify-Login …\n" + url)
    webbrowser.open(url)
    with http.server.HTTPServer(("127.0.0.1", 8888), Handler) as server:
        server.handle_request()

    if result.get("state") != state or "code" not in result:
        raise SystemExit(f"Login fehlgeschlagen: {result}")

    resp = requests.post("https://accounts.spotify.com/api/token", data={
        "grant_type": "authorization_code",
        "code": result["code"],
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "code_verifier": verifier,
    })
    resp.raise_for_status()
    return resp.json()


def refresh(client_id: str, refresh_token: str) -> dict:
    resp = requests.post("https://accounts.spotify.com/api/token", data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    })
    resp.raise_for_status()
    token = resp.json()
    token.setdefault("refresh_token", refresh_token)
    return token


def get_access_token(client_id: str) -> str:
    if TOKEN_FILE.exists():
        token = refresh(client_id, json.loads(TOKEN_FILE.read_text())["refresh_token"])
    else:
        token = authorize(client_id)
    TOKEN_FILE.write_text(json.dumps({"refresh_token": token["refresh_token"]}))
    return token["access_token"]


def find_device(headers: dict, name: str) -> str:
    for attempt in range(10):
        devices = requests.get(f"{API}/me/player/devices", headers=headers).json().get("devices", [])
        for d in devices:
            if d["name"].lower() == name.lower():
                return d["id"]
        print(f"Gerät '{name}' nicht gefunden ({[d['name'] for d in devices]}), neuer Versuch …")
        time.sleep(2)
    raise SystemExit("Gerät nicht gefunden – läuft go-librespot und ist angemeldet? (siehe docs/pi-setup.md, Schritt 3)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--uri", required=True, help="z. B. spotify:album:...")
    parser.add_argument("--device", default="Lauschring")
    parser.add_argument("--volume", type=int, default=40)
    args = parser.parse_args()

    headers = {"Authorization": f"Bearer {get_access_token(args.client_id)}"}
    device_id = find_device(headers, args.device)

    body = {"uris": [args.uri]} if args.uri.startswith("spotify:track:") else {"context_uri": args.uri}
    resp = requests.put(f"{API}/me/player/play", params={"device_id": device_id}, headers=headers, json=body)
    print("play:", resp.status_code, resp.text)
    requests.put(f"{API}/me/player/shuffle", params={"state": "false", "device_id": device_id}, headers=headers)
    requests.put(f"{API}/me/player/volume", params={"volume_percent": args.volume, "device_id": device_id}, headers=headers)


if __name__ == "__main__":
    main()
