from django.db import models

class Ultrasound(models.Model):
    contentdate = models.CharField(max_length=32)
    contenttime = models.CharField(max_length=32)
    deviceserialnumber = models.CharField(max_length=64)
    instancenumber = models.CharField(max_length=64)
    institutionname = models.CharField(max_length=255)
    institutionaldepartmentname = models.CharField(max_length=255)
    manufacturer = models.CharField(max_length=255)
    manufacturermodelname = models.CharField(max_length=255)
    modality = models.CharField(max_length=64)
    patientid = models.CharField(max_length=64)
    patientname = models.CharField(max_length=255)
    sopclassuid = models.CharField(max_length=64)
    sopinstanceuid = models.CharField(max_length=64)
    seriesdate = models.CharField(max_length=32)
    seriesinstanceuid = models.CharField(max_length=64)
    seriesnumber = models.CharField(max_length=64)
    seriestime = models.CharField(max_length=32)
    stationname = models.CharField(max_length=255)
    studydate = models.CharField(max_length=32)
    studyid = models.CharField(max_length=64)
    instance = models.CharField(max_length=64)
    studytime = models.CharField(max_length=32)
    tranducertype = models.CharField(max_length=255)
    serie = models.CharField(max_length=255)
    s_depth = models.FloatField()
    u_cov = models.FloatField()
    u_skew = models.FloatField()
    u_low = models.JSONField(null=True, blank=True)
    horiz_prof = models.JSONField(null=True, blank=True)
    vert_prof = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'ultrasound'

    def __str__(self):
        return (
            f"contentdate={self.contentdate}, contenttime={self.contenttime}, deviceserialnumber={self.deviceserialnumber}, "
            f"instancenumber={self.instancenumber}, institutionname={self.institutionname}, "
            f"institutionaldepartmentname={self.institutionaldepartmentname}, manufacturer={self.manufacturer}, "
            f"manufacturermodelname={self.manufacturermodelname}, modality={self.modality}, "
            f"patientid={self.patientid}, patientname={self.patientname}, sopclassuid={self.sopclassuid}, "
            f"sopinstanceuid={self.sopinstanceuid}, seriesdate={self.seriesdate}, seriesinstanceuid={self.seriesinstanceuid}, "
            f"seriesnumber={self.seriesnumber}, seriestime={self.seriestime}, stationname={self.stationname}, "
            f"studydate={self.studydate}, studyid={self.studyid}, studyinstanceuid={self.instance}, "
            f"studytime={self.studytime}, tranducertype={self.tranducertype}, serie={self.serie}, "
            f"s_depth={self.s_depth}, u_cov={self.u_cov}, u_skew={self.u_skew}"
        )


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
