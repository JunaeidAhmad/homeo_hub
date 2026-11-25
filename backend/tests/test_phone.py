import pytest

from common.phone import InvalidPhone, normalize_phone


@pytest.mark.parametrize(
    "typed",
    [
        "01712345678",
        "1712345678",  # after the +880 prefix shown by the form
        "+8801712345678",
        "8801712345678",
        "+880 1712-345678",
        "(017) 1234 5678",
        "০১৭১২৩৪৫৬৭৮",  # Bangla digits
    ],
)
def test_every_common_way_of_typing_a_number_becomes_one_form(typed):
    assert normalize_phone(typed) == "+8801712345678"


@pytest.mark.parametrize(
    "typed",
    [
        "",
        "hello",
        "0171234567",  # too short
        "017123456789",  # too long
        "01212345678",  # not a mobile operator prefix
        "+919812345678",  # not Bangladesh
        "01712a45678",
    ],
)
def test_anything_that_is_not_a_bangladeshi_mobile_number_is_refused(typed):
    with pytest.raises(InvalidPhone):
        normalize_phone(typed)
