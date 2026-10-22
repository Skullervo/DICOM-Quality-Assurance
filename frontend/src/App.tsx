import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import Intro from './pages/Intro'
import Login from './pages/Login'
import Layout from './components/Layout'
import Home from './pages/Home'
import Modaliteetit from './pages/Modaliteetit'
import Laitteet from './pages/Laitteet'
import LaitteetModaliteetti from './pages/LaitteetModaliteetti'
import Rajat from './pages/Rajat'
import Mittaukset from './pages/Mittaukset'
import MittauksetModaliteetti from './pages/MittauksetModaliteetti'
import Tietoa from './pages/Tietoa'
import USInstitutions from './pages/USInstitutions'
import USUnits from './pages/USUnits'
import USUnitDetails from './pages/USUnitDetails'
import USDeviceDetails from './pages/USDeviceDetails'
import USOverview from './pages/USOverview'
import USTable from './pages/USTable'
import USSummary from './pages/USSummary'
import XrayInstitutions from './pages/XrayInstitutions'
import XrayUnits from './pages/XrayUnits'
import XrayDeviceDetails from './pages/XrayDeviceDetails'
import CTInstitutions from './pages/CTInstitutions'
import CTUnits from './pages/CTUnits'
import CTDeviceDetails from './pages/CTDeviceDetails'
import AngioInstitutions from './pages/AngioInstitutions'
import AngioUnits from './pages/AngioUnits'
import AngioDeviceDetails from './pages/AngioDeviceDetails'
import PlatformDashboard from './pages/PlatformDashboard'
import ServiceList from './pages/ServiceList'
import StackList from './pages/StackList'
import Projects from './pages/Projects'

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* Julkiset reitit: intro + kirjautuminen */}
        <Route path="/intro" element={<Intro />} />
        <Route path="/login" element={<Login />} />

        {/* Suojatut reitit — vaativat kirjautumisen */}
        <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="modaliteetit" element={<Modaliteetit />} />
          <Route path="tietoa" element={<Tietoa />} />

          {/* Laitteet — modaliteettikohtaiset laitetaulukot */}
          <Route path="laitteet" element={<Laitteet />} />
          <Route path="laitteet/us" element={<LaitteetModaliteetti modality="us" />} />
          <Route path="laitteet/xray" element={<LaitteetModaliteetti modality="xray" />} />
          <Route path="laitteet/ct" element={<LaitteetModaliteetti modality="ct" />} />
          <Route path="laitteet/angio" element={<LaitteetModaliteetti modality="angio" />} />

          {/* Mittaukset — kaikki mittaukset (myös epäonnistuneet analyysit) */}
          <Route path="mittaukset" element={<Mittaukset />} />
          <Route path="mittaukset/us" element={<MittauksetModaliteetti modality="us" />} />
          <Route path="mittaukset/xray" element={<MittauksetModaliteetti modality="xray" />} />
          <Route path="mittaukset/ct" element={<MittauksetModaliteetti modality="ct" />} />
          <Route path="mittaukset/angio" element={<MittauksetModaliteetti modality="angio" />} />

          {/* Hyväksyttävyysrajat */}
          <Route path="rajat" element={<Rajat />} />

          {/* Ultraääni */}
          <Route path="us" element={<USOverview />} />
          <Route path="us/taulukko" element={<USTable />} />
          <Route path="us/summary" element={<USSummary />} />
          <Route path="us/institutions" element={<USInstitutions />} />
          <Route path="us/units" element={<USUnits />} />
          <Route path="us/units/:id" element={<USUnitDetails />} />
          <Route path="us/device/:station" element={<USDeviceDetails />} />

          {/* Natiiviröntgen */}
          <Route path="xray/institutions" element={<XrayInstitutions />} />
          <Route path="xray/units" element={<XrayUnits />} />
          <Route path="xray/device/:inst/:unit" element={<XrayDeviceDetails />} />

          {/* Tietokonetomografia */}
          <Route path="ct/institutions" element={<CTInstitutions />} />
          <Route path="ct/units" element={<CTUnits />} />
          <Route path="ct/device/:id" element={<CTDeviceDetails />} />

          {/* Angiografia / läpivalaisu */}
          <Route path="angio/institutions" element={<AngioInstitutions />} />
          <Route path="angio/units" element={<AngioUnits />} />
          <Route path="angio/device/:inst/:unit" element={<AngioDeviceDetails />} />

          {/* Hallinta */}
          <Route path="hallinta" element={<PlatformDashboard />} />
          <Route path="hallinta/services" element={<ServiceList />} />
          <Route path="hallinta/stacks" element={<StackList />} />
          <Route path="hallinta/projects" element={<Projects />} />
        </Route>
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  )
}
