"""English names that were officially respelled in 2018. People still type the old ones."""

# old spelling -> current spelling
OLD_SPELLINGS = {
    "Barisal": "Barishal",
    "Bogra": "Bogura",
    "Chittagong": "Chattogram",
    "Comilla": "Cumilla",
    "Jessore": "Jashore",
}


def old_spellings_of(names: list[str]) -> str:
    """The older ways of writing any of ``names``, as one searchable string."""
    found: list[str] = []
    for name in names:
        older = name
        for old, current in OLD_SPELLINGS.items():
            older = older.replace(current, old)
        if older != name and older not in found:
            found.append(older)
    return " ".join(found)


def current_spelling(name: str) -> str:
    """``name`` in today's spelling; unchanged unless it is a known old one."""
    by_lowercase = {old.lower(): current for old, current in OLD_SPELLINGS.items()}
    return by_lowercase.get(name.lower(), name)
