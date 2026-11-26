from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("doctors", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE SEQUENCE IF NOT EXISTS doctor_code_seq START 1;",
            reverse_sql="DROP SEQUENCE IF EXISTS doctor_code_seq;",
        ),
    ]
