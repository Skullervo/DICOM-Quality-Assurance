import pandas as pd
from django.core.management.base import BaseCommand
from first_app.models import Transducer

class Command(BaseCommand):
    help = "Import transducer data from Excel"

    def handle(self, *args, **kwargs):
        file_path = 'first_app/transducers.xls'  # Muuta tarvittaessa

        try:
            df = pd.read_excel(file_path)

            for _, row in df.iterrows():
                Transducer.objects.create(
                    model_name=row['Model_name'],
                    manufacturer=row['Manufacturer'],
                    rcx0=row['RCX0'],
                    rcy0=row['RCY0'],
                    rcx1=row['RCX1'],
                    rcy1=row['RCY1'],
                    phys_units_x=row['Phys_units_X'],
                    phys_units_y=row['Phys_units_Y'],
                    phys_delta_x=row['Phys_delta_X'],
                    phys_delta_y=row['Phys_delta_Y'],
                    transducer_name=row['Transducer_name'],
                )

            self.stdout.write(self.style.SUCCESS('✔️ Importointi onnistui.'))

        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Virhe: {e}'))
