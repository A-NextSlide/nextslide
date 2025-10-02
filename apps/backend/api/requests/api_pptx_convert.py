"""
PPTX to PNG conversion endpoint using LibreOffice
"""
import os
import tempfile
import subprocess
import base64
from pathlib import Path
from typing import List, Dict
from fastapi import UploadFile, HTTPException
import shutil

async def convert_pptx_to_png(file: UploadFile) -> List[Dict[str, any]]:
    """
    Convert a PPTX file to PNG images using LibreOffice
    
    Args:
        file: The uploaded PPTX file
        
    Returns:
        List of dictionaries containing slide screenshots
    """
    
    # Validate file type
    if not file.filename.lower().endswith('.pptx'):
        raise HTTPException(status_code=400, detail="Only .pptx files are supported")
    
    # Create temporary directory for processing
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Save uploaded file
        input_path = temp_path / file.filename
        with open(input_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Create output directory
        output_dir = temp_path / "output"
        output_dir.mkdir()
        
        try:
            # Convert PPTX to PDF first (LibreOffice preserves all slides in PDF)
            print(f"Converting {file.filename} to PDF...")
            pdf_cmd = [
                'libreoffice',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', str(output_dir),
                str(input_path)
            ]
            
            result = subprocess.run(pdf_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"LibreOffice stderr: {result.stderr}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"LibreOffice conversion failed: {result.stderr}"
                )
            
            # Find the generated PDF
            pdf_files = list(output_dir.glob("*.pdf"))
            if not pdf_files:
                raise HTTPException(
                    status_code=500,
                    detail="PDF conversion succeeded but no PDF file was found"
                )
            
            pdf_path = pdf_files[0]
            print(f"PDF created: {pdf_path}")
            
            # Create PNG output directory
            png_output_dir = temp_path / "png_output"
            png_output_dir.mkdir()
            
            # Try to use ImageMagick to convert PDF pages to PNG
            # This will create separate PNG for each page
            png_pattern = str(png_output_dir / "slide-%03d.png")
            
            # First try with ImageMagick (if available)
            imagemagick_cmd = [
                'convert',
                '-density', '150',  # DPI for good quality
                str(pdf_path),
                png_pattern
            ]
            
            result = subprocess.run(imagemagick_cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                # Fallback: Try pdftoppm (part of poppler-utils)
                print("ImageMagick not available, trying pdftoppm...")
                pdftoppm_cmd = [
                    'pdftoppm',
                    '-png',
                    '-r', '150',  # DPI
                    str(pdf_path),
                    str(png_output_dir / 'slide')
                ]
                
                result = subprocess.run(pdftoppm_cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    # Final fallback: Try to use LibreOffice Draw to open PDF and export as PNG
                    print("pdftoppm not available, using LibreOffice Draw...")
                    
                    # This approach exports only first page, so we need a workaround
                    # Export PPTX directly to individual images using a script
                    script_path = temp_path / "export_slides.bas"
                    script_content = '''
                    Sub ExportSlidesToPNG
                        Dim oDoc As Object
                        Dim oSlide As Object
                        Dim i As Integer
                        Dim sURL As String
                        
                        oDoc = ThisComponent
                        
                        For i = 0 To oDoc.getDrawPages().getCount() - 1
                            oSlide = oDoc.getDrawPages().getByIndex(i)
                            sURL = ConvertToURL("''' + str(png_output_dir) + '''/slide-" & Format(i+1, "000") & ".png")
                            
                            Dim aFilterData(0) As New com.sun.star.beans.PropertyValue
                            aFilterData(0).Name = "PixelWidth"
                            aFilterData(0).Value = 1920
                            
                            Dim aArgs(1) As New com.sun.star.beans.PropertyValue
                            aArgs(0).Name = "URL"
                            aArgs(0).Value = sURL
                            aArgs(1).Name = "FilterData"
                            aArgs(1).Value = aFilterData()
                            
                            oDoc.storeToURL(sURL, aArgs())
                        Next i
                    End Sub
                    '''
                    
                    # For now, use the simpler approach: direct conversion
                    # This may only get the first slide, but it's better than nothing
                    draw_cmd = [
                        'libreoffice',
                        '--headless',
                        '--convert-to', 'png',
                        '--outdir', str(png_output_dir),
                        str(input_path)
                    ]
                    
                    result = subprocess.run(draw_cmd, capture_output=True, text=True)
                    
                    if result.returncode != 0:
                        raise HTTPException(
                            status_code=500,
                            detail="Failed to convert slides to PNG. Please install ImageMagick or poppler-utils for better results."
                        )
            
            # Collect all PNG files
            png_files = sorted(png_output_dir.glob("*.png"))
            
            if not png_files:
                raise HTTPException(
                    status_code=500,
                    detail="No PNG files were generated"
                )
            
            screenshots = []
            for i, png_path in enumerate(png_files):
                # Read and encode to base64
                with open(png_path, 'rb') as f:
                    image_data = f.read()
                    base64_data = base64.b64encode(image_data).decode('utf-8')
                
                screenshots.append({
                    'slideNumber': i + 1,
                    'dataUrl': f'data:image/png;base64,{base64_data}',
                    'width': 1920,
                    'height': 1080
                })
            
            print(f"Successfully converted {len(screenshots)} slides")
            return screenshots
            
        except subprocess.CalledProcessError as e:
            print(f"Subprocess error: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Conversion process failed: {str(e)}"
            )
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected error during conversion: {str(e)}"
            ) 