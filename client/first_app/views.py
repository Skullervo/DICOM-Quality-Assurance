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
from django.http import JsonResponse, Http404, HttpResponseBadRequest
from django.views.decorators.http import require_POST
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt
from django.db.models import F
from .models import Ultrasound
from datetime import datetime
from collections import defaultdict
from .ai_chat import generate_response  # tuodaan ai_chat-funktio
from PIL import Image
from io import BytesIO
from first_app.utils import modifyUS
from pydicom import dcmread




SLACK_WEBHOOK = (
    "https://hooks.slack.com/services/"
    "T09462DGBEF/B094BUA4BPX/QXbkETjMcauTXg26xdrAUJ5m"
)

orthanc_url = 'http://localhost:8042'
orthanc_username = 'admin'  # Korvaa oikealla käyttäjätunnuksella
orthanc_password = 'alice'  # Korvaa oikealla salasanalla
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
    institutions = Ultrasound.objects.values_list('institutionname', flat=True).distinct()
    print(institutions)  # Debug-tulostus
    return render(request, 'institutions.html', {'institutions': institutions})

def units_view(request):
    units = Ultrasound.objects.values_list('institutionaldepartmentname', flat=True).distinct()
    return render(request, 'units.html', {'units': units})

def unit_details_view(request, unit_name):
    unit_details = Ultrasound.objects.filter(institutionaldepartmentname=unit_name).values('stationname', 'manufacturer', 'modality').distinct()
    return render(request, 'unitDetails.html', {'unit_name': unit_name, 'unit_details': unit_details})


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

def get_stationname(request, index):
    try:
        station = Ultrasound.objects.all()[index]
        return JsonResponse({'stationname': station.stationname})
    except IndexError:
        return JsonResponse({'error': 'Index out of range'}, status=404)
    


# @require_GET
# def dicom_info_api(request, instance_id):
#     try:
#         response = requests.get(f"{ORTHANC_URL}/instances/{instance_id}/tags")
#         response.raise_for_status()

#         tags = response.json()
        
#         # Muotoillaan tagit luettavaan muotoon
#         info = {}
#         for tag_hex, value in tags.items():
#             if isinstance(value, dict) and 'Value' in value:
#                 value = value['Value']
#             if isinstance(value, list):
#                 value = ", ".join(str(v) for v in value)
#             elif not isinstance(value, str):
#                 value = str(value)

#             info[tag_hex] = value

#         return JsonResponse({'status': 'success', 'data': info})
    
#     except Exception as e:
#         return JsonResponse({'status': 'error', 'message': f"Virhe DICOM-tietojen haussa: {str(e)}"}, status=500)


# @require_GET
# def dicom_info_api(request, instance_id):
#     try:
#         url = f"{orthanc_url}/instances/{instance_id}/file"
#         r = requests.get(url, auth=(orthanc_username, orthanc_password))
#         r.raise_for_status()

#         ds = pydicom.dcmread(BytesIO(r.content))
#         info = {}
#         for elem in ds:
#             if elem.VR != 'SQ':
#                 tag_name = elem.name
#                 value = str(elem.value)
#                 info[tag_name] = value
#         return JsonResponse({'status': 'success', 'data': info})

#     except Exception as e:
#         return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


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
    


@csrf_exempt                # frontista ei tarvitse CSRF-tokenia
@require_POST
def report_issue(request):
    try:
        data = json.loads(request.body)
        msg  = data.get("text", "").strip()
        if not msg:
            return HttpResponseBadRequest("Empty message")

        payload = {"text": f"📩 Uusi viesti verkkosivulta:\n{msg}"}
        # payload = {
        #     "text": (
        #         "📩 *Uusi vikailmoitus*\n"
        #         f"• _Sivu_: {request.headers.get('Referer')}\n"
        #         f"• _Käyttäjäagentti_: {request.META.get('HTTP_USER_AGENT')}\n"
        #         f"• _Viesti_: {msg}"
        #     )
        # }

        r = requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
        r.raise_for_status()

        return JsonResponse({"status": "ok"})
    except Exception as e:
        return JsonResponse({"status": "error", "detail": str(e)}, status=500)

    
    
 
    

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

# def get_orthanc_image(request, instance_value):
#     try:
#         # Hae kuva Orthanc-palvelimelta käyttäen instancen ID:tä
#         orthanc_url_full = f'{orthanc_url}/instances/{instance_value}/file'
#         response = requests.get(orthanc_url_full, auth=(orthanc_username, orthanc_password))
#         response.raise_for_status()

#         # Lue DICOM-tiedosto
#         dicom_file = BytesIO(response.content)
#         dicom_data = pydicom.dcmread(dicom_file)

#         # Muunna DICOM-kuva numpy-taulukoksi
#         image_array = dicom_data.pixel_array

#         # Luo modifyUS-instanssi
#         modifier = modifyUS(
#             path_data="",
#             dicom_bytes=response.content,
#             image=image_array,
#             table=None
#         )

#         # Kutsu modify-funktiota
#         image_array = modifier.modify()
        
#         print("SHAPE:", image_array.shape)
#         print("DTYPE:", image_array.dtype)
#         print("MIN:", np.min(image_array))
#         print("MAX:", np.max(image_array))
#         print("PTP:", np.ptp(image_array))
        
#         img_str = Image.fromarray(image_array)

#         # Tallennus PNG:nä, ei JPEG:nä
#         img_str.save("DEBUG_IMAGE.png")


#         # Normalisoi ja skaalaa uint8-muotoon (0–255)
#         # image_uint8 = np.uint8(255 * (image_array - np.min(image_array)) / (np.ptp(image_array)))
#         # range_val = np.ptp(image_array)
#         # if range_val == 0:
#         #     image_uint8 = np.uint8(np.clip(image_array, 0, 255))
#         # else:
#         #     image_uint8 = np.uint8(255 * (image_array - np.min(image_array)) / range_val)
            
#         # if len(image_uint8.shape) == 2:
#         #     image_uint8 = np.stack((image_uint8,) * 3, axis=-1)

#         # Image.fromarray(image_uint8).save("DEBUG_IMAGE.jpg")
        
#         # img = Image.fromarray(image_uint8)

#         # # Muunna kuva base64-muotoon
#         # buffered = BytesIO()
#         # img.save(buffered, format="JPEG")
#         # img_str = base64.b64encode(buffered.getvalue()).decode()
        
#         # range_val = np.ptp(image_array)
#         # if range_val == 0:
#         #     image_norm = np.zeros_like(image_array, dtype=np.uint8)
#         # else:
#         #     image_norm = 255 * (image_array - np.min(image_array)) / range_val
#         #     image_norm = image_norm.astype(np.uint8)

#         # # Pakota RGB, jos kanavia ei ole 3
#         # if image_norm.ndim == 2:
#         #     image_rgb = np.stack((image_norm,) * 3, axis=-1)
#         # elif image_norm.shape[2] == 1:
#         #     image_rgb = np.concatenate([image_norm] * 3, axis=2)
#         # else:
#         #     image_rgb = image_norm

#         # # Testitallennus
#         # Image.fromarray(image_rgb).save("DEBUG_IMAGE.jpg")

#         # # Base64
#         # img = Image.fromarray(image_rgb)
#         # buffered = BytesIO()
#         # img.save(buffered, format="JPEG")
#         # img_str = base64.b64encode(buffered.getvalue()).decode()
        
#         import matplotlib.pyplot as plt

#         plt.imshow(image_array, cmap='gray')
#         plt.axis('off')
#         plt.savefig("DEBUG_MPL_IMAGE.jpg", bbox_inches='tight', pad_inches=0)
#         plt.close()

#         # Hae profiilit tietokannasta
#         # from .models import Ultrasound
#         try:
#             us = Ultrasound.objects.get(instance=instance_value)
#             horiz_prof = us.horiz_prof if us.horiz_prof else []
#             vert_prof = us.vert_prof if us.vert_prof else []
#             u_low = us.u_low if us.u_low else []
#             s_depth = us.s_depth if us.s_depth else None
#             u_cov = us.u_cov if us.u_cov else None
#             u_skew = us.u_skew if us.u_skew else None
#         except Ultrasound.DoesNotExist:
#             horiz_prof = []
#             vert_prof = []
#             u_low = []

#         return JsonResponse({
#             'image': img_str,
#             'horiz_prof': horiz_prof,
#             'vert_prof': vert_prof,
#             'u_low': u_low,
#             's_depth': s_depth,
#             'u_cov': u_cov, 
#             'u_skew': u_skew
#         })
#     except requests.exceptions.RequestException as e:
#         return JsonResponse({'error': 'Request error', 'details': str(e)}, status=500)
#     except Exception as e:
#         import traceback
#         traceback.print_exc()
#         return JsonResponse({'error': str(e)}, status=500)


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
        
        # import matplotlib.pyplot as plt
        # plt.imshow(im_rgb, cmap='gray')
        # plt.axis('off')
        # plt.savefig("DEBUG_MPL_IMAGE.jpg", bbox_inches='tight', pad_inches=0)
        # plt.close()

        # 5) Hae profiilit (try/except jätetty ennalleen)
        try:
            us = Ultrasound.objects.get(instance=instance_value)
            horiz_prof = us.horiz_prof or []
            vert_prof  = us.vert_prof  or []
            u_low      = us.u_low      or []
            s_depth    = us.s_depth
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


        # return JsonResponse({
        #     "image":      img_b64,                        # nyt string!
        #     "mime":       "image/png",                    # kerro frontendille
        #     "horiz_prof": horiz_prof,
        #     "vert_prof":  vert_prof,
        #     "u_low":      u_low,
        #     "s_depth":    s_depth,
        #     "u_cov":      u_cov,
        #     "u_skew":     u_skew,
        # })
        
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
        import traceback; traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)






@require_POST
@csrf_exempt  # Poista tämä tuotannossa ja käytä CSRF-tokenia JavaScriptissä
def ask_ai(request):
    print("DEBUG: Pyyntö vastaanotettu:", request.method)
    try:
        data = json.loads(request.body)
        print("DEBUG: Pyynnön data:", data)
        question = data.get("question", "").strip()

        if not question:
            return JsonResponse({"answer": "Kysymys puuttuu."}, status=400)

        # Kutsutaan GPT-mallia
        answer = generate_response(question)
        return JsonResponse({"answer": answer})

    except Exception as e:
        return JsonResponse({"answer": f"Virhe: {str(e)}"}, status=500)
    




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
            print(f"Päivitettiin kaikki '{old}' → '{new}'")

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
                    print(f"Virheellinen päivämäärä rivillä {row['pk']}: {date_val}")
                    # Säilytetään aiempi päivämäärä
            else:
                print(f"Tyhjä päivämäärä rivillä {row['pk']}, säilytetään vanha arvo.")

            print(f"Tallennetaan pk={us.pk}, seriesdate={us.seriesdate}, s_depth={us.s_depth}")
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










