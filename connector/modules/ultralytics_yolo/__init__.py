"""
Módulo de Entrenamiento: Ultralytics YOLO
Soporta YOLOv8, YOLOv9, YOLOv10, YOLOv11 para detección, segmentación, clasificación y pose.

Desarrollado por: TecMedHub - Universidad Austral de Chile
"""

from .trainer import train

__version__ = "1.0.0"
__author__ = "TecMedHub"
__description__ = "Módulo de entrenamiento con Ultralytics YOLO"

__all__ = ['train']
