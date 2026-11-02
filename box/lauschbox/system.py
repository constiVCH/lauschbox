"""Die Box ohne Terminal verwalten: Dienste neu starten, Spotify-Konto wechseln, Update, Neustart, Ausschalten, Log.

Voraussetzung ist die einmalige Einrichtung mit box/install.sh: go-librespot und die Box-Software laufen dann als
systemd-Dienste, und der Benutzer der Box darf genau diese systemctl-Befehle ohne Passwort ausführen (sudoers).
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import socket
import time
from collections import deque
from pathlib import Path

log = logging.getLogger(__name__)

SYSTEMCTL = "/usr/bin/systemctl"  # genau so steht es in /etc/sudoers.d/lauschbox
UNITS = Path("/etc/systemd/system")
REPO = Path(__file__).resolve().parents[2]
BOX_DIR = REPO / "box"
LIBRESPOT_STATE = Path.home() / ".config/go-librespot/state.json"

NOT_SET_UP = "Die Box ist noch nicht als Dienst eingerichtet. Einmal auf dem Pi ausführen: bash ~/lauschbox/box/install.sh"


class BoxSystemError(Exception):
    pass


def managed() -> bool:
    """Laufen go-librespot und die Box-Software als Dienste (install.sh ausgeführt)?"""
    return (UNITS / "lauschbox.service").exists() and (UNITS / "go-librespot.service").exists()


async def _run(*cmd: str, timeout: float = 120) -> tuple[int, str]:
    try:
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    except FileNotFoundError as e:
        raise BoxSystemError(f"{cmd[0]} nicht gefunden") from e
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError as e:
        proc.kill()
        raise BoxSystemError(f"{' '.join(cmd[:3])} hat zu lange gebraucht") from e
    return proc.returncode or 0, out.decode(errors="replace").strip()


async def _systemctl(*args: str) -> None:
    if not managed():
        raise BoxSystemError(NOT_SET_UP)
    # -n: niemals nach einem Passwort fragen (es gibt kein Terminal); fehlt die sudoers-Regel, kommt sofort ein Fehler
    rc, out = await _run("sudo", "-n", SYSTEMCTL, *args, timeout=60)
    if rc != 0:
        raise BoxSystemError(out or f"systemctl {' '.join(args)} fehlgeschlagen ({rc})")


async def restart_spotify() -> None:
    await _systemctl("restart", "go-librespot")


async def restart_box(delay: float = 0.8) -> None:
    """Startet die Box-Software neu. Kurz warten, damit die Antwort an die App noch rausgeht."""
    if not managed():
        raise BoxSystemError(NOT_SET_UP)

    async def later() -> None:
        await asyncio.sleep(delay)
        await _systemctl("restart", "lauschbox")

    asyncio.ensure_future(later())


async def power(action: str) -> None:
    if action not in ("reboot", "poweroff"):
        raise BoxSystemError("unbekannte Aktion")
    if not managed():
        raise BoxSystemError(NOT_SET_UP)

    async def later() -> None:
        await asyncio.sleep(0.8)
        await _systemctl(action)

    asyncio.ensure_future(later())


async def spotify_logout() -> str | None:
    """Spotify-Anmeldung zur Seite legen und go-librespot neu starten. Danach wartet es auf einen neuen Code."""
    await _systemctl("stop", "go-librespot")
    backup = None
    try:
        if LIBRESPOT_STATE.exists():
            backup = LIBRESPOT_STATE.with_name(f"state.{time.strftime('%Y%m%d-%H%M%S')}.json")
            shutil.move(LIBRESPOT_STATE, backup)
            log.info("Spotify-Anmeldung gesichert als %s", backup)
    finally:
        await _systemctl("start", "go-librespot")
    return backup.name if backup else None


async def update() -> str:
    """Neueste Version holen (git pull) und Python-Pakete aktualisieren. Neustart danach übernimmt der Aufrufer."""
    if not (REPO / ".git").exists():
        raise BoxSystemError(f"{REPO} ist kein git-Repository")
    rc, out = await _run("git", "-C", str(REPO), "pull", "--ff-only", timeout=120)
    if rc != 0:
        raise BoxSystemError(f"git pull fehlgeschlagen:\n{out}")
    pip = BOX_DIR / ".venv/bin/pip"
    if pip.exists():
        rc2, out2 = await _run(str(pip), "install", "-q", "-r", str(BOX_DIR / "requirements.txt"), timeout=900)
        if rc2 != 0:
            raise BoxSystemError(f"Pakete aktualisieren fehlgeschlagen:\n{out2[-1500:]}")
    return out


async def version() -> dict:
    rc, commit = await _run("git", "-C", str(REPO), "log", "-1", "--format=%h %cd %s", "--date=format:%d.%m.%Y %H:%M", timeout=10)
    librespot = None
    if shutil.which("go-librespot"):
        try:
            _, out = await _run("go-librespot", "--version", timeout=5)
            librespot = out.splitlines()[0] if out else None
        except BoxSystemError:
            pass
    return {"commit": commit if rc == 0 else None, "librespot": librespot}


def info() -> dict:
    uptime = None
    try:
        uptime = int(float(Path("/proc/uptime").read_text().split()[0]))
    except OSError:
        pass
    return {"managed": managed(), "host": socket.gethostname(), "uptime_s": uptime}


# ---------- Log ----------

class MemoryLog(logging.Handler):
    """Die letzten Zeilen des eigenen Logs, falls journalctl nicht lesbar ist."""

    def __init__(self, size: int = 400):
        super().__init__()
        self.lines: deque[str] = deque(maxlen=size)
        self.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S"))

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(self.format(record))


async def logs(memory: MemoryLog | None, lines: int = 200) -> str:
    if managed() and shutil.which("journalctl"):
        rc, out = await _run("journalctl", "-u", "lauschbox", "-u", "go-librespot", "-n", str(lines), "--no-pager", "-o", "short", timeout=15)
        if rc == 0 and out and "No journal files" not in out and "insufficient permissions" not in out.lower():
            return out
    return "\n".join(memory.lines) if memory else ""
