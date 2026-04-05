import csv
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import SensorReading


class Command(BaseCommand):
    help = 'Seed SensorReading rows from a CSV file.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            default='data/synthetic_data_Predictive_maintenance.csv',
            help='Path to CSV file (relative to backend root or absolute path).',
        )
        parser.add_argument(
            '--replace',
            action='store_true',
            help='Delete existing SensorReading rows before importing.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional max number of rows to import. 0 means all rows.',
        )

    def handle(self, *args, **options):
        csv_file_arg = options['file']
        replace = options['replace']
        limit = int(options['limit'] or 0)

        backend_root = Path(settings.BASE_DIR)
        csv_path = Path(csv_file_arg)
        if not csv_path.is_absolute():
            csv_path = backend_root / csv_path

        if not csv_path.exists():
            raise CommandError(f'CSV file not found: {csv_path}')

        if replace:
            deleted_count, _ = SensorReading.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted existing readings: {deleted_count}'))

        required_columns = {'machine_id', 'temperature', 'pressure', 'vibration', 'flow_rate', 'humidity'}
        created = 0
        skipped = 0
        batch = []

        with csv_path.open('r', encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f)
            headers = set(reader.fieldnames or [])
            missing = required_columns - headers
            if missing:
                missing_str = ', '.join(sorted(missing))
                raise CommandError(f'CSV is missing required columns: {missing_str}')

            for row in reader:
                if limit and (created + len(batch)) >= limit:
                    break
                try:
                    reading = SensorReading(
                        machine_id=str(row['machine_id']).strip(),
                        temperature=float(row['temperature']),
                        pressure=float(row['pressure']),
                        vibration=float(row['vibration']),
                        flow_rate=float(row['flow_rate']),
                        humidity=float(row['humidity']),
                        failure=int(float(row.get('failure', 0))) == 1,
                    )
                except (TypeError, ValueError):
                    skipped += 1
                    continue

                if not reading.machine_id:
                    skipped += 1
                    continue

                batch.append(reading)
                if len(batch) >= 1000:
                    SensorReading.objects.bulk_create(batch, batch_size=1000)
                    created += len(batch)
                    batch = []

        if batch:
            SensorReading.objects.bulk_create(batch, batch_size=1000)
            created += len(batch)

        self.stdout.write(
            self.style.SUCCESS(
                f'Imported {created} readings from {csv_path}.'
                + (f' Skipped {skipped} invalid rows.' if skipped else '')
            )
        )
