"""PN532 über I2C: gibt UID beim Auflegen und 'entfernt' beim Abnehmen aus."""
import time

import board
import busio
from adafruit_pn532.i2c import PN532_I2C

pn532 = PN532_I2C(busio.I2C(board.SCL, board.SDA), debug=False)
ic, ver, rev, support = pn532.firmware_version
print(f"PN532 Firmware {ver}.{rev} – Token auflegen …")
pn532.SAM_configuration()

current = None
while True:
    uid = pn532.read_passive_target(timeout=0.3)
    uid_hex = uid.hex() if uid else None
    if uid_hex != current:
        print(f"aufgelegt: {uid_hex}" if uid_hex else f"entfernt: {current}")
        current = uid_hex
    time.sleep(0.1)
