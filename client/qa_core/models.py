from django.db import models

class Ultrasound(models.Model):
    """Ultraäänitutkimuksen laatutarkastustulokset"""
    id = models.AutoField(primary_key=True)
    instance = models.TextField(unique=True, help_text="DICOM instance identifier")
    series_id = models.TextField(help_text="DICOM series identifier", db_column='series_id')
    processed_at = models.DateTimeField(auto_now_add=True, db_column='processed_at')
    
    # DICOM metadata - using legacy database column names that actually exist
    contentdate = models.TextField(blank=True, db_column='contentdate')
    contenttime = models.TextField(blank=True, db_column='contenttime')
    deviceserialnumber = models.TextField(blank=True, db_column='deviceserialnumber')
    instancenumber = models.TextField(blank=True, db_column='instancenumber')
    institutionname = models.TextField(blank=True, db_column='institutionname')
    institutionaldepartmentname = models.TextField(blank=True, db_column='institutionaldepartmentname')
    manufacturer = models.TextField(blank=True)
    manufacturermodelname = models.TextField(blank=True, db_column='manufacturermodelname')
    modality = models.TextField(blank=True)
    patientid = models.TextField(blank=True, db_column='patientid')
    patientname = models.TextField(blank=True, db_column='patientname')
    stationname = models.TextField(blank=True, db_column='stationname')
    seriesdate = models.TextField(blank=True, db_column='seriesdate')
    studydate = models.TextField(blank=True, db_column='studydate')
    tranducertype = models.TextField(blank=True, db_column='tranducertype')
    
    # Ultraäänianalyysin tulokset
    s_depth = models.FloatField(null=True, blank=True, help_text="Syvyysresoluutio")
    u_cov = models.FloatField(null=True, blank=True, help_text="Tasaisuus")
    u_skew = models.FloatField(null=True, blank=True, help_text="Vinouma")
    u_low = models.JSONField(null=True, blank=True, help_text="Matalataso kontrastit")
    horiz_prof = models.JSONField(null=True, blank=True, help_text="Horisontaaliprofiili")
    vert_prof = models.JSONField(null=True, blank=True, help_text="Vertikaaliprofiilit")

    class Meta:
        db_table = 'ultrasound'
        verbose_name = "Ultraääni QA"
        verbose_name_plural = "Ultraääni QA-tulokset"
        ordering = ['-processed_at']

    def __str__(self):
        return f"{self.stationname} - {self.studydate} ({self.instance[:8]})"


class XrayAnalysis(models.Model):
    """Röntgenkuvien NORMI-13 phantom laatutarkastustulokset"""
    id = models.AutoField(primary_key=True)
    instance = models.TextField(unique=True, help_text="DICOM instance identifier")
    series_id = models.TextField(help_text="DICOM series identifier") 
    processed_at = models.DateTimeField(auto_now_add=True)
    
    # DICOM metadata
    content_date = models.TextField(blank=True)
    content_time = models.TextField(blank=True)
    device_serial_number = models.TextField(blank=True)
    instance_number = models.TextField(blank=True)
    institution_name = models.TextField(blank=True)
    institutional_department_name = models.TextField(blank=True)
    manufacturer = models.TextField(blank=True)
    manufacturer_model_name = models.TextField(blank=True)
    modality = models.TextField(blank=True)
    patient_id = models.TextField(blank=True)
    patient_name = models.TextField(blank=True)
    station_name = models.TextField(blank=True)
    series_date = models.TextField(blank=True)
    study_date = models.TextField(blank=True)
    
    # X-ray specific parameters
    kvp = models.TextField(blank=True, help_text="Putken jännite")
    exposure_time = models.TextField(blank=True, help_text="Valotusaika")
    tube_current = models.TextField(blank=True, help_text="Putken virta")
    filter_type = models.TextField(blank=True, help_text="Suodatin")
    grid_info = models.TextField(blank=True, help_text="Karkeusritilä")
    distance_source_to_detector = models.TextField(blank=True, help_text="Lähde-detektori etäisyys (mm)")
    focal_spot = models.TextField(blank=True, help_text="Fokuskoko")
    protocol_name = models.TextField(blank=True, help_text="Kuvausprotokolla")
    exposure_mAs = models.TextField(blank=True, help_text="Kokonaisvalotus (mAs)")

    # NORMI-13 Phantom Analysis Results
    uniformity_center = models.FloatField(null=True, blank=True, help_text="Tasaisuus keskialue")
    uniformity_deviation = models.FloatField(null=True, blank=True, help_text="Tasaisuuden poikkeama")
    bg_mean = models.FloatField(null=True, blank=True, help_text="Tausta keskiarvo")
    
    # High contrast Cu wedge measurements (mean + std)
    cu_000_mean = models.FloatField(null=True, blank=True, help_text="Cu 0.0mm kiila")
    cu_030_mean = models.FloatField(null=True, blank=True, help_text="Cu 0.3mm kiila")
    cu_065_mean = models.FloatField(null=True, blank=True, help_text="Cu 0.65mm kiila")
    cu_100_mean = models.FloatField(null=True, blank=True, help_text="Cu 1.0mm kiila")
    cu_140_mean = models.FloatField(null=True, blank=True, help_text="Cu 1.4mm kiila")
    cu_185_mean = models.FloatField(null=True, blank=True, help_text="Cu 1.85mm kiila")
    cu_230_mean = models.FloatField(null=True, blank=True, help_text="Cu 2.3mm kiila")
    cu_000_std = models.FloatField(null=True, blank=True, help_text="Cu 0.0mm hajonta")
    cu_030_std = models.FloatField(null=True, blank=True, help_text="Cu 0.3mm hajonta")
    cu_065_std = models.FloatField(null=True, blank=True, help_text="Cu 0.65mm hajonta")
    cu_100_std = models.FloatField(null=True, blank=True, help_text="Cu 1.0mm hajonta")
    cu_140_std = models.FloatField(null=True, blank=True, help_text="Cu 1.4mm hajonta")
    cu_185_std = models.FloatField(null=True, blank=True, help_text="Cu 1.85mm hajonta")
    cu_230_std = models.FloatField(null=True, blank=True, help_text="Cu 2.3mm hajonta")
    
    # Low contrast measurements
    lc_08_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 0.8%")
    lc_12_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 1.2%")
    lc_20_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 2.0%")
    lc_28_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 2.8%")
    lc_40_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 4.0%")
    lc_56_contrast = models.FloatField(null=True, blank=True, help_text="Matala kontrasti 5.6%")
    low_contrast_details = models.JSONField(null=True, blank=True, help_text="LC ROI:den yksityiskohdat (kontrasti, CNR, näkyvyys per ROI)")

    # Quality metrics
    median_contrast = models.FloatField(null=True, blank=True, help_text="Mediaani kontrasti")
    median_cnr = models.FloatField(null=True, blank=True, help_text="Mediaani CNR")
    mtf_50_percent = models.FloatField(null=True, blank=True, help_text="MTF 50% raja")
    num_contrast_rois_seen = models.IntegerField(null=True, blank=True, help_text="Näkyvien ROI:den määrä")
    
    # Phantom geometry
    phantom_angle = models.FloatField(null=True, blank=True, help_text="Phantom kulma")
    phantom_center_x = models.FloatField(null=True, blank=True, help_text="Phantom keskipiste X")
    phantom_center_y = models.FloatField(null=True, blank=True, help_text="Phantom keskipiste Y")
    phantom_area = models.FloatField(null=True, blank=True, help_text="Phantom alue")
    side_length = models.FloatField(null=True, blank=True, help_text="Sivun pituus")
    
    # MTF data (JSON for complex data)
    mtf_data = models.JSONField(null=True, blank=True, help_text="MTF mittausdata")
    
    # Analysis metadata
    analysis_type = models.TextField(blank=True, help_text="Analyysin tyyppi")
    analysis_version = models.TextField(blank=True, help_text="Analyysin versio")
    processing_time = models.FloatField(null=True, blank=True, help_text="Käsittelyaika sekunteina")

    # Analyysikuvat (PNG tavuina)
    contrast_rois_image = models.BinaryField(null=True, blank=True, help_text="ROI-kartta PNG (tumma, kaikki ROI:t)")
    mtf_lp_image = models.BinaryField(null=True, blank=True, help_text="MTF-viivapari kuva PNG")
    mtf_curve_image = models.BinaryField(null=True, blank=True, help_text="MTF-käyrä PNG (dark-teema)")

    class Meta:
        db_table = 'xray_analysis'
        verbose_name = "Röntgen QA"
        verbose_name_plural = "Röntgen QA-tulokset (NORMI-13)"
        ordering = ['-processed_at']

    def __str__(self):
        return f"{self.station_name} - {self.modality} - {self.study_date} ({self.instance[:8]})"


class CTAnalysis(models.Model):
    """CT-fantomin laadunvalvontatulokset (Catphan / Siemens)"""
    id = models.AutoField(primary_key=True)
    instance = models.TextField(unique=True, help_text="DICOM instance identifier")
    series_id = models.TextField(help_text="DICOM series identifier")
    processed_at = models.DateTimeField(auto_now_add=True)

    # DICOM metadata
    content_date = models.TextField(blank=True)
    content_time = models.TextField(blank=True)
    device_serial_number = models.TextField(blank=True)
    instance_number = models.TextField(blank=True)
    institution_name = models.TextField(blank=True)
    institutional_department_name = models.TextField(blank=True)
    manufacturer = models.TextField(blank=True)
    manufacturer_model_name = models.TextField(blank=True)
    modality = models.TextField(blank=True)
    patient_id = models.TextField(blank=True)
    patient_name = models.TextField(blank=True)
    station_name = models.TextField(blank=True)
    series_date = models.TextField(blank=True)
    study_date = models.TextField(blank=True)

    # CT-kuvausparametrit
    kvp = models.TextField(blank=True, help_text="Putken jännite (kV)")
    tube_current = models.TextField(blank=True, help_text="Putken virta (mA)")
    exposure_time = models.TextField(blank=True, help_text="Valotusaika")
    exposure_mAs = models.TextField(blank=True, help_text="Kokonaisvalotus (mAs)")
    slice_thickness = models.FloatField(null=True, blank=True, help_text="Leikepaksuus (mm)")
    slice_spacing = models.FloatField(null=True, blank=True, help_text="Leikkeiden välinen etäisyys (mm)")
    reconstruction_kernel = models.TextField(blank=True, help_text="Rekonstruktiosuodatin")
    reconstruction_algorithm = models.TextField(blank=True, help_text="Rekonstruktioalgoritmi")
    ctdi_vol = models.FloatField(null=True, blank=True, help_text="CTDIvol (mGy)")
    dlp = models.FloatField(null=True, blank=True, help_text="DLP (mGy·cm)")

    # Fantomikonfiguraatio
    phantom_model = models.TextField(blank=True, help_text="Fantomin malli (CatPhan504, SiemensCT, jne.)")
    phantom_roll_deg = models.FloatField(null=True, blank=True, help_text="Fantomin kiertymä (°)")
    origin_slice = models.IntegerField(null=True, blank=True, help_text="HU-moduulin leike")
    num_images = models.IntegerField(null=True, blank=True, help_text="Analysoitujen leikkeiden lukumäärä")

    # CTP404: HU-lineaarisuus
    hu_air = models.FloatField(null=True, blank=True, help_text="Ilma HU")
    hu_pmp = models.FloatField(null=True, blank=True, help_text="PMP HU")
    hu_ldpe = models.FloatField(null=True, blank=True, help_text="LDPE HU")
    hu_poly = models.FloatField(null=True, blank=True, help_text="Polystyreeni HU")
    hu_acrylic = models.FloatField(null=True, blank=True, help_text="Akryyli HU")
    hu_delrin = models.FloatField(null=True, blank=True, help_text="Delrin HU")
    hu_teflon = models.FloatField(null=True, blank=True, help_text="Teflon HU")
    slice_thickness_mm = models.FloatField(null=True, blank=True, help_text="Mitattu leikepaksuus (mm)")
    ctp404_pass = models.BooleanField(null=True, blank=True, help_text="CTP404-moduuli hyväksytty")

    # CTP486: Uniformiteetti
    uniformity_index = models.FloatField(null=True, blank=True, help_text="Uniformiteetti-indeksi (%)")
    integral_non_uniformity = models.FloatField(null=True, blank=True, help_text="Integraalinen epätasaisuus")
    hu_center = models.FloatField(null=True, blank=True, help_text="Keskipiste HU")
    hu_top = models.FloatField(null=True, blank=True, help_text="Yläosa HU")
    hu_right = models.FloatField(null=True, blank=True, help_text="Oikea puoli HU")
    hu_bottom = models.FloatField(null=True, blank=True, help_text="Alaosa HU")
    hu_left = models.FloatField(null=True, blank=True, help_text="Vasen puoli HU")
    ctp486_pass = models.BooleanField(null=True, blank=True, help_text="CTP486-moduuli hyväksytty")

    # CTP528: Spatiaalinen resoluutio (MTF)
    mtf_50_percent = models.FloatField(null=True, blank=True, help_text="MTF 50% (lp/cm)")
    mtf_10_percent = models.FloatField(null=True, blank=True, help_text="MTF 10% (lp/cm)")
    mtf_data = models.JSONField(null=True, blank=True, help_text="MTF-käyrä (JSON)")
    ctp528_pass = models.BooleanField(null=True, blank=True, help_text="CTP528-moduuli hyväksytty")

    # CTP515: Matala kontrasti
    num_low_contrast_rois_seen = models.IntegerField(null=True, blank=True, help_text="Näkyvien matalan kontrastin ROI:den määrä")
    median_cnr = models.FloatField(null=True, blank=True, help_text="Mediaani CNR")
    low_contrast_details = models.JSONField(null=True, blank=True, help_text="Matalan kontrastin ROI-yksityiskohdat")
    ctp515_pass = models.BooleanField(null=True, blank=True, help_text="CTP515-moduuli hyväksytty")

    # Kokonaistulos ja kohina
    overall_pass = models.BooleanField(null=True, blank=True, help_text="Kokonaistulos hyväksytty")
    noise_hu_std = models.FloatField(null=True, blank=True, help_text="Kohinataso (HU keskihajonta)")

    # Analyysimetadata
    analysis_type = models.CharField(max_length=50, default='CatPhan', blank=True, help_text="Analyysityyppi")
    analysis_version = models.TextField(blank=True, help_text="Analyysikoodin versio (pylinac)")
    processing_time = models.FloatField(null=True, blank=True, help_text="Käsittelyaika (s)")

    # Leikekuvat (oikeat CT-leikkeet ROI-merkinnöillä, PNG tavuina)
    summary_image = models.BinaryField(null=True, blank=True, help_text="Yhteenvetokuva PNG (ei käytössä)")
    hu_linearity_image = models.BinaryField(null=True, blank=True, help_text="CTP404 leikekuva PNG (vain HU materiaali-ROI:t)")
    thickness_image = models.BinaryField(null=True, blank=True, help_text="CTP404 leikekuva PNG (vain leikepaksuus-ramppi-ROI:t)")
    uniformity_image = models.BinaryField(null=True, blank=True, help_text="CTP486 leikekuva PNG")
    mtf_image = models.BinaryField(null=True, blank=True, help_text="CTP528 leikekuva PNG")
    low_contrast_image = models.BinaryField(null=True, blank=True, help_text="CTP515 leikekuva PNG")

    # Analyysikuvaajat (matplotlib-kaaviot, PNG tavuina)
    hu_linearity_chart_image = models.BinaryField(null=True, blank=True, help_text="HU-lineaarisuus scatter plot PNG")
    mtf_chart_image = models.BinaryField(null=True, blank=True, help_text="MTF-käyrä PNG")
    uniformity_profile_image = models.BinaryField(null=True, blank=True, help_text="Uniformiteettiprofiilit PNG")
    side_view_image = models.BinaryField(null=True, blank=True, help_text="Sivunäkymä PNG")

    class Meta:
        db_table = 'ct_analysis'
        verbose_name = "CT QA"
        verbose_name_plural = "CT QA-tulokset (CatPhan/Siemens)"
        ordering = ['-processed_at']

    def __str__(self):
        return f"{self.station_name} - {self.phantom_model} - {self.content_date}"


class Transducer(models.Model):
    row_index = models.IntegerField(primary_key=True)
    model_name = models.TextField()
    manufacturer = models.TextField()
    rcx0 = models.IntegerField()
    rcy0 = models.IntegerField()
    rcx1 = models.IntegerField()
    rcy1 = models.IntegerField()
    phys_units_x = models.IntegerField()
    phys_units_y = models.IntegerField()
    phys_delta_x = models.FloatField()
    phys_delta_y = models.FloatField()
    transducer_name = models.TextField()

    class Meta:
        db_table = 'transducers'

    def __str__(self):
        return f"{self.model_name} - {self.transducer_name}"


class Institution(models.Model):
    """Terveydenhuollon organisaatio / sairaanhoitopiiri"""
    name = models.CharField(max_length=255, unique=True)
    region = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    contact_info = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'institutions'
        ordering = ['name']

    def __str__(self):
        return self.name


class Device(models.Model):
    """Kuvantamislaite (ultraääni, röntgen, TT)"""
    MODALITY_CHOICES = [
        ('US', 'Ultraääni'),
        ('XR', 'Röntgen'),
        ('CT', 'TT'),
    ]

    station_name = models.CharField(max_length=255)
    serial_number = models.CharField(max_length=255, blank=True)
    manufacturer = models.CharField(max_length=255, blank=True)
    model_name = models.CharField(max_length=255, blank=True)
    institution = models.ForeignKey(
        Institution, on_delete=models.CASCADE, related_name='devices'
    )
    department = models.CharField(max_length=255, blank=True)
    modality_type = models.CharField(max_length=2, choices=MODALITY_CHOICES)
    commissioned_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'devices'
        unique_together = ['station_name', 'serial_number']

    def __str__(self):
        return f"{self.station_name} ({self.manufacturer} {self.model_name})"


class ToleranceConfig(models.Model):
    """QA-mittauksen toleranssirajat laitteelle"""
    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name='tolerances'
    )
    metric_name = models.CharField(max_length=100)
    reference_value = models.FloatField(null=True, blank=True)
    warning_limit = models.FloatField()
    action_limit = models.FloatField()
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_by = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'tolerance_configs'

    def __str__(self):
        return f"{self.device.station_name} - {self.metric_name}"


class AuditLog(models.Model):
    """Muutosloki jäljitettävyyttä varten"""
    user = models.CharField(max_length=150)
    action = models.CharField(max_length=50)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=100)
    field_name = models.CharField(max_length=100, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.timestamp} - {self.user} - {self.action} {self.model_name}"
