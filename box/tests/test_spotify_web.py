from lauschbox.spotify_web import _item, fake_search


def test_treffer_aus_der_web_api():
    album = {"uri": "spotify:album:x", "name": "Folge 1", "artists": [{"name": "Drache Funkel"}], "total_tracks": 7,
             "images": [{"url": "gross"}, {"url": "mittel"}, {"url": "klein"}]}
    item = _item(album, "album")
    assert item["title"] == "Folge 1" and item["subtitle"] == "Drache Funkel"
    assert item["cover_url"] == "mittel" and item["track_count"] == 7 and item["kind_label"] == "Album"
    playlist = {"uri": "spotify:playlist:y", "name": "Schlaflieder", "owner": {"display_name": "Mama"}, "tracks": {"total": 12}, "images": []}
    assert _item(playlist, "playlist")["subtitle"] == "von Mama"
    assert _item(None, "playlist") is None  # Spotify schickt manchmal leere Einträge


def test_simulierte_suche():
    assert [i["title"] for i in fake_search("funkel")] == ["Drache Funkel – Folge 1", "Drache Funkel – Folge 2"]
