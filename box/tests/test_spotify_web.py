from lauschbox.spotify_web import _item, fake_search, library_from_librespot


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


def test_bibliothek_aus_go_librespot():
    playlists = {"items": [
        {"uri": "spotify:playlist:a", "name": "Schlaflieder", "owner_username": "mama", "length": 12, "image_url": None, "can_edit": True},
        {"uri": "spotify:playlist:b", "name": "Kinderhits", "owner_username": "spotify", "length": 50, "image_url": "bild", "can_edit": False},
    ]}
    albums = {"items": [{"uri": "spotify:album:c", "name": "Folge 1", "artist_names": ["Drache Funkel"], "year": 2024, "image_url": "cover"}]}
    items = library_from_librespot(playlists, albums)
    assert [i["subtitle"] for i in items] == ["eigene", "von Spotify", "Drache Funkel"]
    assert items[0]["track_count"] == 12 and items[2]["cover_url"] == "cover" and items[2]["kind_label"] == "Album"
