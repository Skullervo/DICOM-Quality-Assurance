# -*- coding: utf-8 -*-
"""Taman koodin ajamalla saa lisattua probe-LUT - taulukkoon antureita"""
# =============================================================================
# LUT_taulukko_lisaa.py — Uuden anturin lisäys probe-LUT-taulukkoon
# =============================================================================
# ROOLI PUTKESSA:  tukee US-analyysiä. Kun US_IQ_analysis3.py kohtaa kuvan,
# jonka anturia ei löydy LUT-taulukosta, se voi kutsua AddToLUT():ia lisätäkseen
# anturin tiedot taulukkoon (kysyy nimen interaktiivisesti). Näin seuraavalla
# kerralla sama anturi tunnistetaan automaattisesti.
#
# HUOM (tunnettu ongelma): AddToLUT käyttää argparsea ja interaktiivista syötettä,
# mikä kaatuu palvelinajossa (ei terminaalia). Tämä on tiedossa oleva "LUT/
# anturinimi-bugi": suuri osa US-"epäonnistumisista" johtuu juuri tästä, ei
# aidosta QA-hylkäyksestä. Nimen tunnistus on tarkoitus siirtää erilliseksi
# kertaleimaukseksi (OCR) tulevaisuudessa.
# =============================================================================
import os
import time
import argparse
import yaml
import pydicom
from LUT_table_codes import extract_parameters
import pandas as pd
import xlrd                        # vanhan .xls-Excel-muodon lukemiseen
import logging
logger = logging.getLogger(__name__)
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO, format="%(message)s")



# Argparse-tyyppifunktio: hyväksyy vain olemassa olevan hakemistopolun.
def dir_path(string):
     if os.path.isdir(string):
         return string
     else:
         raise NotADirectoryError(string)

#Function to check whether given excel file contains Phys_Delta_X or Phys_Delta_Y values found in the given dictionary
# Tarkistaa, onko anturi JO taulukossa, vertaamalla sen fyysisiä pikselivälejä
# (Phys_delta_X/Y) kaikkiin taulukon soluihin. Estää saman anturin kahdennuksen.
def checkIfInLut(excel_file, dict_to_read):
    #Create workbook for excel reading
    wb = xlrd.open_workbook(excel_file)
    sheet = wb.sheet_by_index(0)
    sheet.cell_value(0,0)

    #Whether given value is in LUT or not
    isInLut = False

    # Käy taulukon solut läpi (vain 12 ensimmäistä saraketta) ja etsi täsmäävää
    # delta-arvoa. Löytyessä merkitään isInLut=True ja keskeytetään.
    for x in range(sheet.ncols):
        for y in range(sheet.nrows):
            if x >= 12:
                break
            
            #print("Cell cordinate is Y= " + str(y) + ", X= " + str(x) + " and cell value is = " + str(sheet.cell_value(y, x)))
            if str(sheet.cell_value(y, x)) == str(dict_to_read["Phys_delta_X"])[1:-1] or str(sheet.cell_value(y, x)) == str(dict_to_read["Phys_delta_Y"])[1:-1]:
                logger.info("Transducer delta value %s is already in probe-LUT", str(dict_to_read["Phys_delta_X"])[1:-1])
                isInLut = True
                break
            
        if isInLut == True:
            break

    return isInLut

# Lisää annetun DICOMin anturin probe-LUT-taulukkoon, jos sitä ei vielä ole.
# Lukee tunnuskentät (extract_parameters, get_name=True kysyy nimen), tarkistaa
# kahdennuksen ja liittää uuden rivin Excel-taulukkoon.
def AddToLUT(dicomPath):
    logger.info("AddToLUT entered")
    #Parser:
    parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter,
                                     description='Lisataan probe-LUT - taulukkoon antureita')
    #parser.add_argument('--data_path', type = dir_path, default = 'C:/ultra/Codes/Codes/QA_analysis/US_samsun/dcms2',
                        #help='hakemisto joka sisaltaa listattavat dicom tiedostot') 
    #parser.add_argument('--excel_writer_path', type = str, default = 'C:/ultra/Codes/Codes/QA_analysis/LUT.xls',
                        #help='Hakemistopolku excel tiedostoon johon tiedot lisataan automaattisesti')
                        
    #parser.add_argument('--data_path', type = dir_path, default = 'C:/ImageQualityAnalysisProjects/ultra/QA_analysis/data/dcm_files',
                        #help='hakemisto joka sisaltaa listattavat dicom tiedostot')
    parser.add_argument('--excel_writer_path', type = str, default = 'C:/Users/sylisiur/Desktop/LV_new/Automated IQ Tool/QA_analysis/probe-LUT.xls',
                        help='Hakemistopolku excel tiedostoon johon tiedot lisataan automaattisesti') 
     
    args = parser.parse_args()
    #data_path  = args.data_path
    excel_writer = args.excel_writer_path   # LUT-Excelin polku (argumentista)

    #filenames = os.listdir(data_path)
    #import pdb; pdb.set_trace()

    #for filename in filenames: #Tama looppi kay dcm tiedostot lapi ja lisaa metatiedot taulukkoon

    # Lue DICOM ja poimi tunnuskentät + kysy anturin nimi (get_name=True).
    data = pydicom.dcmread(dicomPath)
    dct_params = extract_parameters(data, get_name = True)

    #Only add the transducer into LUT, if it already isn't there
    # Lisää vain jos anturia ei vielä ole taulukossa (vältetään kahdennus).
    if checkIfInLut(excel_writer, dct_params) == False:
        df1 = pd.DataFrame(data = dct_params)          # uusi rivi
        try:
            df = pd.read_excel(excel_writer)           # lue nykyinen taulukko
        except:
            df = pd.DataFrame({})                      # tai aloita tyhjästä
        try:
            df.drop(['Unnamed: 0'], axis = 1, inplace=True)  # poista Excelin indeksisarake
        except:
            None

        # Liitä uusi rivi vanhojen perään ja kirjoita taulukko takaisin levylle.
        frames = [df, df1]
        df_total = pd.concat(frames)
        df_total.to_excel(excel_writer)

    logger.info("Reached end of AddToLUT")