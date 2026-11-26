from rest_framework import serializers

from common.serializers import LocalizedField

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    title = LocalizedField()
    body = LocalizedField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "read_at", "created_at"]
        read_only_fields = fields


class UnreadCountSerializer(serializers.Serializer):
    unread_count = serializers.IntegerField()


class PushPublicKeySerializer(serializers.Serializer):
    public_key = serializers.CharField()
    enabled = serializers.BooleanField()


class PushSubscriptionKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=255)
    auth = serializers.CharField(max_length=255)


class PushSubscriptionInputSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=2000)
    keys = PushSubscriptionKeysSerializer()


class PushSubscriptionDeleteSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class PushSubscriptionStatusSerializer(serializers.Serializer):
    subscribed = serializers.BooleanField()
