"""PN532: gibt die UID beim Auflegen und „entfernt“ beim Abnehmen aus.

Standard ist UART (DIP-Schalter beide OFF, TXD→Pin 10, RXD→Pin 8). Mit --i2c über I2C (Schalter 1 ON, SDA→Pin 3, SCL→Pin 5).
"""
import sys
import time

if "--i2c" in sys.argv:
    import board
    import busio
    from adafruit_pn532.i2c import PN532_I2C

    pn532 = PN532_I2C(busio.I2C(board.SCL, board.SDA), debug=False)
else:
    import serial
    from adafruit_pn532.uart import PN532_UART

    pn532 = PN532_UART(serial.Serial("/dev/serial0", 115200, timeout=0.1), debug=False)

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
