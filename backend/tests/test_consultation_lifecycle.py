"""Consultation lifecycle rules that span apps: withdrawing, reassigning, question rounds, and
the audit trail of clinical reads."""

from datetime import timedelta

import pytest
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import tokens
from apps.audit.models import AuditEntry
from apps.consultations import services as consultations
from apps.consultations.models import DoctorConsultation
from apps.doctors.models import Doctor
from apps.locations.models import Location
from apps.patients.models import Patient
from apps.telemedicine import services as telemedicine
from apps.telemedicine.models import VideoAppointment
from tests.auth_helpers import error_code, verified_patient

pytestmark = pytest.mark.django_db

Status = DoctorConsultation.Status


def make_doctor(location: Location, n: int) -> tuple[Doctor, APIClient]:
    doctor = Doctor.objects.create(
        doctor_code=f"HH-DR-{n:04d}",
        phone=f"0181000000{n}",
        password=make_password("unused"),
        full_name=f"Dr. Number {n}",
        registration_no=f"REG-{n}",
        qualifications="DHMS",
        experience_years=5,
        location=location,
        chamber_address="Dhanmondi",
        requested_fee_poisha=50000,
        consultation_fee_poisha=50000,
        status=Doctor.Status.APPROVED,
        phone_verified_at=timezone.now(),
    )
    client = APIClient()
    token = tokens.open_session(doctor.user_type, str(doctor.pk)).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return doctor, client


@pytest.fixture
def staff_user(db) -> User:
    return User.objects.create_user(username="case_desk", password="unused-pass")


@pytest.fixture
def patient(location) -> tuple[Patient, APIClient]:
    client = APIClient()
    session = verified_patient(client, location, phone="01712345678")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    return Patient.objects.get(phone__endswith="1712345678"), client


def open_case_for(patient: Patient, doctor: Doctor, staff_user: User) -> DoctorConsultation:
    case = consultations.submit(
        patient=patient, chief_complaint="Acidity", symptoms="Burning after meals"
    )
    consultations.assign(case, doctor, staff_user)
    return consultations.open_case(case, doctor)


def accepted_call(case: DoctorConsultation, doctor: Doctor, patient: Patient) -> VideoAppointment:
    appointment = telemedicine.propose(
        case, doctor, start_at=timezone.now() + timedelta(hours=2), duration_minutes=20
    )
    return telemedicine.accept(appointment, patient)


def ask(case: DoctorConsultation, doctor: Doctor):
    return consultations.send_questions(
        case, doctor, questions=[{"prompt": "When does it start?", "question_type": "TEXT"}]
    )


def test_patient_can_withdraw_a_case_under_review_and_its_call_is_cancelled(
    location, patient, staff_user
):
    patient_obj, client = patient
    doctor, _ = make_doctor(location, 1)
    case = open_case_for(patient_obj, doctor, staff_user)
    call = accepted_call(case, doctor, patient_obj)

    response = client.post(f"/api/v1/consultations/{case.pk}/withdraw/", {}, format="json")

    assert response.status_code == 200, response.content
    case.refresh_from_db()
    call.refresh_from_db()
    assert case.status == Status.CANCELLED
    assert call.status == VideoAppointment.Status.CANCELLED
    # A finished case can't be withdrawn again.
    again = client.post(f"/api/v1/consultations/{case.pk}/withdraw/", {}, format="json")
    assert error_code(again) == "CONSULTATION_NOT_CANCELLABLE"


def test_reassigning_a_case_takes_the_call_away_from_the_previous_doctor(
    location, patient, staff_user
):
    patient_obj, _ = patient
    first, first_client = make_doctor(location, 1)
    second, _ = make_doctor(location, 2)
    case = open_case_for(patient_obj, first, staff_user)
    call = accepted_call(case, first, patient_obj)

    consultations.assign(case, second, staff_user)

    call.refresh_from_db()
    assert call.status == VideoAppointment.Status.CANCELLED
    # The previous doctor no longer reaches the appointment at all.
    start = first_client.post(f"/api/v1/doctor/appointments/{call.pk}/start/", {}, format="json")
    assert start.status_code == 404
    # The new doctor can propose a fresh call.
    case.refresh_from_db()
    consultations.open_case(case, second)
    fresh = telemedicine.propose(case, second, start_at=timezone.now() + timedelta(hours=3))
    assert fresh.status == VideoAppointment.Status.PROPOSED


def test_one_question_round_at_a_time_and_no_answers_after_withdrawal(
    location, patient, staff_user
):
    patient_obj, client = patient
    doctor, doctor_client = make_doctor(location, 1)
    case = open_case_for(patient_obj, doctor, staff_user)
    question_set = ask(case, doctor)

    second = doctor_client.post(
        f"/api/v1/doctor/consultations/{case.pk}/question-sets/",
        {"questions": [{"prompt": "Any fever?", "question_type": "TEXT"}]},
        format="json",
    )
    assert error_code(second) == "QUESTIONS_STILL_OPEN"

    client.post(f"/api/v1/consultations/{case.pk}/withdraw/", {}, format="json")
    question = question_set.questions.get()
    answer = client.post(
        f"/api/v1/consultations/{case.pk}/question-sets/{question_set.pk}/answers/",
        {"answers": [{"question_id": str(question.pk), "value": "Mornings"}]},
        format="json",
    )
    assert error_code(answer) == "NOT_AWAITING_ANSWERS"


def test_opening_a_case_is_audited_as_a_read_of_the_patient_record(location, patient, staff_user):
    patient_obj, _ = patient
    doctor, doctor_client = make_doctor(location, 1)
    case = consultations.submit(
        patient=patient_obj, chief_complaint="Acidity", symptoms="Burning after meals"
    )
    consultations.assign(case, doctor, staff_user)

    response = doctor_client.post(f"/api/v1/doctor/consultations/{case.pk}/open/", format="json")

    assert response.status_code == 200, response.content
    entry = AuditEntry.objects.get(action="consultation.patient_record.read")
    assert entry.actor_type == AuditEntry.ActorType.DOCTOR
    assert entry.actor_id == str(doctor.pk)
    assert entry.target_id == str(case.pk)
