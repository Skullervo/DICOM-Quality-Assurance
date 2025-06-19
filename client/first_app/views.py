from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, Http404
from .models import Ultrasound
import io
import numpy as np
import requests
import base64
from PIL import Image
from io import BytesIO
import pydicom

orthanc_url = 'http://localhost:8042'
orthanc_username = 'admin'  # Korvaa oikealla käyttäjätunnuksella
orthanc_password = 'alice'  # Korvaa oikealla salasanalla

def index(request):
    return render(request, 'aloitus_sivu1.html')

def ultraaeni_laadunvalvonta_view(request):
    return render(request, 'ultraaeni_laadunvalvonta_laitteet.html')

def ultraaeni_oys_view(request):
    return render(request, 'ultraaeni_laadunvalvonta4.html')

def ultraaeni_oys_dashboard(request):
    return render(request, 'dashboard4.html')

def laadunvalvonta_modaliteetit(request):
    return render(request, 'modaliteetit.html')

def fetch_s_depth(request):
    data = list(Ultrasound.objects.values_list('s_depth', flat=True))
    return JsonResponse(data, safe=False)

def fetch_u_cov(request):
    data = list(Ultrasound.objects.values_list('u_cov', flat=True))
    return JsonResponse(data, safe=False)

def fetch_u_skew(request):
    data = list(Ultrasound.objects.values_list('u_skew', flat=True))
    return JsonResponse(data, safe=False)

def get_s_depth(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('s_depth', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

def get_u_cov(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('u_cov', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

def get_u_skew(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('u_skew', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

def get_stationname(request, index):
    try:
        station = Ultrasound.objects.all()[index]
        return JsonResponse({'stationname': station.stationname})
    except IndexError:
        return JsonResponse({'error': 'Index out of range'}, status=404)

def institutions(request):
    institutions = Ultrasound.objects.values_list('institutionname', flat=True).distinct()
    print(institutions)  # Debug-tulostus
    return render(request, 'institutions.html', {'institutions': institutions})

def units_view(request):
    units = Ultrasound.objects.values_list('institutionaldepartmentname', flat=True).distinct()
    return render(request, 'units.html', {'units': units})

def unit_details_view(request, unit_name):
    unit_details = Ultrasound.objects.filter(institutionaldepartmentname=unit_name).values('stationname', 'manufacturer', 'modality').distinct()
    return render(request, 'unitDetails.html', {'unit_name': unit_name, 'unit_details': unit_details})

import logging

logger = logging.getLogger(__name__)

def device_details_view(request, stationname):
    logger.debug(f"Fetching device details for stationname: {stationname}")  # Debug-tulostus
    device = Ultrasound.objects.filter(stationname=stationname).first()
    if device:
        try:
            logger.debug(f"Device found: {device}")  # Debug-tulostus
            logger.debug(f"Instance ID: {device.instance}")  # Debug-tulostus

            # Lataa kuva paikalliselta Orthanc-palvelimelta
            r = requests.get(
                f'{orthanc_url}/instances/{device.instance}/file',
                auth=(orthanc_username, orthanc_password)
            )
            r.raise_for_status()
            dicom_file = BytesIO(r.content)

            # Lue DICOM-tiedosto
            dicom_data = pydicom.dcmread(dicom_file)

            # Muunna DICOM-kuva numpy-taulukoksi
            image_array = dicom_data.pixel_array

            # Muunna numpy-taulukko PIL-kuvaksi
            img = Image.fromarray(image_array)

            # Muunna kuva base64-muotoon
            buffered = BytesIO()
            img.save(buffered, format="JPEG")
            img_str = base64.b64encode(buffered.getvalue()).decode()

            context = {
                'device': device,
                's_depth': device.s_depth,
                'u_cov': device.u_cov,
                'u_skew': device.u_skew,
                'image': img_str,
            }
            return render(request, 'deviceDetails.html', context)
        except Exception as e:
            logger.debug(f"Error: {str(e)}")  # Debug-tulostus
            return JsonResponse({'error': str(e)}, status=500)
    else:
        logger.debug("Device not found")  # Debug-tulostus
        raise Http404("Device not found")

def get_orthanc_image(request, instance_value):
    try:
        # Hae kuva Orthanc-palvelimelta käyttäen instancen ID:tä
        orthanc_url_full = f'{orthanc_url}/instances/{instance_value}/file'
        response = requests.get(orthanc_url_full, auth=(orthanc_username, orthanc_password))
        response.raise_for_status()

        # Lue DICOM-tiedosto
        dicom_file = BytesIO(response.content)
        dicom_data = pydicom.dcmread(dicom_file)

        # Muunna DICOM-kuva numpy-taulukoksi
        image_array = dicom_data.pixel_array

        # Muunna numpy-taulukko PIL-kuvaksi
        img = Image.fromarray(image_array)

        # Muunna kuva base64-muotoon
        buffered = BytesIO()
        img.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        return JsonResponse({'image': img_str})
    except requests.exceptions.RequestException as e:
        return JsonResponse({'error': 'Request error', 'details': str(e)}, status=500)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


def device_details(request, device_id):
    device = get_object_or_404(Ultrasound, pk=device_id)
    return render(request, 'deviceDetails.html', {'device': device})
