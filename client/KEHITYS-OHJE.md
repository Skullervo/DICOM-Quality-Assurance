# 🔧 Django-kehityksen vinkkejä - Välimuistin hallinta

## ⚡ Nopeat komennot muutosten päivittämiseen

### Windows PowerShell:
```powershell
# Päivitä vain staattiset tiedostot
.\update-static.ps1

# Käynnistä koko kehityspalvelin uudelleen  
.\dev-server.bat
```

### Bash/Linux:
```bash
# Käynnistä kehityspalvelin
./dev-server.sh
```

## 🌐 Selaimen välimuistin tyhjentäminen

### Chrome/Edge:
- **Ctrl + Shift + R** - Hard refresh (ohittaa välimuisti)
- **F12** → **Network**-välilehti → **Disable cache** ☑️ (kehitystyöhön)
- **Ctrl + Shift + Delete** - Tyhjennä välimuisti kokonaan

### Firefox:  
- **Ctrl + F5** - Hard refresh
- **Ctrl + Shift + Delete** - Tyhjennä välimuisti

### Safari:
- **Cmd + Option + R** - Hard refresh  
- **Cmd + Option + E** - Tyhjennä välimuisti

## 🔄 Django-kehityksen workflow

1. **Muuta JS/CSS-tiedostoja** `static/` hakemistossa
2. **Aja:** `.\update-static.ps1` 
3. **Päivitä selain:** `Ctrl + Shift + R`
4. **Jos ei toimi:** Tarkista DevTools → Network → 304/200 status

## 🚨 Yleisimmät ongelmat

### Muutokset eivät näy:
1. ✅ Oikea tiedosto muutettu? (tarkista HTML-templatesta)
2. ✅ `collectstatic` ajettu?
3. ✅ Hard refresh tehty?
4. ✅ DevTools cache poistettu käytöstä?

### Django ei löydä staattisia tiedostoja:
1. Tarkista `STATIC_URL` ja `STATICFILES_DIRS` settings.py:ssä
2. Aja `python manage.py findstatic tiedosto.js` 
3. Varmista että tiedosto on oikeassa hakemistossa

## 💡 Kehitysvinkkejä

- **DEBUG = True** → Django servaa staattiset tiedostot automaattisesti
- **Käytä version numbering:** `script.js?v=1.2` URL:issa
- **DevTools Network-välilehti:** Näyttää onko tiedosto ladattu välimuistista (304) vai palvelimelta (200)