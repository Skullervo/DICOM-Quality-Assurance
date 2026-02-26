import io
import os
import json
import numpy as np
import requests
import base64
import pydicom
import datetime
import logging



from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, Http404, HttpResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST
from django.views.decorators.http import require_GET
from django.contrib.auth.decorators import login_required
from django.db.models import F, Count
from .models import Ultrasound, XrayAnalysis, CTAnalysis
from datetime import datetime
from collections import defaultdict
from .ai_chat import generate_response  # tuodaan ai_chat-funktio
from PIL import Image
from io import BytesIO
from qa_core.utils import modifyUS
from pydicom import dcmread




SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")

orthanc_url = os.getenv("ORTHANC_URL", "http://localhost:8042")
orthanc_username = os.getenv("ORTHANC_USERNAME", "admin")
orthanc_password = os.getenv("ORTHANC_PASSWORD", "")
logger = logging.getLogger(__name__)




def index(request):
    return render(request, 'aloitus_sivu1.html')

def ultraaeni_laadunvalvonta_view(request):
    return render(request, 'ultraaeni_laadunvalvonta_laitteet.html')

def laadunvalvonta_modaliteetit(request):
    return render(request, 'modaliteetit.html')

def laadunvalvonta_tietoa(request):
    return render(request, 'tietoa.html')

def institutions(request):
    """Ultraääni-instituutiot — taulukkolistaus"""
    institutions_qs = Ultrasound.objects.values('institutionname').annotate(
        device_count=Count('stationname', distinct=True),
        unit_count=Count('institutionaldepartmentname', distinct=True),
    ).order_by('institutionname')

    institutions_list = [
        {
            'name': item['institutionname'],
            'device_count': item['device_count'],
            'unit_count': item['unit_count'],
        }
        for item in institutions_qs
    ]
    logger.debug("Institutions retrieved: %s", institutions_list)
    return render(request, 'institutions.html', {'institutions': institutions_list})

# RÖNTGEN VIEWS - sama logiikka kuin ultraäänellä
def xray_institutions(request):
    """Röntgen-instituutiot — taulukkolistaus"""
    try:
        institutions_qs = XrayAnalysis.objects.values('institution_name').annotate(
            device_count=Count('station_name', distinct=True),
            unit_count=Count('institutional_department_name', distinct=True),
            instance_count=Count('instance', distinct=True),
        ).order_by('institution_name')

        institutions_list = [
            {
                'name': item['institution_name'] or 'Tuntematon instituutio',
                'device_count': item['device_count'],
                'unit_count': item['unit_count'],
                'instance_count': item['instance_count'],
            }
            for item in institutions_qs
        ]
        return render(request, 'xray_institutions.html', {'institutions': institutions_list})
    except Exception as e:
        return render(request, 'xray_institutions.html', {'error': str(e), 'institutions': []})

def units_view(request):
    """Ultraääni-yksiköt — taulukkolistaus"""
    units_qs = Ultrasound.objects.values('institutionaldepartmentname').annotate(
        device_count=Count('stationname', distinct=True),
    ).order_by('institutionaldepartmentname')

    units_list = [
        {
            'name': item['institutionaldepartmentname'],
            'device_count': item['device_count'],
        }
        for item in units_qs
    ]
    return render(request, 'units.html', {'units': units_list})

def xray_units_view(request, institution_name):
    """Röntgen-yksiköt — taulukkolistaus"""
    try:
        units_qs = XrayAnalysis.objects.filter(
            institution_name=institution_name
        ).values('institutional_department_name').annotate(
            device_count=Count('station_name', distinct=True),
            instance_count=Count('instance', distinct=True),
        ).order_by('institutional_department_name')

        units_list = [
            {
                'name': item['institutional_department_name'] or 'Tuntematon yksikkö',
                'device_count': item['device_count'],
                'instance_count': item['instance_count'],
            }
            for item in units_qs
        ]

        context = {
            'institution_name': institution_name,
            'units': units_list,
        }
        return render(request, 'xray_units.html', context)
    except Exception as e:
        return render(request, 'xray_units.html', {
            'error': str(e),
            'institution_name': institution_name,
            'units': [],
        })

def unit_details_view(request, unit_name):
    """Ultraääni-yksikön tiedot"""
    unit_details = Ultrasound.objects.filter(institutionaldepartmentname=unit_name).values('stationname', 'manufacturer', 'modality').order_by('stationname').distinct()
    return render(request, 'unitDetails.html', {'unit_name': unit_name, 'unit_details': unit_details})

def xray_unit_details_view(request, institution_name, unit_name):
    """Röntgen-yksikön tiedot"""
    # Haetaan kyseisen yksikön kaikki laitteet
    unit_devices = XrayAnalysis.objects.filter(
        institution_name=institution_name,
        institutional_department_name=unit_name
    ).values('station_name').order_by('station_name').distinct()
    
    return render(request, 'xray_unitDetails.html', {
        'institution_name': institution_name,
        'unit_name': unit_name,
        'unit_devices': unit_devices
    })

def xray_device_details(request, institution_name, unit_name):
    """Röntgen-yksikön kaikki laitteet ja niiden QA-tulokset"""
    try:
        device_data = XrayAnalysis.objects.filter(
            institution_name=institution_name,
            institutional_department_name=unit_name
        ).order_by('station_name', '-processed_at')
        
        # Ryhmittele data laitteittain
        devices_data = {}
        for item in device_data:
            device_key = item.station_name or 'Tuntematon laite'
            if device_key not in devices_data:
                devices_data[device_key] = []
            devices_data[device_key].append({
                'instance': item.instance,
                'content_date': item.content_date,
                'processed_at': item.processed_at,
                'uniformity_center': item.uniformity_center,
                'median_contrast': item.median_contrast,
                'mtf_50_percent': item.mtf_50_percent
            })
        
        # Muunna devices_data JSON-stringiksi template-käyttöön
        import json
        devices_data_json = json.dumps(devices_data, default=str)
        
        context = {
            'institution_name': institution_name,
            'unit_name': unit_name,
            'devices_data': devices_data_json
        }
        return render(request, 'xray_deviceDetails_pro.html', context)
    except Exception as e:
        return render(request, 'xray_deviceDetails_pro.html', {
            'error': str(e),
            'institution_name': institution_name,
            'unit_name': unit_name,
            'devices_data': '{}'
        })


def device_details_by_id(request, device_id):
    device = get_object_or_404(Ultrasound, pk=device_id)
    horiz_prof = json.dumps(device.horiz_prof if device.horiz_prof else [])
    vert_prof = json.dumps(device.vert_prof if device.vert_prof else [])

    return render(request, 'deviceDetails.html', {
        'device': device,
        'horiz_prof': horiz_prof,
        'vert_prof': vert_prof,
    })







def fetch_s_depth(request):
    data = list(Ultrasound.objects.values_list('s_depth', flat=True))
    return JsonResponse(data, safe=False)

def fetch_u_cov(request):
    data = list(Ultrasound.objects.values_list('u_cov', flat=True))
    return JsonResponse(data, safe=False)

def fetch_u_skew(request):
    data = list(Ultrasound.objects.values_list('u_skew', flat=True))
    return JsonResponse(data, safe=False)





def s_depth_api(request, instance):
    data = Ultrasound.objects.filter(instance=instance).values_list('s_depth', flat=True)
    return JsonResponse({'s_depth': list(data)})





def get_s_depth(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('s_depth', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

def get_u_cov(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('u_cov', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

def get_u_skew(request, stationname):
    data = list(Ultrasound.objects.filter(stationname=stationname).values('u_skew', 'instance', 'seriesdate'))
    return JsonResponse(data, safe=False)

# RÖNTGEN API-ENDPOINTIT
def get_xray_uniformity(request, stationname):
    """Röntgen-tasaisuusdata trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'uniformity_center', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_contrast(request, stationname):
    """Röntgen-kontrastidata trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'median_contrast', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_mtf(request, stationname):
    """Röntgen-spatial resolution (MTF) data trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'mtf_50_percent', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_cnr(request, stationname):
    """Röntgen-contrast-to-noise ratio data trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'median_cnr', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_low_contrast(request, stationname):
    """Röntgen-low contrast data (20%) trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'lc_20_contrast', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_copper(request, stationname):
    """Röntgen-kuparisuodatin 1.0mm data trendikaavioon"""
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        'cu_100_mean', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_metric(request, field_name, stationname):
    """Yleinen endpoint: palauttaa minkä tahansa sallitun XrayAnalysis-kentän trendidatan"""
    ALLOWED_FIELDS = {
        'uniformity_center', 'uniformity_deviation', 'bg_mean',
        'cu_000_mean', 'cu_030_mean', 'cu_065_mean', 'cu_100_mean',
        'cu_140_mean', 'cu_185_mean', 'cu_230_mean',
        'lc_08_contrast', 'lc_12_contrast', 'lc_20_contrast',
        'lc_28_contrast', 'lc_40_contrast', 'lc_56_contrast',
        'median_contrast', 'median_cnr', 'mtf_50_percent',
    }
    if field_name not in ALLOWED_FIELDS:
        return JsonResponse({'error': 'Field not allowed'}, status=400)
    data = list(XrayAnalysis.objects.filter(station_name=stationname).values(
        field_name, 'instance', 'content_date', 'processed_at'
    ).order_by('content_date'))
    return JsonResponse(data, safe=False)

def get_xray_instance(request, instance_value):
    """Hae röntgen-analyysin tiedot instance-arvon perusteella"""
    try:
        data = XrayAnalysis.objects.get(instance=instance_value)
        response_data = {
            'station_name': data.station_name,
            'manufacturer': data.manufacturer,
            'manufacturer_model_name': data.manufacturer_model_name,
            'modality': data.modality,
            'device_serial_number': data.device_serial_number,
            'content_date': data.content_date,
            'uniformity_center': data.uniformity_center,
            'uniformity_deviation': data.uniformity_deviation,
            'median_contrast': data.median_contrast,
            'median_cnr': data.median_cnr,
            'mtf_50_percent': data.mtf_50_percent,
            'cu_100_mean': data.cu_100_mean,
            'lc_20_contrast': data.lc_20_contrast,
            'kvp': data.kvp,
            'tube_current': data.tube_current,
            'exposure_time': data.exposure_time,
            'instance': data.instance,
            'patient_id': data.patient_id,
            'patient_name': data.patient_name,
            'study_date': data.study_date,
            'series_id': data.series_id,
            'instance_number': data.instance_number
        }
        return JsonResponse(response_data)
    except XrayAnalysis.DoesNotExist:
        return JsonResponse({'error': 'Instance not found'}, status=404)

def get_xray_image(request, instance_value):
    """Hae NORMI-13 phantom kuva instance-arvon perusteella Orthanc PACS:sta"""
    logger.info(f"get_xray_image kutsuttu instance_value: {instance_value}")
    
    try:
        # 1) Lataa DICOM Orthancista
        url = f"{orthanc_url}/instances/{instance_value}/file"
        logger.info(f"Yritetään ladata kuva URL:sta: {url}")
        
        r = requests.get(url, auth=(orthanc_username, orthanc_password), timeout=10)
        logger.info(f"Orthanc vastaus status: {r.status_code}")
        r.raise_for_status()

        logger.info(f"DICOM tiedosto ladattu, koko: {len(r.content)} tavua")
        ds = pydicom.dcmread(BytesIO(r.content))
        im = ds.pixel_array  # numpy-taulukko
        logger.info(f"Pixel array shape: {im.shape}, dtype: {im.dtype}")

        # 2) Normalisoi röntgenkuva (8-bittiseksi)
        def dicom_to_uint8_rgb_xray(pixel_array):
            """Muunna röntgen DICOM pixel array RGB uint8:ksi"""
            import numpy as np
            
            # Normalisoi 0-1 välille
            if pixel_array.dtype != np.uint8:
                pixel_array = pixel_array.astype(np.float32)
                pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min())
                pixel_array = (pixel_array * 255).astype(np.uint8)
            
            # Muunna RGB:ksi (grayscale -> 3 kanavaa)
            if len(pixel_array.shape) == 2:
                rgb_array = np.stack([pixel_array, pixel_array, pixel_array], axis=2)
            else:
                rgb_array = pixel_array
                
            return rgb_array

        # 3) Muunna RGB:ksi
        im_rgb = dicom_to_uint8_rgb_xray(im)
        logger.info(f"RGB kuva luotu, shape: {im_rgb.shape}")

        # 4) Koodaa PNG:ksi ja palauta
        from django.http import HttpResponse
        import io
        from PIL import Image
        
        buffer = io.BytesIO()
        Image.fromarray(im_rgb).save(buffer, format="PNG")
        buffer.seek(0)
        
        logger.info(f"PNG kuva luotu, koko: {buffer.getbuffer().nbytes} tavua")
        return HttpResponse(buffer.getvalue(), content_type='image/png')
        
    except requests.RequestException as e:
        logger.error(f"Virhe ladattaessa kuvaa Orthanc:sta: {str(e)}")
        # Fallback: palauta placeholder kuva
        return get_xray_placeholder_image()
    except Exception as e:
        logger.error(f"Virhe käsiteltäessä DICOM-kuvaa: {str(e)}")
        # Fallback: palauta placeholder kuva  
        return get_xray_placeholder_image()

def get_xray_placeholder_image():
    """Palauta placeholder kuva kun oikea DICOM-kuva ei ole saatavilla"""
    logger.info("get_xray_placeholder_image kutsuttu")
    try:
        import os
        from django.conf import settings
        from django.http import FileResponse
        
        placeholder_path = os.path.join(settings.STATICFILES_DIRS[0], 'images', 'XRAY.png')
        logger.info(f"Etsitään placeholder kuvaa polusta: {placeholder_path}")
        
        if os.path.exists(placeholder_path):
            logger.info("Placeholder kuva löytyi, palautetaan FileResponse")
            return FileResponse(open(placeholder_path, 'rb'), content_type='image/png')
        
        logger.error(f"Placeholder kuvaa ei löytynyt polusta: {placeholder_path}")
        # Jos placeholder:kaan ei löydy
        raise Http404('Image not found')
        
    except Exception as e:
        logger.error(f"Virhe ladattaessa placeholder-kuvaa: {str(e)}")
        raise Http404('Image not found')


def get_xray_analysis_image(request, instance_value, image_type):
    """Palauttaa analyysikuvan PNG:nä tietokannasta."""
    IMAGE_FIELD_MAP = {
        'contrast_rois': 'contrast_rois_image',
        'mtf_lp': 'mtf_lp_image',
        'mtf_curve': 'mtf_curve_image',
    }
    field_name = IMAGE_FIELD_MAP.get(image_type)
    if not field_name:
        raise Http404("Unknown image type")

    try:
        analysis = XrayAnalysis.objects.get(instance=instance_value)
    except XrayAnalysis.DoesNotExist:
        raise Http404("Analysis not found")

    data = getattr(analysis, field_name)
    if not data:
        raise Http404("No image available")

    return HttpResponse(bytes(data), content_type="image/png")


def get_stationname(request, index):
    try:
        station = Ultrasound.objects.all()[index]
        return JsonResponse({'stationname': station.stationname})
    except IndexError:
        return JsonResponse({'error': 'Index out of range'}, status=404)
    


@require_GET
def dicom_info_api(request, instance_id):
    try:
        url = f"{orthanc_url}/instances/{instance_id}/file"
        r = requests.get(url, auth=(orthanc_username, orthanc_password))
        r.raise_for_status()

        ds = pydicom.dcmread(BytesIO(r.content))
        info = {}

        for elem in ds:
            if elem.VR != 'SQ' and elem.tag != (0x7FE0, 0x0010):  # Suodata Pixel Data
                tag_name = elem.name
                value = str(elem.value)
                info[tag_name] = value

        return JsonResponse({'status': 'success', 'data': info})

    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    


@login_required
@require_POST
def report_issue(request):
    try:
        data = json.loads(request.body)
        msg  = data.get("text", "").strip()
        if not msg:
            return HttpResponseBadRequest("Empty message")

        payload = {"text": f"📩 Uusi viesti verkkosivulta:\n{msg}"}

        r = requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
        r.raise_for_status()

        return JsonResponse({"status": "ok"})
    except Exception as e:
        return JsonResponse({"status": "error", "detail": str(e)}, status=500)



# =====================================================
# CT VIEWS — sama rakenne kuin röntgenillä
# =====================================================

def ct_institutions(request):
    """CT-instituutiot — taulukkolistaus"""
    try:
        institutions_qs = CTAnalysis.objects.values('institution_name').annotate(
            device_count=Count('station_name', distinct=True),
            unit_count=Count('institutional_department_name', distinct=True),
            instance_count=Count('instance', distinct=True),
        ).order_by('institution_name')

        institutions_list = [
            {
                'name': item['institution_name'] or 'Tuntematon instituutio',
                'device_count': item['device_count'],
                'unit_count': item['unit_count'],
                'instance_count': item['instance_count'],
            }
            for item in institutions_qs
        ]
        return render(request, 'ct_institutions.html', {'institutions': institutions_list})
    except Exception as e:
        return render(request, 'ct_institutions.html', {'error': str(e), 'institutions': []})


def ct_units_view(request, institution_name):
    """CT-yksiköt — taulukkolistaus"""
    try:
        units_qs = CTAnalysis.objects.filter(
            institution_name=institution_name
        ).values('institutional_department_name').annotate(
            device_count=Count('station_name', distinct=True),
            instance_count=Count('instance', distinct=True),
        ).order_by('institutional_department_name')

        units_list = [
            {
                'name': item['institutional_department_name'] or 'Tuntematon yksikkö',
                'device_count': item['device_count'],
                'instance_count': item['instance_count'],
            }
            for item in units_qs
        ]
        return render(request, 'ct_units.html', {
            'institution_name': institution_name,
            'units': units_list,
        })
    except Exception as e:
        return render(request, 'ct_units.html', {
            'error': str(e),
            'institution_name': institution_name,
            'units': [],
        })


def ct_unit_details_view(request, institution_name, unit_name):
    """CT-yksikön laitteet"""
    unit_devices = CTAnalysis.objects.filter(
        institution_name=institution_name,
        institutional_department_name=unit_name
    ).values('station_name').order_by('station_name').distinct()

    return render(request, 'ct_unitDetails.html', {
        'institution_name': institution_name,
        'unit_name': unit_name,
        'unit_devices': unit_devices,
    })


def ct_device_details(request, institution_name, unit_name):
    """CT-laitteen dashboard — kaikki QA-tulokset"""
    try:
        device_data = CTAnalysis.objects.filter(
            institution_name=institution_name,
            institutional_department_name=unit_name
        ).order_by('station_name', '-processed_at')

        devices_data = {}
        for item in device_data:
            key = item.station_name or 'Tuntematon laite'
            if key not in devices_data:
                devices_data[key] = []
            devices_data[key].append({
                'instance': item.instance,
                'content_date': item.content_date,
                'processed_at': str(item.processed_at) if item.processed_at else None,
                'uniformity_index': item.uniformity_index,
                'mtf_50_percent': item.mtf_50_percent,
                'noise_hu_std': item.noise_hu_std,
                'phantom_model': item.phantom_model,
            })

        context = {
            'institution_name': institution_name,
            'unit_name': unit_name,
            'devices_data': json.dumps(devices_data, default=str),
        }
        return render(request, 'ct_deviceDetails.html', context)
    except Exception as e:
        logger.error("CT device details error: %s", e)
        return render(request, 'ct_deviceDetails.html', {
            'institution_name': institution_name,
            'unit_name': unit_name,
            'devices_data': json.dumps({}),
        })


# --- CT API-ENDPOINTIT (6 trendikaaviolle) ---

def get_ct_hu_uniformity(request, stationname):
    """Kaavio 1: Uniformiteetti-indeksi trendinä"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'uniformity_index', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_hu_linearity(request, stationname):
    """Kaavio 2: HU-lineaarisuus (kaikki 7 materiaalia) trendinä"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'hu_air', 'hu_pmp', 'hu_ldpe', 'hu_poly', 'hu_acrylic', 'hu_delrin', 'hu_teflon',
        'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_mtf(request, stationname):
    """Kaavio 3: MTF 50% trendinä"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'mtf_50_percent', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_low_contrast(request, stationname):
    """Kaavio 4: Näkyvien matalan kontrastin kohteiden lukumäärä"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'num_low_contrast_rois_seen', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_noise(request, stationname):
    """Kaavio 5: Kohinataso (HU keskihajonta)"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'noise_hu_std', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_slice_thickness(request, stationname):
    """Kaavio 6: Mitattu leikepaksuus"""
    data = CTAnalysis.objects.filter(station_name=stationname).values(
        'slice_thickness_mm', 'instance', 'content_date', 'processed_at'
    ).order_by('content_date')
    return JsonResponse(list(data), safe=False)


def get_ct_instance(request, instance_value):
    """Yksittäisen CT-instanssin kaikki metatiedot"""
    try:
        item = CTAnalysis.objects.get(instance=instance_value)
        data = {
            'instance': item.instance,
            'content_date': item.content_date,
            'station_name': item.station_name,
            'manufacturer': item.manufacturer,
            'manufacturer_model_name': item.manufacturer_model_name,
            'modality': item.modality,
            'device_serial_number': item.device_serial_number,
            'kvp': item.kvp,
            'tube_current': item.tube_current,
            'slice_thickness': item.slice_thickness,
            'reconstruction_kernel': item.reconstruction_kernel,
            'ctdi_vol': item.ctdi_vol,
            'phantom_model': item.phantom_model,
            'uniformity_index': item.uniformity_index,
            'mtf_50_percent': item.mtf_50_percent,
            'noise_hu_std': item.noise_hu_std,
            'overall_pass': item.overall_pass,
            'hu_air': item.hu_air,
            'hu_pmp': item.hu_pmp,
            'hu_ldpe': item.hu_ldpe,
            'hu_poly': item.hu_poly,
            'hu_acrylic': item.hu_acrylic,
            'hu_delrin': item.hu_delrin,
            'hu_teflon': item.hu_teflon,
            'slice_thickness_mm': item.slice_thickness_mm,
            'num_low_contrast_rois_seen': item.num_low_contrast_rois_seen,
            'median_cnr': item.median_cnr,
            'patient_id': item.patient_id,
            'patient_name': item.patient_name,
            'study_date': item.study_date,
            'series_id': item.series_id,
            'instance_number': item.instance_number,
        }
        return JsonResponse(data)
    except CTAnalysis.DoesNotExist:
        return JsonResponse({'error': 'Instance not found'}, status=404)


def get_ct_analysis_image(request, instance_value, image_type):
    """CT-leikekuva tai analyysikuvaaja."""
    IMAGE_FIELD_MAP = {
        # Leikekuvat (oikeat CT-leikkeet ROI-merkinnöillä)
        'hu_linearity': 'hu_linearity_image',
        'thickness': 'thickness_image',
        'uniformity': 'uniformity_image',
        'mtf': 'mtf_image',
        'low_contrast': 'low_contrast_image',
        # Analyysikuvaajat (matplotlib-kaaviot)
        'hu_linearity_chart': 'hu_linearity_chart_image',
        'mtf_chart': 'mtf_chart_image',
        'uniformity_profile': 'uniformity_profile_image',
        'side_view': 'side_view_image',
    }
    field_name = IMAGE_FIELD_MAP.get(image_type)
    if not field_name:
        return HttpResponseBadRequest("Tuntematon kuvatyyppi")

    try:
        item = CTAnalysis.objects.get(instance=instance_value)
        image_data = getattr(item, field_name)
        if image_data:
            return HttpResponse(bytes(image_data), content_type='image/png')
        else:
            return HttpResponse(status=204)
    except CTAnalysis.DoesNotExist:
        return JsonResponse({'error': 'Instance not found'}, status=404)


def device_details_view(request, stationname):
    logger.debug(f"Fetching device details for stationname: {stationname}")  # Debug-tulostus
    device = Ultrasound.objects.filter(stationname=stationname).first() #Hakee Ultrasound-olion tietokannasta
    
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
            
            image_height = image_array.shape[0]  # esim. 256 tai 512

            #Luodaan context-sanakirja:
            context = {
                'device': device,
                's_depth': device.s_depth,
                'u_cov': device.u_cov,
                'u_skew': device.u_skew,
                'image': img_str,
                'horiz_prof': json.dumps(device.horiz_prof if device.horiz_prof else []),
                'vert_prof': json.dumps(device.vert_prof if device.vert_prof else []),
                'image_height': image_height,
            }
            return render(request, 'deviceDetails.html', context) #Renderöi templateen
        except Exception as e:
            logger.debug(f"Error: {str(e)}")  # Debug-tulostus
            return JsonResponse({'error': str(e)}, status=500)
    else:
        logger.debug("Device not found")  # Debug-tulostus
        raise Http404("Device not found")

def dicom_to_uint8_rgb(arr: np.ndarray) -> np.ndarray:
    """Normalisoi [min,max] -> [0,255] ja pakota 3-kanavaiseksi."""
    arr = arr.astype(np.float32)
    rng = np.ptp(arr)
    if rng == 0:
        arr_n = np.zeros_like(arr, dtype=np.uint8)
    else:
        arr_n = (255 * (arr - arr.min()) / rng).astype(np.uint8)
    if arr_n.ndim == 2:                           # (H,W) -> (H,W,3)
        arr_n = np.stack([arr_n]*3, axis=-1)
    return arr_n

def get_orthanc_image(request, instance_value):
    try:
        # 1) Lataa DICOM Orthancista
        url = f"{orthanc_url}/instances/{instance_value}/file"
        r   = requests.get(url, auth=(orthanc_username, orthanc_password))
        r.raise_for_status()

        ds  = pydicom.dcmread(BytesIO(r.content))
        im  = ds.pixel_array                       # numpy-taulukko

        # 2) (valinnainen) modiﬁoi kuva
        im  = modifyUS("", r.content, im, None).modify()

        # 3) Normalisoi ja tee RGB
        im_rgb = dicom_to_uint8_rgb(im)

        # 4) Koodaa PNG:ksi base64-muotoon
        buffer = BytesIO()
        Image.fromarray(im_rgb).save(buffer, format="PNG")
        img_b64 = base64.b64encode(buffer.getvalue()).decode()

        # 5) Hae profiilit (try/except jätetty ennalleen)
        try:
            us = Ultrasound.objects.get(instance=instance_value)
            horiz_prof = us.horiz_prof or []
            vert_prof  = us.vert_prof  or []
            u_low      = us.u_low      or []
            s_depth    = us.s_depth *100
            u_cov      = us.u_cov
            u_skew     = us.u_skew
        except Ultrasound.DoesNotExist:
            horiz_prof = vert_prof = u_low = []
            s_depth = u_cov = u_skew = None
            
        # 6) Kerää DICOM-metatiedot
        dicom_info = {}
        for elem in ds:
            if elem.VR != 'SQ':
                tag_name = elem.name
                value = str(elem.value)
                dicom_info[tag_name] = value

        return JsonResponse({
            "image":      img_b64,
            "mime":       "image/png",
            "horiz_prof": horiz_prof,
            "vert_prof":  vert_prof,
            "u_low":      u_low,
            "s_depth":    s_depth,
            "u_cov":      u_cov,
            "u_skew":     u_skew,
            "dicom_info": dicom_info  # uusi kenttä!
        })


    except requests.exceptions.RequestException as e:
        return JsonResponse({"error": "Request error", "details": str(e)}, status=500)
    except Exception as e:
        logger.exception("Virhe käsiteltäessä ultraäänikuvaa")
        return JsonResponse({"error": str(e)}, status=500)






@require_POST
def ask_ai(request):
    logger.debug("ask_ai called with method %s", request.method)
    if not request.user.is_authenticated:
        return JsonResponse({"answer": "Kirjaudu sisään käyttääksesi tekoälytoimintoa. / Please log in to use the AI assistant."}, status=401)
    try:
        data = json.loads(request.body)
        logger.debug("ask_ai payload: %s", data)
        question = data.get("question", "").strip()
        lang = data.get("lang", "fi")

        if not question:
            msg = "Question is missing." if lang == 'en' else "Kysymys puuttuu."
            return JsonResponse({"answer": msg}, status=400)

        # Kutsutaan GPT-mallia
        answer = generate_response(question, lang=lang)
        return JsonResponse({"answer": answer})

    except Exception as e:
        logger.error("ask_ai processing failed: %s", e)
        return JsonResponse({"answer": f"Virhe: {str(e)}"}, status=500)
    




@login_required
def muokkaa_ultraa(request):
    if request.method == 'POST':
        changes = defaultdict(set)  # esim: {'manufacturer': set(('vanha', 'uusi'))}

        # 1. Ensin kerätään kaikki muutokset muistiin
        rows_to_update = []

        for key in request.POST:
            if key.startswith('s_depth_'):
                pk = key.split('_')[2]
                try:
                    us = Ultrasound.objects.get(pk=pk)
                    row_data = {
                        'pk': pk,
                        'us': us,
                        'original_manufacturer': us.manufacturer,
                        'new_manufacturer': request.POST.get(f'manufacturer_{pk}'),
                        's_depth': request.POST.get(f's_depth_{pk}'),
                        'u_cov': request.POST.get(f'u_cov_{pk}'),
                        'u_skew': request.POST.get(f'u_skew_{pk}'),
                        'stationname': request.POST.get(f'stationname_{pk}'),
                        'institutionname': request.POST.get(f'institutionname_{pk}'),
                        'institutionaldepartmentname': request.POST.get(f'institutionaldepartmentname_{pk}'),
                        'modality': request.POST.get(f'modality_{pk}'),
                        'instance': request.POST.get(f'instance_{pk}'),
                        'seriesdate': request.POST.get(f'seriesdate_{pk}')
                    }
                    rows_to_update.append(row_data)

                    # Merkitse mahdollinen muutos
                    if row_data['original_manufacturer'] != row_data['new_manufacturer']:
                        changes['manufacturer'].add((row_data['original_manufacturer'], row_data['new_manufacturer']))

                except Ultrasound.DoesNotExist:
                    continue

        # 2. Tee kaikki massapäivitykset kerralla
        for old, new in changes['manufacturer']:
            Ultrasound.objects.filter(manufacturer=old).update(manufacturer=new)
            logger.info("Manufacturer updated in bulk from %s to %s", old, new)

        # 3. Tallenna muut yksittäiset rivit (ei enää tee massamuutoksia)
        for row in rows_to_update:
            us = row['us']
            us.s_depth = row['s_depth']
            us.u_cov = row['u_cov']
            us.u_skew = row['u_skew']
            us.stationname = row['stationname']
            us.institutionname = row['institutionname']
            us.institutionaldepartmentname = row['institutionaldepartmentname']
            us.manufacturer = row['new_manufacturer']  # varmistetaan että uusi tallentuu
            us.modality = row['modality']
            us.instance = row['instance']

            # Päivämäärän käsittely - älä ylikirjoita virheellisellä tai tyhjällä arvolla
            date_val = row['seriesdate']
            if date_val:
                try:
                    us.seriesdate = datetime.strptime(date_val, '%Y-%m-%d').date()
                except ValueError:
                    logger.warning("Invalid date for row %s: %s", row['pk'], date_val)
                    # Säilytetään aiempi päivämäärä
            else:
                logger.warning("Empty date for row %s, keeping previous value", row['pk'])

            logger.debug(
                "Saving ultrasound record pk=%s with seriesdate=%s and s_depth=%s",
                us.pk,
                us.seriesdate,
                us.s_depth,
            )
            us.save()

        return redirect('muokkaa_ultraa')

    data = Ultrasound.objects.all()
    return render(request, 'ultra_taulukko.html', {'data': data})



def get_profiles(request, instance_uid):
    try:
        # Hae ja käsittele DICOM-tiedosto kuten `get_orthanc_image`-funktiossa
        filepath = get_dicom_file_path(instance_uid)  # tee tämä funktio jos ei vielä ole
        ds = dcmread(filepath)
        img = ds.pixel_array.astype(np.float32)

        # Lasketaan profiilit (esim. keskiarvot rivi- ja sarakesuunnassa)
        vert_profile = np.mean(img, axis=1).tolist()
        horiz_profile = np.mean(img, axis=0).tolist()

        return JsonResponse({
            "vert_profile": vert_profile,
            "horiz_profile": horiz_profile
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
    
def get_ultrasound_by_instance(request, instance_value):
    try:
        us = Ultrasound.objects.get(instance=instance_value)
        return JsonResponse({
            's_depth': us.s_depth,
            'u_cov': us.u_cov,
            'u_skew': us.u_skew,
            'u_low': us.u_low,
            'instance': us.instance,
            # lisää muita kenttiä tarvittaessa
        })
    except Ultrasound.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)










