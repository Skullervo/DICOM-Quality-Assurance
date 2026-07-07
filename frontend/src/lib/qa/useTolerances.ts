// Hakee DB:n toleranssit (hyväksyttävyysrajat). Jaettu laitesivujen ja
// rajojen muokkaussivun kesken; invalidointi ['tolerances'] päivittää molemmat.
import { useQuery } from '@tanstack/react-query'
import { api, type Tolerance } from '../../api/client'

export function useTolerances() {
  return useQuery<Tolerance[]>({ queryKey: ['tolerances'], queryFn: api.tolerances, staleTime: 60_000 })
}
