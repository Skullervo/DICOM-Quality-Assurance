# =============================================================================
# LUT_table_codes.py — Anturin tunnistus DICOM-metadatasta (LUT-apukirjasto)
# =============================================================================
# ROOLI PUTKESSA:  tukee US-analyysiä (US_IQ_analysis3.py).
# Osa ultraäänikuvista ei sisällä anturin nimeä DICOM-metadatassa. Tällöin
# anturi tunnistetaan "look-up table" (LUT, Excel-taulukko probe-LUT.xls)
# -haulla: luetaan kuvasta joukko geometrisia tunnuskenttiä (ROI-koordinaatit
# ja fyysiset mittakaavat) ja etsitään taulukosta rivi, jonka arvot täsmäävät.
#
# Tämä tiedosto tarjoaa kaksi apufunktiota:
#   extract_parameters() — lukee tunnistuskentät DICOMista sanakirjaksi
#   get_name_from_df()    — etsii anturin nimen LUT-taulukosta noilla kentillä
# Lohko __main__-osassa on kehittäjän työkalu LUT-taulukon rakentamiseen.
# =============================================================================

import pydicom
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
import matplotlib as mpl
import os
import logging
mpl.rcParams["figure.dpi"] = 150

logger = logging.getLogger(__name__)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def extract_parameters(data, get_name = False):
    '''This function extract metadata information on the dicom and outputs to dictionary'''

    # DICOM-tagit joita käytetään anturin tunnistukseen:
    #   dct_params_1 = laitetason tiedot (malli, valmistaja), luetaan päätasolta
    #   dct_params_2 = ultraäänialueen geometria (ROI-kulmat RCX/RCY + fyysiset
    #                  yksiköt ja pikselivälit), luetaan Ultrasound Regions -sekvenssistä
    dct_params_1 = {'Model_name': 0x00081090,
                  'Manufacturer':0x00080070}
    dct_params_2 = {'RCX0': 0x00186018,
                  'RCY0': 0x0018601a,
                  'RCX1': 0x0018601c,
                  'RCY1': 0x0018601e,
                  'Phys_units_X': 0x00186024,
                  'Phys_units_Y': 0x00186026,
                  'Phys_delta_X': 0x0018602c,
                  'Phys_delta_Y': 0x0018602e}
    
    
    # Ultrasound Regions -sekvenssi (0018,6011); otetaan sen ensimmäinen alue.
    seq = data[0x0018, 0x6011]
    data_sub = seq[0]

    dct_params={}
    # Lue laitetason kentät päätasolta. Jokainen kääritään try/exceptiin, koska
    # kaikkia tageja ei välttämättä löydy -> puuttuva korvataan arvolla 'None'.
    for key in dct_params_1.keys():
        try: # tämä sen takia että välttämättä aina ei löydy kaikkia dicom-tietueita
            dct_params[key] = [data[dct_params_1[key]].value]
        except:
            dct_params[key] = ['None']

    # Lue geometriakentät ultraäänialueen alisekvenssistä, sama puuttumissuojaus.
    for key in dct_params_2.keys():
        try: # tämä sen takia että välttämättä aina ei löydy kaikkia dicom-tietueita
            dct_params[key] = [data_sub[dct_params_2[key]].value]
        except:
            dct_params[key] = ['None']

    # get_name=True: interaktiivinen tila LUT:n täydentämiseen. Näytetään kuva
    # käyttäjälle ja kysytään anturin nimi, joka lisätään palautettavaan sanakirjaan.
    # (Käytetään vain LUT-taulukon rakentamisessa, ei automaattisessa analyysissä.)
    if get_name:

        logger.info("Please look at the dicom image and remember the transducer name, close the image and this program will ask for the name to added to probe-LUT")
        plt.imshow(data.pixel_array), plt.show()
        cond = 'N'
        while cond == 'N':   # kysy kunnes käyttäjä vahvistaa nimen oikeaksi
            answer = input('Give the name of the transducer: ')
            logger.info("%s", answer)
            cond = input('Is the name okay [Y/N]?' )

            dct_params['Transducer_name'] =  [answer]

    #print(dct_params)

    return dct_params

def get_name_from_df(df, df1):
    '''This function fetches the name from df based on information in df1 '''
    # Etsi LUT-taulukosta (df) rivi, jonka KAIKKI tunnuskentät täsmäävät tutkittavan
    # kuvan kenttiin (df1). Täsmäys vaatii mallin + kaikki geometria-arvot samaksi.
    res = df.loc[(df['Model_name']==df1['Model_name'][0])
        & (df['RCX0'] == df1['RCX0'][0])
        & (df['RCY0'] == df1['RCY0'][0])
        & (df['RCX1'] == df1['RCX1'][0])
        & (df['RCY1'] == df1['RCY1'][0])
        & (df['Phys_units_X'] == df1['Phys_units_X'][0])
        & (df['Phys_units_Y'] == df1['Phys_units_Y'][0])
        & (df['Phys_delta_X'] == df1['Phys_delta_X'][0]) 
        & (df['Phys_delta_Y'] == df1['Phys_delta_Y'][0])]

    if res.empty:
        # Yhtään täsmäävää riviä ei löytynyt -> palautetaan erikoisarvo, josta
        # kutsuja tietää, ettei anturia tunnistettu (ja voi tarjota lisäystä LUT:iin).
        name = 'Not_found_from_LUT' #if no name then return this
    else:
        name = res.iloc[0]['Transducer_name']#get name

    return name

# Tämä osa ajetaan vain kun tiedostoa ajetaan suoraan (kehittäjän työkalu, ei
# osa automaattista analyysiä). Käy läpi kansion DICOM-tiedostot, kysyy kullekin
# anturin nimen interaktiivisesti ja rakentaa/päivittää LUT-Excel-taulukon,
# minkä jälkeen testaa, löytyvätkö nimet takaisin taulukosta.
#%%
if __name__ == "__main__":

    data_path = 'D:/AI_laatu/US_analysis/data_old/samsungmammo/'
    filenames = os.listdir(data_path)

    excel_writer = 'D:/AI_laatu/US_analysis/LUT2.xls'

    
    for filename in filenames:
        
        data = pydicom.dcmread(os.path.join(data_path, filename))
        dct_params = extract_parameters(data, get_name = True)
        
        df1 = pd.DataFrame(data = dct_params)
        try: 
            df = pd.read_excel(excel_writer)
        except:
            df = pd.DataFrame({})
        try:
            df.drop(['Unnamed: 0'], axis = 1, inplace=True)
        except:
            None
            
        
        frames = [df, df1]
        df_total = pd.concat(frames)        
        df_total.to_excel(excel_writer)       
#%%
    #% testaa toimiiko LUT:
    
    df = pd.read_excel(excel_writer)
    try:
        df.drop(['Unnamed: 0'], axis = 1, inplace=True)
    except:
        None
    excel_writer = 'D:/AI_laatu/US_analysis/LUT.xls'
    
    data_path = 'D:/AI_laatu/US_analysis/data_old/samsungmammo/'
    filenames = os.listdir(data_path)
    name_list = []
    for filename in filenames:
        
        data = pydicom.dcmread(os.path.join(data_path, filename))
        dct_params = extract_parameters(data)
        df1 = pd.DataFrame(data = dct_params)
        
        name = get_name_from_df(df, df1)
        name_list.append(name)
        
        #%%
    logger.info(name_list == df['Transducer_name']) 
     
    logger.info(name_list)
    logger.info(df['Transducer_name'])    
    
        
