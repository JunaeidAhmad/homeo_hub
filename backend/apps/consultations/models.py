import uuid

from django.db import models


class DoctorConsultation(models.Model):
    """A consultation case submitted by a patient and handled by an assigned doctor."""

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED"
        ASSIGNED = "ASSIGNED"
        IN_REVIEW = "IN_REVIEW"
        AWAITING_PATIENT = "AWAITING_PATIENT"
        RESPONDED = "RESPONDED"
        PRESCRIBED = "PRESCRIBED"
        COMPLETED = "COMPLETED"
        CLOSED_UNPAID = "CLOSED_UNPAID"
        CLOSED = "CLOSED"
        CANCELLED = "CANCELLED"

    class Urgency(models.TextChoices):
        ROUTINE = "ROUTINE"
        SOON = "SOON"
        URGENT = "URGENT"

    class DurationUnit(models.TextChoices):
        DAYS = "DAYS"
        WEEKS = "WEEKS"
        MONTHS = "MONTHS"
        YEARS = "YEARS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation_code = models.CharField(max_length=24, unique=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="consultations",
    )
    assigned_doctor = models.ForeignKey(
        "doctors.Doctor",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consultations",
    )
    illness = models.ForeignKey(
        "illnesses.Illness",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consultations",
    )
    categories = models.ManyToManyField(
        "illnesses.IllnessCategory",
        blank=True,
        related_name="consultations",
    )
    chief_complaint = models.CharField(max_length=200)
    symptoms = models.TextField()
    duration_value = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_unit = models.CharField(
        max_length=10, choices=DurationUnit.choices, blank=True, default=""
    )
    symptom_notes = models.TextField(blank=True, default="")
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.ROUTINE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)

    submitted_at = models.DateTimeField(auto_now_add=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]
        indexes = [
            models.Index(fields=["status"], name="consult_status"),
            models.Index(fields=["submitted_at"], name="consult_submitted"),
            models.Index(fields=["patient", "status"], name="consult_patient_status"),
            models.Index(fields=["assigned_doctor", "status"], name="consult_doctor_status"),
        ]

    def __str__(self) -> str:
        return f"{self.consultation_code} ({self.status})"


class ConsultationStatusHistory(models.Model):
    """Audit trail of status moves on a consultation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        DoctorConsultation,
        on_delete=models.CASCADE,
        related_name="history",
    )
    from_status = models.CharField(
        max_length=20, choices=DoctorConsultation.Status.choices, blank=True, default=""
    )
    to_status = models.CharField(max_length=20, choices=DoctorConsultation.Status.choices)
    actor_type = models.CharField(max_length=20)
    actor_id = models.CharField(max_length=64, blank=True, default="")
    actor_name = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        previous = self.from_status or "NEW"
        return f"{self.consultation.consultation_code}: {previous} -> {self.to_status}"


class QuestionSet(models.Model):
    """A batch of follow-up questions sent by the assigned doctor to the patient."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        DoctorConsultation,
        on_delete=models.CASCADE,
        related_name="question_sets",
    )
    created_by = models.ForeignKey(
        "doctors.Doctor",
        on_delete=models.PROTECT,
        related_name="question_sets",
    )
    round_number = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=160, blank=True, default="")
    note = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["round_number", "sent_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["consultation", "round_number"],
                name="question_set_round_unique",
            )
        ]

    def __str__(self) -> str:
        return f"{self.consultation.consultation_code} round {self.round_number}"


class Question(models.Model):
    """A single structured or free-text prompt inside a QuestionSet."""

    class Type(models.TextChoices):
        TEXT = "TEXT"
        LONG_TEXT = "LONG_TEXT"
        YES_NO = "YES_NO"
        SINGLE_CHOICE = "SINGLE_CHOICE"
        MULTI_CHOICE = "MULTI_CHOICE"
        NUMBER = "NUMBER"
        SCALE = "SCALE"
        PHOTO = "PHOTO"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question_set = models.ForeignKey(
        QuestionSet,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    sort_order = models.PositiveSmallIntegerField()
    question_type = models.CharField(max_length=16, choices=Type.choices)
    prompt = models.TextField()
    help_text = models.CharField(max_length=300, blank=True, default="")
    required = models.BooleanField(default=True)
    options = models.JSONField(default=list, blank=True)
    scale_min = models.PositiveSmallIntegerField(default=1)
    scale_max = models.PositiveSmallIntegerField(default=5)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return f"Q{self.sort_order}: {self.prompt[:40]}"


class Answer(models.Model):
    """The patient's submitted response to one question."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.OneToOneField(
        Question,
        on_delete=models.CASCADE,
        related_name="answer",
    )
    value_json = models.JSONField(null=True, blank=True)
    file = models.CharField(max_length=255, blank=True, default="")
    file_name = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    answered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Answer to {self.question_id}"


class QuestionTemplate(models.Model):
    """Reusable bilingual question template tagged with illness categories."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        RETIRED = "RETIRED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    text_en = models.TextField()
    text_bn = models.TextField(blank=True, default="")
    question_type = models.CharField(max_length=16, choices=Question.Type.choices)
    options_en = models.JSONField(default=list, blank=True)
    options_bn = models.JSONField(default=list, blank=True)
    required = models.BooleanField(default=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    categories = models.ManyToManyField(
        "illnesses.IllnessCategory",
        blank=True,
        related_name="question_templates",
    )
    use_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-use_count", "text_en", "id"]
        indexes = [models.Index(fields=["status"], name="qtemplate_status")]

    def __str__(self) -> str:
        return self.text_en[:60]
