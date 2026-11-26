from django.urls import path

from . import views

urlpatterns = [
    path(
        "doctor/consultations/<uuid:pk>/appointments/",
        views.DoctorConsultationAppointmentsView.as_view(),
        name="doctor-consultation-appointments",
    ),
    path(
        "doctor/appointments/<uuid:pk>/repropose/",
        views.DoctorAppointmentReproposeView.as_view(),
        name="doctor-appointments-repropose",
    ),
    path(
        "doctor/appointments/<uuid:pk>/cancel/",
        views.DoctorAppointmentCancelView.as_view(),
        name="doctor-appointments-cancel",
    ),
    path(
        "doctor/appointments/",
        views.DoctorCalendarView.as_view(),
        name="doctor-appointments-calendar",
    ),
    path(
        "doctor-consultations/<uuid:pk>/appointments/",
        views.PatientConsultationAppointmentsView.as_view(),
        name="patient-consultation-appointments",
    ),
    path(
        "appointments/<uuid:pk>/accept/",
        views.PatientAppointmentAcceptView.as_view(),
        name="appointments-accept",
    ),
    path(
        "appointments/<uuid:pk>/reject/",
        views.PatientAppointmentRejectView.as_view(),
        name="appointments-reject",
    ),
    path(
        "appointments/<uuid:pk>/reschedule-request/",
        views.PatientAppointmentRescheduleView.as_view(),
        name="appointments-reschedule-request",
    ),
    path(
        "appointments/<uuid:pk>/cancel/",
        views.PatientAppointmentCancelView.as_view(),
        name="appointments-cancel",
    ),
    path(
        "appointments/upcoming/",
        views.PatientUpcomingAppointmentView.as_view(),
        name="appointments-upcoming",
    ),
]
