from rest_framework import serializers

CHECK_RESULT = ["ok", "error"]


class LiveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ok"])


class ReadyChecksSerializer(serializers.Serializer):
    database = serializers.ChoiceField(choices=CHECK_RESULT)
    redis = serializers.ChoiceField(choices=CHECK_RESULT)


class ReadySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ok", "degraded"])
    checks = ReadyChecksSerializer()
