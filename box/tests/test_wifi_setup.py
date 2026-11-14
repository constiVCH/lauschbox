"""WLAN-Einrichtung per Bluetooth (Improv): Pakete und Freigabe, ohne echtes Bluetooth."""
import asyncio

import pytest

from lauschbox import wifi_setup as w


def test_paket_hin_und_zurueck():
    packet = w.rpc_packet(w.WIFI_SETTINGS, ["Heimnetz", "geheim äöü"])
    assert w.parse_rpc(packet) == (w.WIFI_SETTINGS, ["Heimnetz", "geheim äöü"])
    with pytest.raises(ValueError):
        w.parse_rpc(packet[:-1] + bytes([packet[-1] ^ 1]))  # falsche Prüfsumme
    with pytest.raises(ValueError):
        w.parse_rpc(bytes([1, 5, 9, 0]))  # Länge passt nicht


def test_erst_nach_freigabe_verbinden():
    async def go():
        tried = []

        async def connect(ssid, password):
            tried.append((ssid, password))
            return True

        setup = w.WifiSetup(8080, connect=connect, ip=lambda: "192.168.1.7")
        packet = w.rpc_packet(w.WIFI_SETTINGS, ["Heimnetz", "geheim"])
        await setup.handle_rpc(packet)
        assert setup.error == w.NOT_AUTHORIZED and not tried  # ohne Play an der Box passiert nichts
        setup.authorize()
        await setup.handle_rpc(packet)
        assert tried == [("Heimnetz", "geheim")] and setup.state == w.PROVISIONED
        assert w.parse_rpc(setup.result) == (w.WIFI_SETTINGS, ["http://192.168.1.7:8080"])

    asyncio.run(go())


def test_falsches_passwort_bleibt_freigegeben():
    async def go():
        async def connect(ssid, password):
            return False

        setup = w.WifiSetup(8080, connect=connect, ip=lambda: None)
        setup.authorize()
        await setup.handle_rpc(w.rpc_packet(w.WIFI_SETTINGS, ["Heimnetz", "falsch"]))
        assert setup.state == w.AUTHORIZED and setup.error == w.UNABLE_TO_CONNECT  # nochmal versuchen geht

    asyncio.run(go())
