from django.db import models

class Ultrasound(models.Model):
    s_depth = models.FloatField()  # Liukuluku
    u_cov = models.FloatField()  # Liukuluku
    u_skew = models.FloatField()  # Liukuluku
    stationname = models.CharField(max_length=255)  # Lisää tämä kenttä, jos se ei ole vielä olemassa
    institutionname = models.CharField(max_length=255)  # Lisää oletusarvo
    institutionaldepartmentname = models.CharField(max_length=255)  # Lisää tämä rivi, jos sitä ei ole
    manufacturer = models.CharField(max_length=255)
    modality = models.CharField(max_length=255) 
    instance = models.CharField(max_length=255)  # Käytä tätä kenttää instanssin ID:lle
    seriesdate = models.DateField()  # Käytä tätä kenttää sarjan päivämäärälle

    class Meta:
        db_table = 'ultrasound'  # Käytä olemassa olevan taulun nimeä

    def __str__(self):
        return (f"{self.institutionaldepartmentname}, {self.institutionname}, {self.s_depth}, "
                f"{self.u_cov}, {self.u_skew}, {self.stationname}, {self.manufacturer}, "
                f"{self.modality}, {self.instance}, {self.seriesdate}")