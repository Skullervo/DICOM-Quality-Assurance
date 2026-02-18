from django.contrib import admin
from .models import Ultrasound, Transducer, XrayAnalysis


@admin.register(Ultrasound)
class UltrasoundAdmin(admin.ModelAdmin):
    """Admin interface ultraääni QA-tuloksille"""
    list_display = (
        'id',
        'instance',
        'series_id',
        'processed_at',
        # DICOM metadata - kaikki kentät
        'contentdate',
        'contenttime',
        'deviceserialnumber',
        'instancenumber',
        'institutionname',
        'institutionaldepartmentname',
        'manufacturer',
        'manufacturermodelname',
        'modality',
        'patientid',
        'patientname',
        'stationname',
        'seriesdate',
        'studydate',
        'tranducertype',
        # Analyysitulokset - näytetään vain numeeriset arvot, ei pitkiä arrayita
        's_depth',
        'u_cov',
        'u_skew',
        # Huom: u_low, horiz_prof, vert_prof piilotettu listasta - näkyvät detail-sivulla
    )
    list_display_links = ('id', 'instance')
    list_filter = (
        'modality',
        'manufacturer',
        'stationname',
        'institutionname',
        'processed_at',
        'studydate',
    )
    search_fields = (
        'stationname',
        'institutionname', 
        'manufacturer',
        'patientid',
        'instance',
        'series_id',
    )
    readonly_fields = (
        'id',
        'instance',
        'series_id',
        'processed_at',
    )
    fieldsets = (
        ('Perustiedot', {
            'fields': ('id', 'instance', 'series_id', 'processed_at')
        }),
        ('DICOM Metadata (Kaikki kentät)', {
            'fields': ('contentdate', 'contenttime', 'deviceserialnumber', 'instancenumber',
                      'institutionname', 'institutionaldepartmentname', 'manufacturer',
                      'manufacturermodelname', 'modality', 'patientid', 'patientname', 
                      'stationname', 'seriesdate', 'studydate', 'tranducertype'),
            'classes': ['collapse']
        }),
        ('QA Analyysitulokset', {
            'fields': ('s_depth', 'u_cov', 'u_skew', 'u_low', 'horiz_prof', 'vert_prof'),
            'description': 'Ultraäänianalyysin tulokset: syvyysresoluutio, tasaisuus ja profiilit'
        })
    )
    
    # Lisää sarakkeita listaan
    list_per_page = 25
    
    def get_queryset(self, request):
        """Optimoi tietokantahaut"""
        return super().get_queryset(request).order_by('-processed_at')

    def save_model(self, request, obj, form, change):
        """Lisätoiminnallisuus tallennukselle"""
        if change:
            # Voit lisätä mukautettua logiikkaa tähän tarvittaessa
            pass
        super().save_model(request, obj, form, change)
    
    def get_short_json_display(self, obj, field_name, max_length=50):
        """Näyttää JSON-kentän lyhennettynä"""
        value = getattr(obj, field_name)
        if value:
            json_str = str(value)
            if len(json_str) > max_length:
                return f"{json_str[:max_length]}... ({len(json_str)} chars)"
            return json_str
        return "-"
    
    def short_u_low(self, obj):
        """Lyhyt versio u_low kentästä"""
        return self.get_short_json_display(obj, 'u_low')
    short_u_low.short_description = 'U_low (short)'
    
    def short_horiz_prof(self, obj):
        """Lyhyt versio horiz_prof kentästä"""
        return self.get_short_json_display(obj, 'horiz_prof')
    short_horiz_prof.short_description = 'Horiz Profile (short)'


@admin.register(XrayAnalysis)
class XrayAnalysisAdmin(admin.ModelAdmin):
    """Admin interface röntgen QA-tuloksille (NORMI-13 phantom)"""
    list_display = (
        'id',
        'instance',
        'series_id',
        'processed_at',
        # DICOM metadata - kaikki kentät
        'content_date',
        'content_time',
        'device_serial_number',
        'instance_number',
        'institution_name',
        'institutional_department_name',
        'manufacturer',
        'manufacturer_model_name',
        'modality',
        'patient_id',
        'patient_name',
        'station_name',
        'series_date',
        'study_date',
        # X-ray specific parameters - kaikki kentät
        'kvp',
        'exposure_time',
        'tube_current',
        'filter_type',
        'grid_info',
        # NORMI-13 Phantom Analysis Results - kaikki kentät
        'uniformity_center',
        'uniformity_deviation',
        'bg_mean',
        # High contrast Cu wedge measurements - kaikki kentät
        'cu_000_mean',
        'cu_030_mean',
        'cu_065_mean',
        'cu_100_mean',
        'cu_140_mean',
        'cu_185_mean',
        'cu_230_mean',
        # Low contrast measurements - kaikki kentät
        'lc_08_contrast',
        'lc_12_contrast',
        'lc_20_contrast',
        'lc_28_contrast',
        'lc_40_contrast',
        'lc_56_contrast',
        # Quality metrics - kaikki kentät
        'median_contrast',
        'median_cnr',
        'mtf_50_percent',
        'num_contrast_rois_seen',
        # Phantom geometry - kaikki kentät
        'phantom_angle',
        'phantom_center_x',
        'phantom_center_y',
        'phantom_area',
        'side_length',
        # MTF data & Analysis metadata - kaikki kentät
        'mtf_data',
        'analysis_type',
        'analysis_version',
        'processing_time',
    )
    list_display_links = ('id', 'instance')
    list_filter = (
        'modality',
        'manufacturer',
        'station_name',
        'institution_name', 
        'processed_at',
        'study_date',
        'analysis_type',
    )
    search_fields = (
        'station_name',
        'institution_name',
        'manufacturer',
        'patient_id',
        'instance',
        'series_id',
    )
    readonly_fields = (
        'id',
        'instance',
        'series_id',
        'processed_at',
        'analysis_version',
    )
    fieldsets = (
        ('Perustiedot', {
            'fields': ('id', 'instance', 'series_id', 'processed_at')
        }),
        ('DICOM Metadata', {
            'fields': ('institution_name', 'institutional_department_name', 'station_name',
                      'manufacturer', 'manufacturer_model_name', 'modality',
                      'patient_id', 'patient_name', 'study_date', 'series_date',
                      'device_serial_number'),
            'classes': ['collapse']
        }),
        ('Röntgentek. parametrit', {
            'fields': ('kvp', 'exposure_time', 'tube_current', 'filter_type', 'grid_info'),
            'classes': ['collapse']
        }),
        ('NORMI-13 Uniformity', {
            'fields': ('uniformity_center', 'uniformity_deviation', 'bg_mean'),
            'description': 'Tasaisuusmittaukset 5 ROI:sta'
        }),
        ('High Contrast (Cu kiilat)', {
            'fields': ('cu_000_mean', 'cu_030_mean', 'cu_065_mean', 'cu_100_mean',
                      'cu_140_mean', 'cu_185_mean', 'cu_230_mean'),
            'description': '7 kupari-kiilaa: 0.00mm - 2.30mm',
            'classes': ['collapse']
        }),
        ('Low Contrast', {
            'fields': ('lc_08_contrast', 'lc_12_contrast', 'lc_20_contrast',
                      'lc_28_contrast', 'lc_40_contrast', 'lc_56_contrast',
                      'median_contrast', 'median_cnr', 'num_contrast_rois_seen'),
            'description': 'Matala kontrastimittaukset: 0.8% - 5.6%'
        }),
        ('MTF Spatial Resolution', {
            'fields': ('mtf_50_percent', 'mtf_data'),
            'description': 'Modulation Transfer Function tulokset',
            'classes': ['collapse']
        }),
        ('Phantom Geometry', {
            'fields': ('phantom_angle', 'phantom_center_x', 'phantom_center_y',
                      'phantom_area', 'side_length'),
            'description': 'Phantom sijainti ja geometria',
            'classes': ['collapse']
        }),
        ('Analyysi metadata', {
            'fields': ('analysis_type', 'analysis_version', 'processing_time'),
            'classes': ['collapse']
        })
    )
    
    list_per_page = 25
    
    def get_queryset(self, request):
        """Järjestä käsittelyäjan mukaan"""
        return super().get_queryset(request).order_by('-processed_at')
    fieldsets = (
        ('Perustiedot', {
            'fields': ('instance', 'series_id', 'processed_at')
        }),
        ('DICOM Metadata', {
            'fields': ('institution_name', 'institutional_department_name', 'station_name',
                      'manufacturer', 'manufacturer_model_name', 'modality',
                      'patient_id', 'patient_name', 'study_date', 'series_date',
                      'device_serial_number'),
            'classes': ['collapse']
        }),
        ('Kuvausparametrit', {
            'fields': ('kvp', 'exposure_time', 'tube_current', 'filter_type', 'grid_info'),
            'classes': ['collapse']
        }),
        ('NORMI-13 Phantom Tulokset', {
            'fields': ('uniformity_center', 'uniformity_deviation', 'bg_mean'),
        }),
        ('Cu-kiila mittaukset (Korkea kontrasti)', {
            'fields': ('cu_000_mean', 'cu_030_mean', 'cu_065_mean', 'cu_100_mean',
                      'cu_140_mean', 'cu_185_mean', 'cu_230_mean'),
            'classes': ['collapse']
        }),
        ('Matala kontrasti mittaukset', {
            'fields': ('lc_08_contrast', 'lc_12_contrast', 'lc_20_contrast',
                      'lc_28_contrast', 'lc_40_contrast', 'lc_56_contrast'),
            'classes': ['collapse']
        }),
        ('Laatumittarit', {
            'fields': ('median_contrast', 'median_cnr', 'mtf_50_percent', 'num_contrast_rois_seen')
        }),
        ('Phantom geometria', {
            'fields': ('phantom_angle', 'phantom_center_x', 'phantom_center_y', 
                      'phantom_area', 'side_length'),
            'classes': ['collapse']
        }),
        ('MTF Data & Metadata', {
            'fields': ('mtf_data', 'analysis_type', 'analysis_version', 'processing_time'),
            'classes': ['collapse']
        })
    )


@admin.register(Transducer)
class TransducerAdmin(admin.ModelAdmin):
    list_display = (
        'model_name',
        'manufacturer',
        'rcx0',
        'rcy0',
        'rcx1',
        'rcy1',
        'phys_units_x',
        'phys_units_y',
        'phys_delta_x',
        'phys_delta_y',
        'transducer_name',
    )
    list_display_links = (
        'model_name',
        'manufacturer',
        'transducer_name',
    )

    def save_model(self, request, obj, form, change):
        if change:
            old_obj = Transducer.objects.get(pk=obj.pk)
            if old_obj.model_name != obj.model_name:
                Transducer.objects.filter(
                    model_name=old_obj.model_name
                ).update(model_name=obj.model_name)
        super().save_model(request, obj, form, change)



