export const BASE = import.meta.env.VITE_API_BASE ?? '/Laadunhallinta/api';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export interface ImageResponse {
  image?: string;
  mime?: string;
}

export interface USImageResponse extends ImageResponse {
  horiz_prof?: number[];
  vert_prof?: number[];
  s_depth?: number | null;
}

// Ultrasound
export interface USInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// USUnit = alias for DeviceUnit
export type USUnit = DeviceUnit;

export interface USDataPoint {
  study_date: string;
  s_depth: number | null;
  u_cov: number | null;
  u_skew: number | null;
  transducer_type: string;
  instance: string;
}

// Mittaus (Orthanc-lähde + analyysin tila)
export interface Measurement {
  instance: string;
  orthanc_id: string;
  station_name: string;
  institution_name: string;
  study_date: string;
  manufacturer: string;
  manufacturer_model: string;
  modality: string;
  status: 'analyzed' | 'failed';
  reason: string;
  detail: string;
}

// Toleranssi (hyväksyttävyysrajat) per modaliteetti + metriikka
export interface Tolerance {
  modality: string;
  metric_id: string;
  nominal: number | null;
  lower_limit: number | null;
  upper_limit: number | null;
  action_limit: number | null;
  lower_warn: number | null;
  upper_warn: number | null;
}
export type ToleranceUpdate = Omit<Tolerance, 'modality' | 'metric_id'>;

// Yhteinen laite/unit-rakenne (US, XR, CT)
export interface DeviceUnit {
  station_name: string;
  institution_name: string;
  manufacturer: string;
  manufacturer_model: string;
  last_measurement: string;
  measurement_count: number;
}

// X-ray
export interface XrayInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// CT
export interface CTInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

export const api = {
  // US
  usInstitutions: () => fetchJSON<USInstitution[]>('/us/institutions'),
  usUnits: (institution?: string) => {
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<USUnit[]>(`/us/units${qs}`);
  },
  usDeviceDetail: (station: string) => fetchJSON<Record<string, unknown>[]>(`/us/device/${encodeURIComponent(station)}`),
  usData: (station: string) => fetchJSON<USDataPoint[]>(`/us/api/s_depth/${encodeURIComponent(station)}`),
  usSummary: () => fetchJSON<Record<string, unknown>[]>('/us/summary'),

  // X-ray
  xrayInstitutions: () => fetchJSON<XrayInstitution[]>('/xray/institutions'),
  xrayUnits: (institution?: string) => {
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<DeviceUnit[]>(`/xray/units${qs}`);
  },
  xrayDeviceDetail: (inst: string, unit: string) =>
    fetchJSON<Record<string, unknown>[]>(`/xray/device/${encodeURIComponent(inst)}/${encodeURIComponent(unit)}`),
  xrayData: (station: string) => fetchJSON<Record<string, unknown>[]>(`/xray/api/uniformity/${encodeURIComponent(station)}`),

  // CT
  ctInstitutions: () => fetchJSON<CTInstitution[]>('/ct/institutions'),
  ctUnits: (institution?: string) => {
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<DeviceUnit[]>(`/ct/units${qs}`);
  },
  ctDeviceDetail: (station: string) => fetchJSON<Record<string, unknown>[]>(`/ct/device/${encodeURIComponent(station)}`),
  ctData: (station: string) => fetchJSON<Record<string, unknown>[]>(`/ct/api/data/${encodeURIComponent(station)}`),

  // Images (Orthanc proxy + DB profiles)
  usImage: (instance: string) => fetchJSON<USImageResponse>(`/us/image/${encodeURIComponent(instance)}`),
  xrayImage: (instance: string) => fetchJSON<ImageResponse>(`/xray/image/${encodeURIComponent(instance)}`),
  ctImage: (instance: string) => fetchJSON<ImageResponse>(`/ct/image/${encodeURIComponent(instance)}`),
  xrayAnalysisImageUrl: (instance: string, type: string) =>
    `${BASE}/xray/analysis-image/${encodeURIComponent(instance)}/${type}`,
  ctAnalysisImageUrl: (instance: string, type: string) =>
    `${BASE}/ct/analysis-image/${encodeURIComponent(instance)}/${type}`,

  // CT DICOM-katselin: sarjan metatiedot + palvelinpuolella renderöity viipale (W/L)
  ctSeriesMeta: (instance: string) =>
    fetchJSON<{ sliceCount: number; defaultSlice: number; windowCenter: string; windowWidth: string }>(
      `/ct/series-meta/${encodeURIComponent(instance)}`,
    ),
  ctSeriesImageUrl: (instance: string, slice: number, wc: number, ww: number) =>
    `${BASE}/ct/series-image/${encodeURIComponent(instance)}?slice=${slice}&wc=${wc}&ww=${ww}`,

  // AI + Slack
  askAI: async (question: string): Promise<{ answer?: string; error?: string }> => {
    const res = await fetch(`${BASE}/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    return res.json();
  },
  reportIssue: async (
    text: string,
    meta?: { modality?: string; station?: string },
  ): Promise<{ status?: string; error?: string }> => {
    const res = await fetch(`${BASE}/report-issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // modality/station -> backend reitittää oikealle Slack-kanavalle (US/CT/XR)
      body: JSON.stringify({ text, modality: meta?.modality, station: meta?.station }),
    });
    return res.json();
  },

  // Mittaukset (kaikki Orthanc-mittaukset + analyysin tila)
  measurements: (modality: 'us' | 'xray' | 'ct') => fetchJSON<Measurement[]>(`/${modality}/measurements`),
  measurementImageUrl: (orthancId: string) => `${BASE}/measurement-image/${encodeURIComponent(orthancId)}`,

  // Toleranssit (hyväksyttävyysrajat)
  tolerances: () => fetchJSON<Tolerance[]>('/tolerances'),
  updateTolerance: async (modality: string, metric: string, data: ToleranceUpdate): Promise<{ status?: string }> => {
    const res = await fetch(`${BASE}/tolerances/${encodeURIComponent(modality)}/${encodeURIComponent(metric)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
    return res.json();
  },

  // Laitteen metatietojen paivitys (UPDATE kaikille laitteen mittauksille)
  updateDevice: async (
    modality: 'us' | 'xray' | 'ct',
    oldStation: string,
    data: { station_name: string; institution_name: string; manufacturer: string; manufacturer_model: string },
  ): Promise<{ updated: number; station_name: string }> => {
    const res = await fetch(`${BASE}/${modality}/device-meta/${encodeURIComponent(oldStation)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
    return res.json();
  },

  // Admin
  devices: () => fetchJSON<Record<string, unknown>[]>('/devices'),
  institutions: () => fetchJSON<Record<string, unknown>[]>('/institutions'),

  // Hallinta (stub — 501 kunnes PostgreSQL-migraatio valmis)
  hallintaServices: () => fetchJSON<Record<string, unknown>[]>('/hallinta/services'),
  hallintaStacks: () => fetchJSON<Record<string, unknown>[]>('/hallinta/stacks'),
  hallintaProjects: () => fetchJSON<Record<string, unknown>[]>('/hallinta/projects'),
};
