import socket
import subprocess
import sys
import json
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required


# Rekisteri kaikista AutoQAD-palveluista
SERVICES = [
    {
        'name': 'PostgreSQL',
        'description': 'Tietokanta (QA-results)',
        'host': 'localhost',
        'port': 5432,
        'icon': 'database',
        'category': 'infrastructure',
    },
    {
        'name': 'Orthanc DICOM',
        'description': 'DICOM-palvelin (kuvien vastaanotto)',
        'host': 'localhost',
        'port': 8042,
        'icon': 'server',
        'category': 'infrastructure',
    },
    {
        'name': 'Fetch Service',
        'description': 'Hakee kuvat Orthancista (gRPC :50051)',
        'host': 'localhost',
        'port': 50051,
        'icon': 'arrow-down-circle',
        'category': 'microservice',
    },
    {
        'name': 'US Analyze Service',
        'description': 'Ultraäänianalyysi (gRPC :50052)',
        'host': 'localhost',
        'port': 50052,
        'icon': 'activity',
        'category': 'microservice',
    },
    {
        'name': 'XR Analyze Service',
        'description': 'Röntgenanalyysi NORMI-13 (gRPC :50053)',
        'host': 'localhost',
        'port': 50053,
        'icon': 'zap',
        'category': 'microservice',
    },
    {
        'name': 'CT Analyze Service',
        'description': 'TT-analyysi CatPhan (gRPC :50054)',
        'host': 'localhost',
        'port': 50054,
        'icon': 'cpu',
        'category': 'microservice',
    },
    {
        'name': 'Portainer',
        'description': 'Docker-hallintaportaali',
        'host': 'localhost',
        'port': 9000,
        'icon': 'layers',
        'category': 'platform',
        'url': 'http://localhost:9000',
    },
    {
        'name': 'Grafana',
        'description': 'Monitorointi ja mittarit',
        'host': 'localhost',
        'port': 3000,
        'icon': 'bar-chart-2',
        'category': 'monitoring',
        'url': 'http://localhost:3000',
    },
    {
        'name': 'Prometheus',
        'description': 'Metriikoiden keruu',
        'host': 'localhost',
        'port': 9090,
        'icon': 'trending-up',
        'category': 'monitoring',
    },
]


def _check_port(host, port, timeout=1.0):
    """Tarkistaa onko TCP-portti auki (palvelu käynnissä)."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def _get_docker_containers():
    """Hakee Docker-konttien tilan (toimii Windowsilla WSL:n kautta tai suoraan Linuxilla)."""
    try:
        if sys.platform == 'win32':
            cmd = ['wsl', 'docker', 'ps', '--format', '{{json .}}']
        else:
            cmd = ['docker', 'ps', '--format', '{{json .}}']

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        containers = []
        for line in result.stdout.strip().splitlines():
            if line:
                containers.append(json.loads(line))
        return containers
    except Exception:
        return []


@login_required
def dashboard(request):
    services_with_status = []
    for svc in SERVICES:
        status = _check_port(svc['host'], svc['port'])
        services_with_status.append({
            **svc,
            'running': status,
            'status_label': 'Käynnissä' if status else 'Pysäytetty',
        })

    running_count = sum(1 for s in services_with_status if s['running'])
    containers = _get_docker_containers()

    context = {
        'services': services_with_status,
        'running_count': running_count,
        'total_count': len(services_with_status),
        'containers': containers,
    }
    return render(request, 'platform/dashboard.html', context)


@login_required
def api_status(request):
    """JSON-rajapinta palveluiden tilalle (AJAX-päivitystä varten)."""
    statuses = {}
    for svc in SERVICES:
        statuses[svc['name']] = {
            'running': _check_port(svc['host'], svc['port']),
            'port': svc['port'],
        }
    return JsonResponse({'services': statuses})
