# UI-parannukset: LV-automaatti laitenäkymä

Refaktoroi laitenäkymän käyttöliittymä alla olevien ohjeiden mukaisesti.
Tee muutokset yksi osio kerrallaan ja odota hyväksyntä ennen seuraavaa.

---

## Osio 1 — Layout: 3-sarakkeinen rakenne

Muuta pääsisältöalue 3-sarakkeiseksi CSS Grid -layoutiksi:

```css
.layout {
  display: grid;
  grid-template-columns: 260px 1fr 340px;
  height: calc(100vh - 48px);
}
```

- **Vasen sarake (260px):** laitetiedot + DICOM-kuva
- **Keskisarake (1fr):** kaaviot (kaikki tila mitä jää)
- **Oikea sarake (340px):** tekoäly-chat + raportointipaneeli

---

## Osio 2 — Yhteenvetorivi kaavioiden yläpuolelle

Lisää ennen kaavioruudukkoa rivi, jossa on 4 "chip"-korttia:

| Metriikka     | Arvo       | Tila    | Väri    |
|---------------|------------|---------|---------|
| Uniformity    | 4 800      | Tarkista | oranssi |
| Low Contrast  | 0.0200     | OK      | vihreä  |
| MTF 50%       | 2.00 lp/mm | OK      | valkoinen |
| CNR           | 2.20       | Huono   | punainen |

Jokainen kortti sisältää: otsikko (pieni, harmaa), arvo (mono-fontti, iso), tila-teksti (pieni, värikoodattu).

---

## Osio 3 — Kaaviokorttien tilabadget

Lisää jokaiseen kaaviokortiin `.chart-header`-riville oikealle puolelle pieni badge:

```
Uniformity        → "Tarkista"  (oranssi tausta)
Kupari High Contrast → "Huono"  (punainen tausta)
Low Contrast 2.0% → "OK"        (vihreä tausta)
MTF 50%           → "OK"        (vihreä tausta)
CNR               → "Huono"     (punainen tausta)
Median Contrast   → "Huono"     (punainen tausta)
```

Badge-tyyli:
```css
.badge-ok   { background: rgba(74,222,128,.12); color: #4ade80; }
.badge-warn { background: rgba(249,115,22,.12);  color: #f97316; }
.badge-bad  { background: rgba(248,113,113,.12); color: #f87171; }
```

---

## Osio 4 — Kaavioiden visuaalisuus

Jokaisessa SVG-kaaviossa:
- Lisää gradienttitäyttö (`linearGradient`) viivan alle, opacity 0 → 0.25
- Merkitse **viimeisin datapiste** isommalla ympyrällä (r=5) ja `stroke="#0d1117" stroke-width="2"`
- Jos viimeisin arvo on huono → piste punaisena (`#f87171`), muuten sarjan omalla värillä
- Lisää vaakaviivoitus (`stroke-dasharray="4,4"`) referenssiarvon kohdalle jos sellainen on

---

## Osio 5 — Oikea sarake: tekoäly + raportointi

Jaa oikea sarake kahteen osaan:

**Yläosa — Tekoäly-chat (flex: 1, scrollattava):**
- Viestihistoria: käyttäjän viestit oikealle (sinertävä tausta), assistentin viestit vasemmalle (tumma tausta, sininen vasen reuna)
- Järjestelmävaroitukset omalla tyylillä (oranssi reuna)
- Tekstikenttä + lähetä-nappi alareunassa

**Alaosa — Raportointipaneeli (kiinteä korkeus ~160px):**
- Oma `section-header` otsikolla "Raportoi ongelmasta"
- Textarea (korkeus ~70px)
- 2 nappia vierekkäin: "Peruuta" (neutraali) ja "Lähetä raportti" (oranssi, bold)

---

## Osio 6 — Pienet viimeistelyasiat

- **Topbar:** lisää oikealle "status"-alue: vihreä piste + teksti "Järjestelmä toimii" + päivämäärä
- **Metadatan arvot:** värikoodaa `YLINAT` oranssiksi, `CR` siniseksi badge-tyylillä, ok-arvot vihreiksi
- **Hover-efekti** kaaviokortille: `border-color` muuttuu aksenttiväriksi (transition 0.2s)
- **Scrollbar** kapea (4px) ja tumma kaikissa scrollattavissa alueissa

---

## Väripaletti (CSS-muuttujat)

```css
:root {
  --bg:       #0d1117;
  --surface:  #161b22;
  --surface2: #1c2330;
  --border:   #2a3441;
  --accent:   #3b82f6;
  --accent2:  #22d3ee;
  --warn:     #f97316;
  --ok:       #4ade80;
  --bad:      #f87171;
  --text:     #e6edf3;
  --muted:    #8b949e;
}
```

---

## Fontit

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
```

- UI-teksti: `IBM Plex Sans`
- Numeeriset arvot ja koodit: `IBM Plex Mono`

---

## Referenssikuva

Parannettu versio on tiedostossa `autoqad_improved_ui.html` — voit käyttää sitä visuaalisena referenssinä.
