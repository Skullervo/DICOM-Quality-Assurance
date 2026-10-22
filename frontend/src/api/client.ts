// =============================================================================
// api/client.ts — Keskitetty rajapinta Go-backendiin (KAIKKI HTTP-kutsut)
// =============================================================================
// Tämä tiedosto kokoaa yhteen paikkaan kaikki kutsut Go-backendin REST-API:in.
// Jokainen sivu/komponentti käyttää tämän tiedoston `api`-oliota (esim.
// api.usInstitutions()) eikä kutsu fetch():iä suoraan. Näin osoitteet ja
// datarakenteet (TypeScript-tyypit) ovat yhdessä paikassa.
//
// Rakenne:
//   - BASE         : API:n juuriosoite (dev-proxy ohjaa Go-backendiin).
//   - fetchJSON<T> : apufunktio, joka hakee JSON:ia ja heittää virheen jos kutsu epäonnistuu.
//   - interface ...: palvelimelta tulevan datan muodot (tyypit).
//   - api          : olio, jonka jokainen kenttä on yksi API-kutsu.
// Jos backendin osoite tai vastausmuoto muuttuu, muutos tehdään tähän.
// =============================================================================

// API:n perusosoite. Vite voi antaa VITE_API_BASE-ympäristömuuttujan; jos sitä
// ei ole, käytetään oletuspolkua, jonka Caddy/dev-proxy reitittää Go-backendiin.
export const BASE = import.meta.env.VITE_API_BASE ?? '/Laadunhallinta/api';

// Yleinen apufunktio GET-hakuihin: hakee annetusta polusta JSONin ja palauttaa
// sen tyyppinä T. Jos palvelin vastaa virhekoodilla (ei 2xx), heitetään virhe,
// jonka TanStack Query näyttää käyttöliittymässä.
async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Kuvavastaus: base64-koodattu kuva + sen mime-tyyppi (esim. image/png).
export interface ImageResponse {
  image?: string;
  mime?: string;
}

// US-kuvavastaus laajentaa peruskuvaa ultraäänen profiilidatalla
// (vaaka-/pystyprofiili ja mitattu syvyys s_depth).
export interface USImageResponse extends ImageResponse {
  horiz_prof?: number[];
  vert_prof?: number[];
  s_depth?: number | null;
}

// Ultrasound
// Yksi rivi laitoslistassa: laitoksen nimi + montako laitetta ja mittausta.
export interface USInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// USUnit = alias for DeviceUnit
// US-yksikkö on rakenteeltaan sama kuin yhteinen DeviceUnit (alla).
export type USUnit = DeviceUnit;

// Yksi ultraäänimittauksen trenditietopiste (yhden tutkimuspäivän arvot).
export interface USDataPoint {
  study_date: string;
  s_depth: number | null;
  u_cov: number | null;
  u_skew: number | null;
  transducer_type: string;
  instance: string;
}

// Mittaus (Orthanc-lähde + analyysin tila)
// Edustaa yhtä Orthancissa olevaa mittausta ja sen analyysitilaa. Tällä saadaan
// näkyviin myös epäonnistuneet analyysit, joita ei ole tietokannassa.
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
// Yhden QA-metriikan hyväksyttävyysrajat: nimellisarvo, ala-/ylärajat,
// toimenpideraja sekä varoitusrajat. null = rajaa ei ole asetettu.
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
// Toleranssin päivitysrunko: sama kuin Tolerance mutta ilman tunnistekenttiä
// (modality ja metric_id tulevat URL-polusta, ei runkodatasta).
export type ToleranceUpdate = Omit<Tolerance, 'modality' | 'metric_id'>;

// Yhteinen laite/unit-rakenne (US, XR, CT)
// Yksi laite laitelistassa: asemanimi, laitos, valmistaja/malli sekä viimeisin
// mittaus ja mittausten lukumäärä.
export interface DeviceUnit {
  station_name: string;
  institution_name: string;
  manufacturer: string;
  manufacturer_model: string;
  last_measurement: string;
  measurement_count: number;
}

// X-ray
// Röntgenlaitoksen listarivi (sama muoto kuin US:llä).
export interface XrayInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// CT
// TT-laitoksen listarivi.
export interface CTInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// Angio (Leeds TOR-18)
// Angiografialaitoksen listarivi.
export interface AngioInstitution {
  name: string;
  device_count: number;
  measurement_count: number;
}

// api-olio: kaikki käytettävissä olevat backend-kutsut yhteen koottuna.
// Jokainen kenttä palauttaa Promisen. Modaliteettikohtaiset kutsut (US/XR/CT/
// Angio) noudattavat samaa kaavaa: laitokset -> yksiköt -> laitteen data.
export const api = {
  // US
  // Ultraäänilaitosten lista.
  usInstitutions: () => fetchJSON<USInstitution[]>('/us/institutions'),
  // US-yksiköt; valinnainen institution-suodatin lisätään query-parametrina.
  usUnits: (institution?: string) => {
    // encodeURIComponent varmistaa, että nimen erikoismerkit eivät riko URL:ää.
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<USUnit[]>(`/us/units${qs}`);
  },
  // Yhden US-laitteen kaikki mittaukset (yleinen avain-arvo-rakenne).
  usDeviceDetail: (station: string) => fetchJSON<Record<string, unknown>[]>(`/us/device/${encodeURIComponent(station)}`),
  // US-laitteen trendidata (syvyys s_depth ym. aikasarjana).
  usData: (station: string) => fetchJSON<USDataPoint[]>(`/us/api/s_depth/${encodeURIComponent(station)}`),
  // US-yhteenveto kaikista laitteista.
  usSummary: () => fetchJSON<Record<string, unknown>[]>('/us/summary'),

  // X-ray
  xrayInstitutions: () => fetchJSON<XrayInstitution[]>('/xray/institutions'),
  xrayUnits: (institution?: string) => {
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<DeviceUnit[]>(`/xray/units${qs}`);
  },
  // Röntgenlaitteen mittaukset tunnistetaan laitoksen (inst) ja yksikön (unit) perusteella.
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

  // Angio (Leeds TOR-18) — peilaa X-ray-rajapinnan
  // Angiografiakutsut vastaavat rakenteeltaan röntgenin kutsuja.
  angioInstitutions: () => fetchJSON<AngioInstitution[]>('/angio/institutions'),
  angioUnits: (institution?: string) => {
    const qs = institution ? `?institution=${encodeURIComponent(institution)}` : '';
    return fetchJSON<DeviceUnit[]>(`/angio/units${qs}`);
  },
  angioDeviceDetail: (inst: string, unit: string) =>
    fetchJSON<Record<string, unknown>[]>(`/angio/device/${encodeURIComponent(inst)}/${encodeURIComponent(unit)}`),
  angioData: (station: string) => fetchJSON<Record<string, unknown>[]>(`/angio/api/uniformity/${encodeURIComponent(station)}`),

  // Images (Orthanc proxy + DB profiles)
  // Kuvahaut: US palauttaa myös profiilidatan; muut pelkän kuvan.
  usImage: (instance: string) => fetchJSON<USImageResponse>(`/us/image/${encodeURIComponent(instance)}`),
  xrayImage: (instance: string) => fetchJSON<ImageResponse>(`/xray/image/${encodeURIComponent(instance)}`),
  ctImage: (instance: string) => fetchJSON<ImageResponse>(`/ct/image/${encodeURIComponent(instance)}`),
  angioImage: (instance: string) => fetchJSON<ImageResponse>(`/angio/image/${encodeURIComponent(instance)}`),
  // Nämä palauttavat suoran URL:n analyysikuvaan (esim. ROI-kartta, MTF-käyrä),
  // jota voi käyttää <img src=...> -tagissa. type valitsee kuvan tyypin.
  xrayAnalysisImageUrl: (instance: string, type: string) =>
    `${BASE}/xray/analysis-image/${encodeURIComponent(instance)}/${type}`,
  ctAnalysisImageUrl: (instance: string, type: string) =>
    `${BASE}/ct/analysis-image/${encodeURIComponent(instance)}/${type}`,
  angioAnalysisImageUrl: (instance: string, type: string) =>
    `${BASE}/angio/analysis-image/${encodeURIComponent(instance)}/${type}`,

  // CT DICOM-katselin: sarjan metatiedot + palvelinpuolella renderöity viipale (W/L)
  // sliceCount = viipaleiden määrä, defaultSlice = oletusnäkymä, window center/width = ikkunointi.
  ctSeriesMeta: (instance: string) =>
    fetchJSON<{ sliceCount: number; defaultSlice: number; windowCenter: string; windowWidth: string }>(
      `/ct/series-meta/${encodeURIComponent(instance)}`,
    ),
  // URL yhteen renderöityyn CT-viipaleeseen: slice = viipalenumero, wc/ww = ikkunointiarvot.
  ctSeriesImageUrl: (instance: string, slice: number, wc: number, ww: number) =>
    `${BASE}/ct/series-image/${encodeURIComponent(instance)}?slice=${slice}&wc=${wc}&ww=${ww}`,

  // AI + Slack
  // Lähettää kysymyksen AI-avustajalle (OpenAI GPT backendin kautta) ja palauttaa vastauksen.
  askAI: async (question: string): Promise<{ answer?: string; error?: string }> => {
    const res = await fetch(`${BASE}/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    return res.json();
  },
  // Lähettää käyttäjän ilmoituksen ongelmasta Slackiin backendin kautta.
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
  // Hakee yhden modaliteetin kaikki mittaukset Orthancista (myös epäonnistuneet).
  measurements: (modality: 'us' | 'xray' | 'ct' | 'angio') => fetchJSON<Measurement[]>(`/${modality}/measurements`),
  // Suora URL yhden mittauksen kuvaan Orthanc-tunnisteen perusteella.
  measurementImageUrl: (orthancId: string) => `${BASE}/measurement-image/${encodeURIComponent(orthancId)}`,

  // Toleranssit (hyväksyttävyysrajat)
  // Hakee kaikki toleranssirajat (kaikki modaliteetit ja metriikat).
  tolerances: () => fetchJSON<Tolerance[]>('/tolerances'),
  // Päivittää yhden metriikan rajat (PUT). modality+metric tunnistavat rivin.
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
  // Korjaa esim. väärin kirjatun asemanimen/laitoksen. Muutos kohdistuu KAIKKIIN
  // vanhan asemanimen (oldStation) mittauksiin. Palauttaa montako riviä päivittyi.
  updateDevice: async (
    modality: 'us' | 'xray' | 'ct' | 'angio',
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
  // Laitteiden ja laitosten rekisterit (hallintanäkymiä varten).
  devices: () => fetchJSON<Record<string, unknown>[]>('/devices'),
  institutions: () => fetchJSON<Record<string, unknown>[]>('/institutions'),

  // Hallinta (stub — 501 kunnes PostgreSQL-migraatio valmis)
  // Alustan hallintakutsut; backend palauttaa toistaiseksi 501 (ei toteutettu),
  // kunnes hallinta-data on siirretty SQLitestä PostgreSQL:ään.
  hallintaServices: () => fetchJSON<Record<string, unknown>[]>('/hallinta/services'),
  hallintaStacks: () => fetchJSON<Record<string, unknown>[]>('/hallinta/stacks'),
  hallintaProjects: () => fetchJSON<Record<string, unknown>[]>('/hallinta/projects'),
};
