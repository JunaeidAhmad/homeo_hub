"""Sign-out and password reset must also catch a refresh that is happening right now."""

from datetime import date
from threading import Event, Thread

import pytest
from django.db import connection

from apps.accounts import tokens
from apps.accounts.models import RefreshToken
from apps.patients.models import Patient


def in_thread(work) -> Thread:
    def run() -> None:
        try:
            work()
        finally:
            connection.close()

    thread = Thread(target=run)
    thread.start()
    return thread


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("how", ["sign out", "end every session"])
def test_ending_a_session_during_a_refresh_leaves_no_live_token(monkeypatch, location, how):
    patient = Patient.objects.create(
        phone="+8801712345678",
        full_name="Rahima",
        gender="FEMALE",
        date_of_birth=date(1990, 1, 1),
        location=location,
    )
    session = tokens.open_session("patient", str(patient.pk))
    mid_refresh, carry_on = Event(), Event()
    create_link = tokens._new_link

    def paused_link(*args):
        mid_refresh.set()  # the old token is marked used; the new one does not exist yet
        carry_on.wait(5)
        return create_link(*args)

    monkeypatch.setattr(tokens, "_new_link", paused_link)
    refresh = in_thread(lambda: tokens.rotate(session.refresh_token))
    assert mid_refresh.wait(5)

    if how == "sign out":
        ending = in_thread(lambda: tokens.close_session(session.refresh_token))
    else:
        ending = in_thread(lambda: tokens.close_all_sessions("patient", str(patient.pk)))
    ending.join(0.5)  # give it every chance to run ahead of the refresh
    carry_on.set()
    refresh.join(5)
    ending.join(5)

    assert RefreshToken.objects.count() == 2
    assert not RefreshToken.objects.filter(revoked_at__isnull=True).exists()
