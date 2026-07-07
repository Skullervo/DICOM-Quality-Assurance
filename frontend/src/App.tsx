import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Modaliteetit from './pages/Modaliteetit'
import Laitteet from './pages/Laitteet'
import LaitteetModaliteetti from './pages/LaitteetModaliteetti'
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
import PlatformDashboard from './pages/PlatformDashboard'
import ServiceList from './pages/ServiceList'
import StackList from './pages/StackList'
import Projects from './pages/Projects'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="modaliteetit" element={<Modaliteetit />} />
          <Route path="tietoa" element={<Tietoa />} />

          {/* Laitteet — modaliteettikohtaiset laitetaulukot */}
          <Route path="laitteet" element={<Laitteet />} />
          <Route path="laitteet/us" element={<LaitteetModaliteetti modality="us" />} />
          <Route path="laitteet/xray" element={<LaitteetModaliteetti modality="xray" />} />
          <Route path="laitteet/ct" element={<LaitteetModaliteetti modality="ct" />} />

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

          {/* Hallinta */}
          <Route path="hallinta" element={<PlatformDashboard />} />
          <Route path="hallinta/services" element={<ServiceList />} />
          <Route path="hallinta/stacks" element={<StackList />} />
          <Route path="hallinta/projects" element={<Projects />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
