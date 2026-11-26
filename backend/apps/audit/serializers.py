from rest_framework import serializers

from .models import AuditEntry


class AuditEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEntry
        fields = [
            "id",
            "actor_type",
            "actor_id",
            "actor_label",
            "action",
            "target_type",
            "target_id",
            "ip",
            "before",
            "after",
            "created_at",
        ]
        read_only_fields = fields
