from lauschbox.spotify_links import parse

ID = "4aawyAB9vmqN3uQ7FjRGTy"


def test_links_aus_der_spotify_app():
    assert parse(f"https://open.spotify.com/album/{ID}?si=abc123") == ("album", ID)
    assert parse(f"https://open.spotify.com/intl-de/playlist/{ID}") == ("playlist", ID)
    assert parse(f"spotify:show:{ID}") == ("show", ID)
    # Geteilter Text mit Link mittendrin
    assert parse(f"Hör dir das an: https://open.spotify.com/audiobook/{ID}?si=x") == ("audiobook", ID)


def test_keine_spotify_links():
    assert parse("https://example.com/album/" + ID) is None
    assert parse("Drache Funkel") is None
    assert parse("spotify:album:zu-kurz") is None
