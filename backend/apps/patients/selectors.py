from .models import Patient, PatientProfile


def get_or_create_profile(patient: Patient) -> PatientProfile:
    """Return the patient's profile row with its patient and location preloaded."""
    profile, _ = PatientProfile.objects.select_related(
        "patient", "patient__location"
    ).get_or_create(patient=patient)
    return profile
