# Bangladesh area list

`bd_locations.json` (division → district → upazila/thana, English and Bangla names) is derived from
[nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode), MIT License,
Copyright (c) 2014 Nuhil Mehdy. Only the names were kept (no coordinates or URLs).

Load or refresh it with `python manage.py seed_locations` (safe to run repeatedly).

Each row has a `code` (`BD-0001`…) assigned by this project. **Never change or reuse a code**: re-seeding
matches areas by it, so a respelled name updates the same row. A new area gets the next free number.
Older English spellings that should stay searchable are listed in `../spellings.py`.
