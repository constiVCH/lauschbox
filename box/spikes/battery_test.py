"""Ladestand vom pisugar-server (TCP 8423) lesen."""
import socket
import time


def query(cmd: str) -> str:
    with socket.create_connection(("127.0.0.1", 8423), timeout=2) as s:
        s.sendall(cmd.encode() + b"\n")
        return s.recv(256).decode().strip()


while True:
    print(query("get battery"), "|", query("get battery_charging"), "|", query("get battery_power_plugged"))
    time.sleep(5)
