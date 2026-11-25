"""GET /api/v1/locations/ — the list convention every later list follows."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.locations.models import Location

URL = "/api/v1/locations/"

# Bangla য় can be typed two ways; both must find the same area.
YA_ONE_CODE_POINT = chr(0x09DF)
YA_WITH_NUKTA = chr(0x09AF) + chr(0x09BC)


@pytest.fixture
def client(db) -> APIClient:
    call_command("seed_locations")
    return APIClient()


def fetch(client: APIClient, language: str = "en", **params):
    response = client.get(URL, params, headers={"Accept-Language": language})
    assert response.status_code == 200, response.content
    return response.json()


def upazilas(data) -> list[str]:
    return [row["upazila"] for row in data["results"]]


# --- the list itself ---------------------------------------------------------


def test_anyone_can_list_areas_without_signing_in(client):
    data = fetch(client)

    assert data["count"] == 495
    assert set(data["results"][0]) == {"id", "division", "district", "upazila", "display_name"}


def test_names_come_back_in_the_requested_language(client):
    english = fetch(client, q="Kapasia", division="Dhaka")["results"][0]
    bangla = fetch(client, language="bn", q="Kapasia", division="Dhaka")["results"][0]

    assert english["display_name"] == "Kapasia, Gazipur, Dhaka"
    assert bangla["upazila"] == f"কাপাসি{YA_WITH_NUKTA}া"
    assert (
        bangla["display_name"] == f"{bangla['upazila']}, {bangla['district']}, {bangla['division']}"
    )


def test_english_is_used_where_the_bangla_name_is_empty(client):
    Location.objects.filter(upazila_en="Kapasia").update(upazila_bn="")

    row = fetch(client, language="bn", q="Kapasia", division="Dhaka")["results"][0]

    assert row["upazila"] == "Kapasia"


# --- keyword search: ranking, typos, Bangla ------------------------------------


def test_the_best_match_comes_first(client):
    assert upazilas(fetch(client, q="Savar"))[0] == "Savar"


def test_an_exact_district_ranks_all_its_areas_above_loose_matches(client):
    rows = fetch(client, q="Gazipur", page_size=100)["results"]
    first_other = next(i for i, row in enumerate(rows) if row["district"] != "Gazipur")

    gazipur_rows = [i for i, row in enumerate(rows) if row["district"] == "Gazipur"]
    assert len(gazipur_rows) == 5
    assert max(gazipur_rows) < first_other


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("Debidwr", "Debidwar"),  # a dropped letter
        ("Kapasya", "Kapasia"),  # a swapped letter
        ("debid", "Debidwar"),  # half a word, lower case
    ],
)
def test_english_typos_and_partial_words_still_find_the_area(client, typed, expected):
    assert expected in upazilas(fetch(client, q=typed))[:3]


def test_bangla_names_can_be_searched(client):
    top = fetch(client, language="bn", q="কুমিল্লা")["results"][0]

    assert top["district"] == "কুমিল্লা"


def test_a_bangla_typo_still_finds_the_area(client):
    # ী where the stored name has ি
    found = upazilas(fetch(client, language="bn", q="দেবীদ্বার"))[:3]

    assert "দেবিদ্বার" in found


@pytest.mark.parametrize("ya", [YA_ONE_CODE_POINT, YA_WITH_NUKTA])
def test_both_ways_a_keyboard_types_the_same_bangla_letter_match(client, ya):
    kapasia = f"কাপাসি{ya}া"

    found = fetch(client, language="bn", q=kapasia, division="ঢাকা")["results"]

    assert found[0]["district"] == "গাজীপুর"
    assert found[0]["display_name"].startswith(f"কাপাসি{YA_WITH_NUKTA}া")


def test_text_that_matches_nothing_returns_an_empty_page(client):
    data = fetch(client, q="zzzzzzzz")

    assert data["count"] == 0
    assert data["results"] == []


def test_a_blank_query_is_the_same_as_no_query(client):
    assert fetch(client, q="   ")["count"] == 495


# --- pagination ----------------------------------------------------------------


def test_results_are_paginated_twenty_at_a_time_by_default(client):
    data = fetch(client)

    assert len(data["results"]) == 20
    assert data["count"] == 495
    assert data["next"] is not None
    assert data["previous"] is None


def test_page_and_page_size_choose_the_slice(client):
    first = fetch(client, page_size=10, page=1)
    second = fetch(client, page_size=10, page=2)
    last = fetch(client, page_size=10, page=50)

    assert len(first["results"]) == len(second["results"]) == 10
    assert set(upazilas(first)).isdisjoint(upazilas(second))
    assert len(last["results"]) == 5  # 495 = 49 pages of 10 + 5
    assert last["next"] is None
    assert second["previous"] is not None


def test_a_page_cannot_be_bigger_than_one_hundred(client):
    assert len(fetch(client, page_size=1000)["results"]) == 100


def test_a_page_past_the_end_is_not_found(client):
    assert client.get(URL, {"page": 999}).status_code == 404


# --- ordering and filters ------------------------------------------------------


def test_ordering_sorts_the_whole_list(client):
    ascending = fetch(client, ordering="upazila_en", page_size=100)["results"]
    descending = fetch(client, ordering="-upazila_en", page_size=1)["results"]

    names = sorted(Location.objects.values_list("upazila_en", flat=True))
    assert descending[0]["upazila"] == names[-1]
    assert ascending[0]["upazila"] == names[0]


def test_an_explicit_ordering_beats_search_ranking(client):
    ranked = upazilas(fetch(client, q="Gazipur", page_size=100))
    by_name = upazilas(fetch(client, q="Gazipur", ordering="upazila_en", page_size=100))

    assert by_name == sorted(by_name)
    assert by_name != ranked


def test_areas_can_be_filtered_by_division_and_district(client):
    data = fetch(client, division="Dhaka", district="Gazipur")

    assert data["count"] == 5
    assert {row["district"] for row in data["results"]} == {"Gazipur"}


def test_filters_accept_bangla_names_and_ignore_case(client):
    assert fetch(client, division="ঢাকা", district="গাজীপুর")["count"] == 5
    assert fetch(client, division="dhaka", district="GAZIPUR")["count"] == 5


def test_filters_and_search_combine(client):
    data = fetch(client, division="Sylhet", q="Sadar")

    assert data["count"] > 0
    assert {row["division"] for row in data["results"]} == {"Sylhet"}


@pytest.mark.parametrize("ya", [YA_ONE_CODE_POINT, YA_WITH_NUKTA])
def test_exact_bangla_filters_match_however_the_keyboard_typed_the_letter(client, ya):
    assert fetch(client, division=f"ম{ya}মনসিংহ")["count"] > 0


@pytest.mark.parametrize(("query", "language"), [("Sylhet", "en"), ("সিলেট", "bn")])
def test_searching_a_division_name_finds_that_division_and_nothing_loosely_similar(
    client, query, language
):
    data = fetch(client, language=language, q=query, page_size=100)

    assert data["count"] == 41  # every area in Sylhet division, no look-alikes
    assert {row["division"] for row in data["results"]} == {
        "Sylhet" if language == "en" else "সিলেট"
    }


# --- multi-word queries: every word must match somewhere ----------------------


def test_nonsense_made_of_several_words_matches_nothing(client):
    assert fetch(client, q="zzzz qqqq")["count"] == 0


def test_words_may_match_different_parts_of_an_area(client):
    data = fetch(client, q="Kapasia Gazipur", page_size=100)

    assert data["results"][0]["display_name"] == "Kapasia, Gazipur, Dhaka"
    assert data["count"] < 30  # not the whole list


def test_every_word_has_to_match(client):
    # "Sylhet" alone matches 41 areas; adding "Sadar" narrows it, never widens it.
    only_sylhet = fetch(client, q="Sylhet", page_size=100)["count"]
    sylhet_sadar = fetch(client, q="Sylhet Sadar", page_size=100)

    assert 0 < sylhet_sadar["count"] < only_sylhet
    assert sylhet_sadar["results"][0]["upazila"] == "Sylhet Sadar"


def test_bangla_queries_of_several_words_work_too(client):
    data = fetch(client, language="bn", q="সিলেট সদর", page_size=100)

    assert data["results"][0]["upazila"] == "সিলেট সদর"
    assert data["count"] < 60


def test_a_very_long_query_is_handled_without_error(client):
    assert client.get(URL, {"q": "sadar " * 400}).status_code == 200


def test_a_query_containing_a_nul_byte_is_not_a_server_error(client):
    # PostgreSQL text cannot hold NUL; it must be dropped, not crash the request.
    assert client.get(URL, {"q": "sa\x00var"}).status_code == 200
