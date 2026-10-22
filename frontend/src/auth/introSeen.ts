// =============================================================================
// auth/introSeen.ts — Muistaa onko intro-animaatio jo näytetty
// =============================================================================
// Pieni apumoduuli, joka estää intro-sivun toistamisen turhaan saman
// selainkäynnin aikana. Tieto on tavallinen moduulitason muuttuja (ei tallenneta
// mihinkään), joten se nollautuu aina kun sivu ladataan uudelleen.
// =============================================================================

// Muistaa onko intro jo näytetty TÄMÄN sivulatauksen aikana.
// Module-tason muuttuja nollautuu selaimen päivityksessä -> jos käyttäjä
// päivittää sivun ennen kirjautumista, intro ajetaan uudelleen.
let seen = false
// Merkitsee intron nähdyksi (kutsutaan kun intro on näytetty).
export const markIntroSeen = () => { seen = true }
// Kertoo onko intro jo nähty tämän latauksen aikana.
export const introSeen = () => seen
