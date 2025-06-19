# -*- coding: utf-8 -*-
"""Taman koodin ajamalla saa lisattua probe-LUT - taulukkoon antureita"""
import os
import time
import argparse
import yaml
import pydicom
from LUT_table_codes import extract_parameters
import pandas as pd
import xlrd


def dir_path(string):
     if os.path.isdir(string):
         return string
     else:
         raise NotADirectoryError(string)
         
#Function to check whether given excel file contains Phys_Delta_X or Phys_Delta_Y values found in the given dictionary
def checkIfInLut(excel_file, dict_to_read):
    #Create workbook for excel reading
    wb = xlrd.open_workbook(excel_file)
    sheet = wb.sheet_by_index(0)
    sheet.cell_value(0,0)
    
    #Whether given value is in LUT or not
    isInLut = False
    
    #Check whether the newly added transducer is already in the list
    for x in range(sheet.ncols):
        for y in range(sheet.nrows):
            if x >= 12:
                break
            
            #print("Cell cordinate is Y= " + str(y) + ", X= " + str(x) + " and cell value is = " + str(sheet.cell_value(y, x)))
            if str(sheet.cell_value(y, x)) == str(dict_to_read["Phys_delta_X"])[1:-1] or str(sheet.cell_value(y, x)) == str(dict_to_read["Phys_delta_Y"])[1:-1]:
                print("Transducer delta value " + str(dict_to_read["Phys_delta_X"])[1:-1] + " is already in probe-LUT")
                isInLut = True
                break
            
        if isInLut == True:
            break
            
    return isInLut

def AddToLUT(dicomPath):
    print("AddToLUT entered")
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
    excel_writer = args.excel_writer_path
    
    #filenames = os.listdir(data_path)
    #import pdb; pdb.set_trace()
    
    #for filename in filenames: #Tama looppi kay dcm tiedostot lapi ja lisaa metatiedot taulukkoon
        
    data = pydicom.dcmread(dicomPath)
    dct_params = extract_parameters(data, get_name = True)
                
    #Only add the transducer into LUT, if it already isn't there
    if checkIfInLut(excel_writer, dct_params) == False:
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
        
    print("Reached end of AddToLUT")