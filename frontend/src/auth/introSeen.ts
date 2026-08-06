// Muistaa onko intro jo näytetty TÄMÄN sivulatauksen aikana.
// Module-tason muuttuja nollautuu selaimen päivityksessä -> jos käyttäjä
// päivittää sivun ennen kirjautumista, intro ajetaan uudelleen.
let seen = false
export const markIntroSeen = () => { seen = true }
export const introSeen = () => seen
