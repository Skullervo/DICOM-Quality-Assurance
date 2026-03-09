import socket
import json
import logging

import docker
from docker.errors import NotFound, APIError

from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_http_methods
from django.db import connection

from django.shortcuts import get_object_or_404

from .models import Project, ProjectLayer, PlatformService, PlatformConnection

logger = logging.getLogger(__name__)

# ── Docker-client (lazy singleton) ──────────────────────────────────────────

_docker_client = None

# Oletuspalvelut (seed data)
DEFAULT_SERVICES = [
    {'name': 'PostgreSQL', 'description': 'Tietokanta (QA-results)', 'container': 'autoqad-postgres', 'host': 'postgres', 'port': 5432, 'host_port': 15432, 'category': 'infrastructure', 'layer': 'persistence', 'pos_x': 560, 'pos_y': 140},
    {'name': 'Orthanc DICOM', 'description': 'DICOM-palvelin (C-STORE + REST)', 'container': 'autoqad-orthanc', 'host': 'orthanc', 'port': 8042, 'host_port': 18042, 'category': 'infrastructure', 'layer': 'reception', 'url': 'http://localhost:18042', 'pos_x': 160, 'pos_y': 140},
    {'name': 'Fetch Service', 'description': 'Hakee kuvat Orthancista (gRPC)', 'container': 'autoqad-fetch', 'host': 'fetch-service', 'port': 50051, 'host_port': 50051, 'category': 'microservice', 'layer': 'processing', 'pos_x': 160, 'pos_y': 260},
    {'name': 'US Analyze', 'description': 'Ultraäänianalyysi (gRPC)', 'container': 'autoqad-us-analyze', 'host': 'us-analyze-service', 'port': 50052, 'host_port': 50052, 'category': 'microservice', 'layer': 'processing', 'pos_x': 380, 'pos_y': 260},
    {'name': 'XR Analyze', 'description': 'Röntgenanalyysi NORMI-13 (gRPC)', 'container': 'autoqad-xr-analyze', 'host': 'xr-analyze-service', 'port': 50053, 'host_port': 50053, 'category': 'microservice', 'layer': 'processing', 'pos_x': 600, 'pos_y': 260},
    {'name': 'CT Analyze', 'description': 'TT-analyysi CatPhan (gRPC)', 'container': 'autoqad-ct-analyze', 'host': 'ct-analyze-service', 'port': 50054, 'host_port': 50054, 'category': 'microservice', 'layer': 'processing', 'pos_x': 820, 'pos_y': 260},
    {'name': 'Django Web', 'description': 'Verkkosovellus (Gunicorn)', 'container': 'autoqad-django', 'host': 'django-web', 'port': 8000, 'host_port': 8001, 'category': 'application', 'layer': 'presentation', 'url': 'http://localhost:8001', 'pos_x': 280, 'pos_y': 380},
    {'name': 'Portainer', 'description': 'Docker-hallintaportaali', 'container': 'autoqad-portainer', 'host': 'portainer', 'port': 9000, 'host_port': 9000, 'category': 'platform', 'layer': 'orchestration', 'url': 'http://localhost:9000', 'pos_x': 80, 'pos_y': 40},
    {'name': 'Grafana', 'description': 'Monitorointi ja mittarit', 'container': 'grafana', 'host': 'grafana', 'port': 3000, 'host_port': 3000, 'category': 'monitoring', 'layer': 'monitoring', 'url': 'http://localhost:3000', 'pos_x': 830, 'pos_y': 40},
    {'name': 'Prometheus', 'description': 'Metriikoiden keruu', 'container': 'prometheus', 'host': 'prometheus', 'port': 9090, 'host_port': 9090, 'category': 'monitoring', 'layer': 'monitoring', 'pos_x': 980, 'pos_y': 40},
]

DEFAULT_CONNECTIONS = [
    ('Orthanc DICOM', 'Fetch Service', 'REST API', 'DICOM images'),
    ('Fetch Service', 'US Analyze', 'gRPC', 'US analysis'),
    ('Fetch Service', 'XR Analyze', 'gRPC', 'XR analysis'),
    ('Fetch Service', 'CT Analyze', 'gRPC', 'CT analysis'),
    ('US Analyze', 'PostgreSQL', 'SQL', 'QA results'),
    ('XR Analyze', 'PostgreSQL', 'SQL', 'QA results'),
    ('CT Analyze', 'PostgreSQL', 'SQL', 'QA results'),
    ('Django Web', 'PostgreSQL', 'SQL', 'Read results'),
    ('Django Web', 'Orthanc DICOM', 'REST API', 'DICOM images'),
    ('Prometheus', 'Grafana', 'HTTP', 'Metrics'),
]


def _get_docker():
    global _docker_client
    if _docker_client is None:
        try:
            _docker_client = docker.DockerClient(base_url='unix:///var/run/docker.sock')
            _docker_client.ping()
        except Exception:
            _docker_client = None
    return _docker_client


def _ensure_seed_data():
    """Luo oletuspalvelut tietokantaan jos tyhjä."""
    if PlatformService.objects.exists():
        return
    svc_map = {}
    for s in DEFAULT_SERVICES:
        obj = PlatformService.objects.create(**s)
        svc_map[s['name']] = obj
    for from_name, to_name, protocol, label in DEFAULT_CONNECTIONS:
        if from_name in svc_map and to_name in svc_map:
            PlatformConnection.objects.create(
                from_service=svc_map[from_name],
                to_service=svc_map[to_name],
                protocol=protocol,
                label=label,
            )


def _check_port(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def _get_container_info(container_name):
    client = _get_docker()
    if not client or not container_name:
        return None
    try:
        c = client.containers.get(container_name)
        return {
            'status': c.status,
            'running': c.status == 'running',
            'image': c.image.tags[0] if c.image.tags else str(c.image.short_id),
            'started_at': c.attrs['State'].get('StartedAt', ''),
            'health': c.attrs['State'].get('Health', {}).get('Status', ''),
        }
    except NotFound:
        return {'status': 'not found', 'running': False, 'image': '', 'started_at': '', 'health': ''}
    except Exception:
        return None


def _get_qa_stats():
    stats = {'us': 0, 'xr': 0, 'ct': 0}
    for key, table in [('us', 'ultrasound'), ('xr', 'xray_analysis'), ('ct', 'ct_analysis')]:
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                stats[key] = cursor.fetchone()[0]
        except Exception:
            pass
    return stats


def _safe_size(size_bytes):
    if not size_bytes:
        return '0 B'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def _enrich_services():
    """Hae palvelut DB:stä ja yhdistä Docker-statukseen."""
    _ensure_seed_data()
    services = list(PlatformService.objects.filter(is_active=True))
    enriched = []
    for svc in services:
        info = _get_container_info(svc.container)
        if info:
            running = info['running']
            status_label = {
                'running': 'Käynnissä', 'exited': 'Pysäytetty',
                'restarting': 'Käynnistyy...', 'not found': 'Ei löydy',
            }.get(info['status'], info['status'].capitalize())
        else:
            running = _check_port(svc.host, svc.port) if svc.host and svc.port else False
            status_label = 'Käynnissä' if running else 'Tuntematon'
            info = {'status': 'unknown', 'image': '', 'started_at': '', 'health': ''}

        d = svc.to_dict()
        d.update({
            'running': running,
            'status_label': status_label,
            'docker_status': info['status'],
            'image': info.get('image', ''),
            'started_at': info.get('started_at', ''),
            'health': info.get('health', ''),
        })
        enriched.append(d)
    return enriched


def _get_connections():
    _ensure_seed_data()
    return [c.to_dict() for c in PlatformConnection.objects.select_related('from_service', 'to_service').all()]


# ── Views ───────────────────────────────────────────────────────────────────

@login_required
def dashboard(request):
    services = _enrich_services()
    connections = _get_connections()
    running_count = sum(1 for s in services if s['running'])
    qa_stats = _get_qa_stats()

    context = {
        'services': services,
        'services_json': json.dumps(services, default=str),
        'connections_json': json.dumps(connections, default=str),
        'running_count': running_count,
        'total_count': len(services),
        'qa_stats': qa_stats,
        'portainer_url': 'http://localhost:9000',
        'grafana_url': 'http://localhost:3000',
        'category_choices': PlatformService.CATEGORY_CHOICES,
        'layer_choices': PlatformService.LAYER_CHOICES,
        'protocol_choices': PlatformConnection.PROTOCOL_CHOICES,
    }
    return render(request, 'platform/dashboard.html', context)


@login_required
def api_status(request):
    services = _enrich_services()
    qa_stats = _get_qa_stats()
    return JsonResponse({
        'services': {s['name']: {
            'running': s['running'],
            'status_label': s['status_label'],
            'docker_status': s['docker_status'],
            'image': s['image'],
            'port': s['port'],
        } for s in services},
        'qa_stats': qa_stats,
        'running_count': sum(1 for s in services if s['running']),
        'total_count': len(services),
    })


@login_required
def api_inspect(request, container_name):
    """Docker inspect — täydelliset kontin tiedot."""
    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    try:
        c = client.containers.get(container_name)
        attrs = c.attrs

        networks = {}
        for n, i in (attrs.get('NetworkSettings', {}).get('Networks') or {}).items():
            networks[n] = {'ip': i.get('IPAddress', ''), 'gateway': i.get('Gateway', ''), 'mac': i.get('MacAddress', ''), 'aliases': i.get('Aliases', [])}

        ports = {}
        for cp, binds in (attrs.get('NetworkSettings', {}).get('Ports') or {}).items():
            ports[cp] = [{'host_ip': b.get('HostIp', ''), 'host_port': b.get('HostPort', '')} for b in (binds or [])]

        env_raw = attrs.get('Config', {}).get('Env', [])
        env = {}
        sensitive = {'PASSWORD', 'SECRET', 'KEY', 'TOKEN'}
        for item in env_raw:
            if '=' in item:
                k, v = item.split('=', 1)
                env[k] = '********' if any(s in k.upper() for s in sensitive) else v

        mounts = [{'type': m.get('Type', ''), 'source': m.get('Source', ''), 'destination': m.get('Destination', ''), 'mode': m.get('Mode', ''), 'rw': m.get('RW', True)} for m in attrs.get('Mounts', [])]

        state = attrs.get('State', {})
        image = c.image
        image_info = {'tags': image.tags or [], 'id': image.short_id, 'size': _safe_size(image.attrs.get('Size', 0)), 'created': image.attrs.get('Created', '')}

        processes = []
        if c.status == 'running':
            try:
                top = c.top()
                processes = [dict(zip(top['Titles'], p)) for p in top['Processes'][:20]]
            except Exception:
                pass

        stats = {}
        if c.status == 'running':
            try:
                raw = c.stats(stream=False)
                cpu_d = raw['cpu_stats']['cpu_usage']['total_usage'] - raw['precpu_stats']['cpu_usage']['total_usage']
                sys_d = raw['cpu_stats']['system_cpu_usage'] - raw['precpu_stats']['system_cpu_usage']
                cpus = raw['cpu_stats'].get('online_cpus', 1)
                stats = {
                    'cpu_percent': round((cpu_d / sys_d) * cpus * 100, 2) if sys_d > 0 else 0,
                    'memory_usage': _safe_size(raw['memory_stats'].get('usage', 0)),
                    'memory_limit': _safe_size(raw['memory_stats'].get('limit', 0)),
                    'memory_percent': round(raw['memory_stats'].get('usage', 0) / max(raw['memory_stats'].get('limit', 1), 1) * 100, 1),
                }
            except Exception:
                pass

        return JsonResponse({
            'name': container_name,
            'id': attrs.get('Id', '')[:12],
            'created': attrs.get('Created', ''),
            'state': {'status': state.get('Status', ''), 'running': state.get('Running', False), 'started_at': state.get('StartedAt', ''), 'finished_at': state.get('FinishedAt', ''), 'exit_code': state.get('ExitCode', 0), 'pid': state.get('Pid', 0), 'health': state.get('Health', {}).get('Status', '')},
            'image': image_info,
            'config': {'hostname': attrs.get('Config', {}).get('Hostname', ''), 'cmd': attrs.get('Config', {}).get('Cmd', []), 'entrypoint': attrs.get('Config', {}).get('Entrypoint', []), 'working_dir': attrs.get('Config', {}).get('WorkingDir', '')},
            'networks': networks,
            'ports': ports,
            'env': env,
            'mounts': mounts,
            'processes': processes,
            'stats': stats,
            'restart_policy': attrs.get('HostConfig', {}).get('RestartPolicy', {}),
        })
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def api_logs(request, container_name):
    tail = min(int(request.GET.get('tail', 100)), 500)
    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)
    try:
        logs = client.containers.get(container_name).logs(tail=tail, timestamps=True).decode('utf-8', errors='replace')
        return JsonResponse({'container': container_name, 'logs': logs})
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def api_container_action(request, container_name, action):
    if action not in ('start', 'stop', 'restart'):
        return JsonResponse({'error': 'Invalid action'}, status=400)

    protected = {'autoqad-django', 'autoqad-postgres'}
    if action == 'stop' and container_name in protected:
        return JsonResponse({'error': 'Suojattu palvelu — ei voi pysäyttää'}, status=403)

    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    try:
        c = client.containers.get(container_name)
        getattr(c, action)(timeout=30)
        c.reload()
        return JsonResponse({'container': container_name, 'action': action, 'status': c.status})
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except APIError as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def api_bulk_action(request, action):
    """Start/stop/restart kaikki kontit kerralla."""
    if action not in ('start', 'stop', 'restart'):
        return JsonResponse({'error': 'Invalid action'}, status=400)

    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    protected = {'autoqad-django', 'autoqad-postgres'}
    services = PlatformService.objects.filter(is_active=True).exclude(container='')
    results = {}

    # Stop-järjestys: sovellus ensin, infra viimeiseksi. Start-järjestys: päinvastainen.
    order = ['application', 'monitoring', 'platform', 'microservice', 'infrastructure']
    if action == 'start':
        order = list(reversed(order))

    sorted_svcs = sorted(services, key=lambda s: order.index(s.category) if s.category in order else 99)

    for svc in sorted_svcs:
        if action == 'stop' and svc.container in protected:
            results[svc.container] = 'skipped (protected)'
            continue
        try:
            c = client.containers.get(svc.container)
            getattr(c, action)(timeout=30)
            c.reload()
            results[svc.container] = c.status
        except NotFound:
            results[svc.container] = 'not found'
        except Exception as e:
            results[svc.container] = str(e)

    return JsonResponse({'action': action, 'results': results})


@login_required
@require_POST
def api_save_positions(request):
    """Tallenna SVG-nodien sijainnit tietokantaan."""
    try:
        data = json.loads(request.body)
        positions = data.get('positions', {})
        for name, pos in positions.items():
            PlatformService.objects.filter(name=name).update(
                pos_x=pos.get('x', 0),
                pos_y=pos.get('y', 0),
            )
        return JsonResponse({'saved': len(positions)})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_add_service(request):
    """Lisää uusi palvelu."""
    try:
        data = json.loads(request.body)
        svc = PlatformService.objects.create(
            name=data['name'],
            description=data.get('description', ''),
            container=data.get('container', ''),
            host=data.get('host', ''),
            port=int(data.get('port', 0)),
            host_port=int(data.get('host_port', 0)),
            category=data.get('category', 'microservice'),
            layer=data.get('layer', 'processing'),
            url=data.get('url', ''),
            pos_x=float(data.get('pos_x', 400)),
            pos_y=float(data.get('pos_y', 300)),
        )
        return JsonResponse({'id': svc.id, 'service': svc.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_delete_service(request, service_id):
    """Poista palvelu."""
    try:
        svc = PlatformService.objects.get(id=service_id)
        name = svc.name
        svc.delete()
        return JsonResponse({'deleted': name})
    except PlatformService.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)


@login_required
@require_POST
def api_add_connection(request):
    """Lisää uusi yhteys."""
    try:
        data = json.loads(request.body)
        from_svc = PlatformService.objects.get(id=data['from_id'])
        to_svc = PlatformService.objects.get(id=data['to_id'])
        conn = PlatformConnection.objects.create(
            from_service=from_svc,
            to_service=to_svc,
            protocol=data.get('protocol', 'HTTP'),
            label=data.get('label', ''),
        )
        return JsonResponse({'id': conn.id, 'connection': conn.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_delete_connection(request, connection_id):
    """Poista yhteys."""
    try:
        conn = PlatformConnection.objects.get(id=connection_id)
        conn.delete()
        return JsonResponse({'deleted': connection_id})
    except PlatformConnection.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)


# ── Tiedostoselain & editori ────────────────────────────────────────────────

# Kontit joiden tiedostoja SAA muokata (volume-mount dev-tilassa)
EDITABLE_CONTAINERS = {
    'autoqad-fetch', 'autoqad-us-analyze', 'autoqad-xr-analyze',
    'autoqad-ct-analyze', 'autoqad-django',
}

# Estä vaarallisten polkujen käyttö
BLOCKED_PATTERNS = {'/proc', '/sys', '/dev', '/run', '/var/run/docker.sock'}
MAX_FILE_SIZE = 512 * 1024  # 512 KB


def _validate_path(path):
    """Normalisoi ja validoi polku — estä path traversal."""
    import posixpath
    path = posixpath.normpath('/' + path)
    if '..' in path.split('/'):
        return None
    for blocked in BLOCKED_PATTERNS:
        if path.startswith(blocked):
            return None
    return path


@login_required
def api_file_tree(request, container_name):
    """Listaa kontin hakemiston sisältö puurakenteena."""
    path = request.GET.get('path', '/app')
    path = _validate_path(path)
    if not path:
        return JsonResponse({'error': 'Invalid path'}, status=400)

    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    try:
        c = client.containers.get(container_name)
        # Listaa tiedostot: tyyppi, koko, nimi
        result = c.exec_run(
            ['find', path, '-maxdepth', '1', '-printf', '%y %s %f\\n'],
            demux=True,
        )
        stdout = (result.output[0] or b'').decode('utf-8', errors='replace')

        items = []
        for line in stdout.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split(' ', 2)
            if len(parts) < 3:
                continue
            ftype, size, name = parts[0], parts[1], parts[2]
            if name in ('.', '..'):
                continue
            full_path = path.rstrip('/') + '/' + name if name != path.split('/')[-1] or ftype != 'd' else path
            # Ensimmäinen rivi on hakemisto itse
            if ftype == 'd' and name == path.split('/')[-1] and items == []:
                continue
            items.append({
                'name': name,
                'path': full_path,
                'type': 'dir' if ftype == 'd' else 'file',
                'size': int(size) if size.isdigit() else 0,
            })

        # Järjestä: hakemistot ensin, sitten aakkosjärjestys
        items.sort(key=lambda x: (0 if x['type'] == 'dir' else 1, x['name'].lower()))

        return JsonResponse({
            'container': container_name,
            'path': path,
            'items': items,
            'editable': container_name in EDITABLE_CONTAINERS,
        })
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def api_file_read(request, container_name):
    """Lue tiedoston sisältö kontista."""
    path = request.GET.get('path', '')
    path = _validate_path(path)
    if not path:
        return JsonResponse({'error': 'Invalid path'}, status=400)

    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    try:
        c = client.containers.get(container_name)

        # Tarkista koko ensin
        size_result = c.exec_run(['stat', '-c', '%s', path], demux=True)
        size_out = (size_result.output[0] or b'').decode().strip()
        if size_out.isdigit() and int(size_out) > MAX_FILE_SIZE:
            return JsonResponse({'error': f'File too large ({int(size_out)} bytes, max {MAX_FILE_SIZE})'}, status=400)

        result = c.exec_run(['cat', path], demux=True)
        if result.exit_code != 0:
            stderr = (result.output[1] or b'').decode('utf-8', errors='replace')
            return JsonResponse({'error': stderr or 'Cannot read file'}, status=400)

        content = (result.output[0] or b'').decode('utf-8', errors='replace')

        # Detect language from extension
        ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
        lang_map = {
            'py': 'python', 'js': 'javascript', 'ts': 'typescript',
            'html': 'html', 'css': 'css', 'json': 'json', 'yml': 'yaml',
            'yaml': 'yaml', 'md': 'markdown', 'sh': 'shell', 'bash': 'shell',
            'sql': 'sql', 'txt': 'plaintext', 'cfg': 'ini', 'ini': 'ini',
            'toml': 'ini', 'xml': 'xml', 'proto': 'protobuf',
            'dockerfile': 'dockerfile', 'env': 'shell',
        }
        language = lang_map.get(ext, 'plaintext')
        # Special filename detection
        basename = path.split('/')[-1].lower()
        if basename.startswith('dockerfile'):
            language = 'dockerfile'
        elif basename in ('requirements.txt', 'pipfile'):
            language = 'plaintext'

        return JsonResponse({
            'container': container_name,
            'path': path,
            'content': content,
            'language': language,
            'size': len(content),
            'editable': container_name in EDITABLE_CONTAINERS,
        })
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@require_POST
def api_file_write(request, container_name):
    """Kirjoita tiedosto konttiin."""
    if container_name not in EDITABLE_CONTAINERS:
        return JsonResponse({'error': 'Container is read-only'}, status=403)

    try:
        data = json.loads(request.body)
        path = _validate_path(data.get('path', ''))
        content = data.get('content', '')
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not path:
        return JsonResponse({'error': 'Invalid path'}, status=400)

    if len(content.encode('utf-8')) > MAX_FILE_SIZE:
        return JsonResponse({'error': 'Content too large'}, status=400)

    client = _get_docker()
    if not client:
        return JsonResponse({'error': 'Docker not available'}, status=503)

    try:
        import tarfile
        import io

        c = client.containers.get(container_name)

        # Luo tar-arkisto tiedostosta ja kirjoita konttiin
        content_bytes = content.encode('utf-8')
        tarstream = io.BytesIO()
        with tarfile.open(fileobj=tarstream, mode='w') as tar:
            info = tarfile.TarInfo(name=path.split('/')[-1])
            info.size = len(content_bytes)
            tar.addfile(info, io.BytesIO(content_bytes))
        tarstream.seek(0)

        # Kohdehakemisto
        target_dir = '/'.join(path.split('/')[:-1]) or '/'
        c.put_archive(target_dir, tarstream)

        return JsonResponse({
            'container': container_name,
            'path': path,
            'size': len(content_bytes),
            'status': 'saved',
        })
    except NotFound:
        return JsonResponse({'error': 'Container not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ── Projektit (Builder) ──────────────────────────────────────────────────────

@login_required
def project_list(request):
    """Projektilistaus."""
    projects = Project.objects.all()
    return render(request, 'platform/projects.html', {
        'projects': projects,
        'category_choices': PlatformService.CATEGORY_CHOICES,
        'protocol_choices': PlatformConnection.PROTOCOL_CHOICES,
    })


@login_required
def project_builder(request, project_id):
    """Projektin arkkitehtuurirakentaja."""
    project = get_object_or_404(Project, id=project_id)
    layers = list(project.layers.all())
    services = list(PlatformService.objects.filter(project=project, is_active=True))
    connections = list(PlatformConnection.objects.filter(project=project).select_related('from_service', 'to_service'))

    enriched = []
    for svc in services:
        info = _get_container_info(svc.container)
        if info:
            running = info['running']
        else:
            running = _check_port(svc.host, svc.port) if svc.host and svc.port else False
            info = {'status': 'unknown', 'image': '', 'started_at': '', 'health': ''}
        d = svc.to_dict()
        d.update({'running': running, 'docker_status': info['status'], 'image': info.get('image', '')})
        enriched.append(d)

    context = {
        'project': project,
        'project_json': json.dumps(project.to_dict(), default=str),
        'layers_json': json.dumps([l.to_dict() for l in layers], default=str),
        'services': enriched,
        'services_json': json.dumps(enriched, default=str),
        'connections_json': json.dumps([c.to_dict() for c in connections], default=str),
        'category_choices': PlatformService.CATEGORY_CHOICES,
        'protocol_choices': PlatformConnection.PROTOCOL_CHOICES,
    }
    return render(request, 'platform/builder.html', context)


@login_required
@require_POST
def api_project_create(request):
    """Luo uusi projekti."""
    try:
        data = json.loads(request.body)
        project = Project.objects.create(
            name=data['name'],
            description=data.get('description', ''),
        )
        return JsonResponse({'id': project.id, 'project': project.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_project_delete(request, project_id):
    """Poista projekti."""
    project = get_object_or_404(Project, id=project_id)
    if project.is_default:
        return JsonResponse({'error': 'Oletusprojektia ei voi poistaa'}, status=403)
    project.delete()
    return JsonResponse({'deleted': project_id})


@login_required
@require_POST
def api_layer_add(request, project_id):
    """Lisää layer projektiin."""
    project = get_object_or_404(Project, id=project_id)
    try:
        data = json.loads(request.body)
        max_order = project.layers.count()
        last_layer = project.layers.order_by('-order').first()
        y_pos = (last_layer.y_position + last_layer.height + 10) if last_layer else 8

        layer = ProjectLayer.objects.create(
            project=project,
            name=data.get('name', f'layer_{max_order}'),
            label=data.get('label', 'New Layer'),
            order=max_order,
            y_position=y_pos,
            height=float(data.get('height', 100)),
            color=data.get('color', ''),
        )
        return JsonResponse({'id': layer.id, 'layer': layer.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_layer_update(request, layer_id):
    """Päivitä layer."""
    layer = get_object_or_404(ProjectLayer, id=layer_id)
    try:
        data = json.loads(request.body)
        for field in ('label', 'name', 'color'):
            if field in data:
                setattr(layer, field, data[field])
        for field in ('order',):
            if field in data:
                setattr(layer, field, int(data[field]))
        for field in ('y_position', 'height'):
            if field in data:
                setattr(layer, field, float(data[field]))
        layer.save()
        return JsonResponse({'layer': layer.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_layer_delete(request, layer_id):
    """Poista layer."""
    layer = get_object_or_404(ProjectLayer, id=layer_id)
    layer.delete()
    return JsonResponse({'deleted': layer_id})


@login_required
@require_POST
def api_project_add_service(request, project_id):
    """Lisää palvelu projektiin."""
    project = get_object_or_404(Project, id=project_id)
    try:
        data = json.loads(request.body)
        layer_ref = None
        if data.get('layer_ref_id'):
            layer_ref = ProjectLayer.objects.get(id=data['layer_ref_id'], project=project)
        svc = PlatformService.objects.create(
            project=project,
            name=data['name'],
            description=data.get('description', ''),
            container=data.get('container', ''),
            host=data.get('host', ''),
            port=int(data.get('port', 0)),
            host_port=int(data.get('host_port', 0)),
            category=data.get('category', 'microservice'),
            layer=data.get('layer', 'processing'),
            layer_ref=layer_ref,
            url=data.get('url', ''),
            pos_x=float(data.get('pos_x', 200)),
            pos_y=float(data.get('pos_y', 200)),
        )
        return JsonResponse({'id': svc.id, 'service': svc.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_project_add_connection(request, project_id):
    """Lisää yhteys projektiin."""
    project = get_object_or_404(Project, id=project_id)
    try:
        data = json.loads(request.body)
        from_svc = PlatformService.objects.get(id=data['from_id'], project=project)
        to_svc = PlatformService.objects.get(id=data['to_id'], project=project)
        conn = PlatformConnection.objects.create(
            project=project,
            from_service=from_svc,
            to_service=to_svc,
            protocol=data.get('protocol', 'HTTP'),
            label=data.get('label', ''),
        )
        return JsonResponse({'id': conn.id, 'connection': conn.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_project_save_positions(request, project_id):
    """Tallenna projektin SVG-nodien sijainnit."""
    project = get_object_or_404(Project, id=project_id)
    try:
        data = json.loads(request.body)
        positions = data.get('positions', {})
        for name, pos in positions.items():
            PlatformService.objects.filter(project=project, name=name).update(
                pos_x=pos.get('x', 0), pos_y=pos.get('y', 0),
            )
        return JsonResponse({'saved': len(positions)})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@login_required
@require_POST
def api_project_save_layers(request, project_id):
    """Tallenna layer-positiot (batch)."""
    project = get_object_or_404(Project, id=project_id)
    try:
        data = json.loads(request.body)
        for layer_data in data.get('layers', []):
            ProjectLayer.objects.filter(id=layer_data['id'], project=project).update(
                y_position=layer_data.get('y', 0),
                height=layer_data.get('h', 100),
                order=layer_data.get('order', 0),
            )
        return JsonResponse({'saved': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
