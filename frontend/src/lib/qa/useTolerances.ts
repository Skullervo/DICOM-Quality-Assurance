// =============================================================================
// lib/qa/useTolerances.ts — Hook toleranssirajojen hakemiseen (TanStack Query)
// =============================================================================
// Hakee tietokannan toleranssirajat ja välimuistittaa ne. Sama hook jaetaan
// laitesivujen (jotka tarvitsevat rajat statuksen laskemiseen) ja rajojen
// muokkaussivun kesken. Kun rajoja muokataan, välimuisti mitätöidään avaimella
// ['tolerances'], jolloin molemmat päivittyvät yhtä aikaa.
// =============================================================================

// Hakee DB:n toleranssit (hyväksyttävyysrajat). Jaettu laitesivujen ja
// rajojen muokkaussivun kesken; invalidointi ['tolerances'] päivittää molemmat.
import { useQuery } from '@tanstack/react-query'
import { api, type Tolerance } from '../../api/client'

export function useTolerances() {
  // queryKey ['tolerances'] = välimuistin avain; staleTime 60 s = pidä tuoreena minuutin.
  return useQuery<Tolerance[]>({ queryKey: ['tolerances'], queryFn: api.tolerances, staleTime: 60_000 })
}
