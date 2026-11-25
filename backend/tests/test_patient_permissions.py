"""The "phone verified" gate that checkout and consultations will use."""

from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from apps.patients.models import Patient
from apps.patients.permissions import IsPatient, IsVerifiedPatient, PhoneNotVerified


def allowed(permission, user) -> bool:
    return permission().has_permission(SimpleNamespace(user=user), None)


VERIFIED = Patient(phone="+8801712345678", phone_verified_at=timezone.now())
UNVERIFIED = Patient(phone="+8801712345678")


@pytest.mark.parametrize(
    ("user", "patient"),
    [
        (VERIFIED, True),
        (UNVERIFIED, True),
        (AnonymousUser(), False),
        (SimpleNamespace(is_authenticated=True), False),  # e.g. a staff user
    ],
)
def test_is_patient_lets_only_patients_through(user, patient):
    assert allowed(IsPatient, user) is patient


def test_a_verified_patient_passes_the_gate():
    assert allowed(IsVerifiedPatient, VERIFIED) is True


def test_an_unverified_patient_is_told_to_verify():
    # A distinct error code, so the app can send them to verification.
    with pytest.raises(PhoneNotVerified) as refused:
        allowed(IsVerifiedPatient, UNVERIFIED)

    assert refused.value.status_code == 403
    assert refused.value.error_code == "PHONE_NOT_VERIFIED"


@pytest.mark.parametrize("user", [AnonymousUser(), SimpleNamespace(is_authenticated=True)])
def test_anyone_else_is_simply_refused(user):
    assert allowed(IsVerifiedPatient, user) is False
