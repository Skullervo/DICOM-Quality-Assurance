# from django.contrib import admin
# from .models import Ultrasound

# class UltrasoundAdmin(admin.ModelAdmin):
#     list_display = (
#         'institutionaldepartmentname',
#         'institutionname',
#         's_depth',
#         'u_cov',
#         'u_skew',
#         'stationname',
#         'manufacturer',
#         'modality',
#         'instance',
#         'seriesdate',
#     )

# admin.site.register(Ultrasound, UltrasoundAdmin)


# from django.contrib import admin
# from .models import Ultrasound

# @admin.register(Ultrasound)
# class UltrasoundAdmin(admin.ModelAdmin):
#     list_display = (
#         'institutionaldepartmentname',
#         'institutionname',
#         's_depth',
#         'u_cov',
#         'u_skew',
#         'stationname',
#         'manufacturer',
#         'modality',
#         'instance',
#         'seriesdate',
#     )
#     list_display_links = (
#         'institutionaldepartmentname',  # <-- Klikattava kenttä rivillä
#     )


# from django.contrib import admin
# from .models import Ultrasound

# @admin.register(Ultrasound)
# class UltrasoundAdmin(admin.ModelAdmin):
#     list_display = (
#         'institutionaldepartmentname',
#         'institutionname',
#         'stationname',
#         'manufacturer',
#         'modality',
#         'instance',
#         'seriesdate',
#         's_depth',
#         'u_cov',
#         'u_skew',
#     )
#     list_display_links = ('institutionaldepartmentname','institutionname','stationname','manufacturer',)  # Klikattavat kentät rivillä

#     def save_model(self, request, obj, form, change):
#         if change:
#             # Tarkistetaan, onko kentän arvo muuttunut
#             old_obj = Ultrasound.objects.get(pk=obj.pk)
#             if old_obj.institutionaldepartmentname != obj.institutionaldepartmentname:
#                 # Päivitetään kaikki rivit, joissa on sama vanha arvo
#                 Ultrasound.objects.filter(
#                     institutionaldepartmentname=old_obj.institutionaldepartmentname
#                 ).update(institutionaldepartmentname=obj.institutionaldepartmentname)
#         super().save_model(request, obj, form, change)



from django.contrib import admin
from .models import Ultrasound, Transducer


@admin.register(Ultrasound)
class UltrasoundAdmin(admin.ModelAdmin):
    list_display = (
        'institutionaldepartmentname',
        'institutionname',
        'stationname',
        'manufacturer',
        'modality',
        'instance',
        'seriesdate',
        's_depth',
        'u_cov',
        'u_skew',
    )
    list_display_links = ('institutionaldepartmentname','institutionname','stationname','manufacturer',)

    def save_model(self, request, obj, form, change):
        if change:
            old_obj = Ultrasound.objects.get(pk=obj.pk)
            if old_obj.institutionaldepartmentname != obj.institutionaldepartmentname:
                Ultrasound.objects.filter(
                    institutionaldepartmentname=old_obj.institutionaldepartmentname
                ).update(institutionaldepartmentname=obj.institutionaldepartmentname)
        super().save_model(request, obj, form, change)


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



