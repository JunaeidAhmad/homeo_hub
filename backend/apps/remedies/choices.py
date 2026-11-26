from django.db import models


class RemedyForm(models.TextChoices):  # the "type" in the tickets
    PILL = "PILL"
    LIQUID = "LIQUID"


class Potency(models.TextChoices):
    P6C = "6C"
    P30C = "30C"
    P200C = "200C"
    P1M = "1M"
