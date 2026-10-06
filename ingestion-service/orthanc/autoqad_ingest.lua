-- AutoQAD — Orthanc webhook (manuscript §2.2.1 -> §2.2.2)
-- Kun study on vakaa (kaikki kuvat vastaanotettu), POST ingestion-palvelulle,
-- joka enumeroi studyn ja luo QA-jobit.
--
-- Käyttö: mountaa tämä Orthanc-konttiin ja viittaa Orthanc-konfiguraatiossa:
--   "LuaScripts": ["/etc/orthanc/autoqad_ingest.lua"]
--
-- INGESTION_URL voidaan yliajaa Orthancin ympäristöstä; oletus klusterin DNS-nimi.

local INGESTION_URL = os.getenv("INGESTION_URL") or "http://ingestion-service:8000/webhook/study"

function OnStableStudy(studyId, tags, metadata)
   local payload = DumpJson({
      resource_id = studyId,
      change_type = "StableStudy",
      level = "Study"
   }, true)
   -- HttpPost(url, body, headers). Virheet eivät saa kaataa Orthancia -> pcall.
   local ok, err = pcall(function()
      HttpPost(INGESTION_URL, payload, { ["Content-Type"] = "application/json" })
   end)
   if ok then
      print("AutoQAD: ingestion notified for study " .. studyId)
   else
      print("AutoQAD: ingestion POST failed for study " .. studyId .. ": " .. tostring(err))
   end
end
