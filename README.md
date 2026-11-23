# Izzy Bisceglia · Performance & Wellness

Static site (GitHub Pages). Two daily GitHub Actions keep it fresh:

- `update-schedule.yml` pulls Izzy's classes from the public Best Fitness Albany schedule into `izzy-schedule.json`.
- `update-gallery.yml` keeps `gallery/` and `gallery.json` in step with the shared iCloud album: new photos are added, photos deleted from the album are removed. It needs a repo secret `ICLOUD_ALBUM_TOKEN` (the text after `#` in the shared album link).

To hide a photo, move its `guid` from `photos` into the `exclude` list in `gallery.json` and delete its file.
