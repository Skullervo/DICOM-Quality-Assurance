from django.db import models


class Project(models.Model):
    """Arkkitehtuuriprojekti — kokoelma palveluita, layereitä ja yhteyksiä."""

    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=500, blank=True)
    is_default = models.BooleanField(default=False, help_text='Oletusnäkymä (Dashboard)')
    svg_width = models.IntegerField(default=1100)
    svg_height = models.IntegerField(default=560)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'platform_projects'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_default': self.is_default,
            'svg_width': self.svg_width,
            'svg_height': self.svg_height,
        }


class ProjectLayer(models.Model):
    """Kerros arkkitehtuurikaaviossa (esim. Data Processing, Presentation)."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='layers')
    name = models.CharField(max_length=50, help_text='Tekninen nimi')
    label = models.CharField(max_length=100, help_text='Näytettävä otsikko')
    order = models.IntegerField(default=0, help_text='Järjestys ylhäältä alas')
    y_position = models.FloatField(default=0, help_text='SVG y-koordinaatti')
    height = models.FloatField(default=100, help_text='SVG korkeus')
    color = models.CharField(max_length=30, blank=True, help_text='Taustaväri (valinnainen)')

    class Meta:
        db_table = 'platform_layers'
        ordering = ['project', 'order']
        unique_together = ['project', 'name']

    def __str__(self):
        return f"{self.project.name} / {self.label}"

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'label': self.label,
            'order': self.order,
            'y': self.y_position,
            'h': self.height,
            'color': self.color,
        }


class PlatformService(models.Model):
    """Rekisteröity palvelu arkkitehtuurikaaviossa."""

    CATEGORY_CHOICES = [
        ('infrastructure', 'Infrastruktuuri'),
        ('microservice', 'Mikropalvelu'),
        ('application', 'Sovellus'),
        ('platform', 'Platform'),
        ('monitoring', 'Monitorointi'),
        ('external', 'Ulkoinen'),
    ]

    LAYER_CHOICES = [
        ('orchestration', 'Orchestration & Monitoring'),
        ('reception', 'Data Reception'),
        ('persistence', 'Data Persistence'),
        ('processing', 'Data Processing'),
        ('presentation', 'Presentation'),
        ('monitoring', 'Monitoring'),
        ('external', 'External'),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='services',
        null=True, blank=True, help_text='Projekti johon palvelu kuuluu',
    )
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    container = models.CharField(max_length=100, blank=True, help_text='Docker-kontin nimi')
    host = models.CharField(max_length=100, blank=True, help_text='Docker-verkon sisäinen nimi')
    port = models.IntegerField(default=0, help_text='Palvelun sisäinen portti')
    host_port = models.IntegerField(default=0, help_text='Host-portti (Windows localhost)')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='microservice')
    layer = models.CharField(max_length=20, choices=LAYER_CHOICES, default='processing')
    layer_ref = models.ForeignKey(
        ProjectLayer, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='services', help_text='Viittaus projektin layeriin',
    )
    url = models.URLField(blank=True, help_text='Selaimen osoite (valinnainen)')

    # SVG-kaavion sijainti (tallennetaan kun käyttäjä raahaa)
    pos_x = models.FloatField(default=100)
    pos_y = models.FloatField(default=100)

    is_active = models.BooleanField(default=True, help_text='Näytetäänkö kaaviossa')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'platform_services'
        ordering = ['category', 'name']
        unique_together = ['project', 'name']

    def __str__(self):
        return f"{self.name} ({self.container})"

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'container': self.container,
            'host': self.host,
            'port': self.port,
            'host_port': self.host_port,
            'category': self.category,
            'layer': self.layer,
            'layer_ref_id': self.layer_ref_id,
            'url': self.url,
            'pos_x': self.pos_x,
            'pos_y': self.pos_y,
            'is_active': self.is_active,
        }


class PlatformConnection(models.Model):
    """Yhteys kahden palvelun välillä."""

    PROTOCOL_CHOICES = [
        ('gRPC', 'gRPC'),
        ('REST API', 'REST API'),
        ('SQL', 'SQL'),
        ('HTTP', 'HTTP'),
        ('DICOM', 'DICOM C-STORE'),
        ('TCP', 'TCP'),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name='connections',
        null=True, blank=True,
    )
    from_service = models.ForeignKey(
        PlatformService, on_delete=models.CASCADE,
        related_name='connections_out',
    )
    to_service = models.ForeignKey(
        PlatformService, on_delete=models.CASCADE,
        related_name='connections_in',
    )
    protocol = models.CharField(max_length=20, choices=PROTOCOL_CHOICES, default='HTTP')
    label = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'platform_connections'
        unique_together = ['from_service', 'to_service', 'protocol']

    def __str__(self):
        return f"{self.from_service.name} → {self.to_service.name} ({self.protocol})"

    def to_dict(self):
        return {
            'id': self.id,
            'from': self.from_service.name,
            'from_id': self.from_service_id,
            'to': self.to_service.name,
            'to_id': self.to_service_id,
            'protocol': self.protocol,
            'label': self.label,
        }
