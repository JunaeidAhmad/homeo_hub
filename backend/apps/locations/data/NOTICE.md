# Bangladesh area list

`bd_locations.json` (division → district → upazila/thana, English and Bangla names) is derived from
[nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode), MIT License,
Copyright (c) 2014 Nuhil Mehdy. Only the names were kept (no coordinates or URLs).

That list has upazilas only, so the thanas of the eight metropolitan police areas were added after it
(`BD-0496` onwards, `"kind": "CITY_THANA"`): Dhaka 50, Chattogram 15, Khulna 8, Rajshahi 11, Sylhet 5,
Barishal 4, Rangpur 6 and Gazipur 8. Names come from the English and Bangla Wikipedia pages of each
metropolitan police unit (read November 2026). Thanas that were already listed as upazilas (Karnaphuli,
Paba, South Surma) are not repeated. Rows without `kind` are upazilas.

Load or refresh it with `python manage.py seed_locations` (safe to run repeatedly).

Each row has a `code` (`BD-0001`…) assigned by this project. **Never change or reuse a code**: re-seeding
matches areas by it, so a respelled name updates the same row. A new area gets the next free number.
Older English spellings that should stay searchable are listed in `../spellings.py`.
