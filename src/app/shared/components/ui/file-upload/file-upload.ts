import { Component, Input, Output, EventEmitter, signal, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadModule, FileUpload } from 'primeng/fileupload';
import { ImageModule } from 'primeng/image';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { LazyImage } from '../lazy-image/lazy-image';

export interface FilePreview {
  file: File | null;       // null cuando es una imagen existente (modo edición)
  previewUrl: string | null;
  isImage: boolean;
  isExisting: boolean;     // true si viene del servidor (modo edición)
  name: string;
  size: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, FileUploadModule, ImageModule, ButtonModule, TooltipModule, ToastModule, LazyImage],
  providers: [MessageService],
  templateUrl: './file-upload.html',
  styleUrl: './file-upload.scss'
})
export class FileUploadComponent implements OnChanges {
  @Input() accept: string = 'image/*,.pdf';
  @Input() maxFileSize: number = 5000000; // 5MB
  @Input() multiple: boolean = false;
  @Input() maxFiles: number = 0; // 0 = sin límite
  @Input() existingImageUrl?: string; // URL de imagen existente (para modo edición)
  @Input() existingImageUrls?: string[]; // URLs de imágenes existentes (modo edición múltiple)
  @Input() chooseLabel: string = 'Subir Comprobante';
  @Input() hint: string = 'PNG, JPG, PDF hasta 5MB';
  @Input() existingLabel: string = 'Comprobante actual';
  @Input() compact: boolean = false;
  @Output() fileSelect = new EventEmitter<File[]>();

  @ViewChild('fileUpload') fileUploadComponent?: FileUpload;

  filePreviews = signal<FilePreview[]>([]);
  imageExplicitlyRemoved = signal<boolean>(false);

  constructor(private messageService: MessageService) {}

  ngOnChanges(changes: SimpleChanges) {
    // Si el usuario eliminó explícitamente las imágenes, no restaurarlas a menos que cambie el input
    if (this.imageExplicitlyRemoved() && 
        changes['existingImageUrl']?.previousValue === changes['existingImageUrl']?.currentValue &&
        changes['existingImageUrls']?.previousValue === changes['existingImageUrls']?.currentValue) {
      return;
    }

    // Si los inputs cambiaron a null/undefined, resetear el flag de eliminación
    if ((changes['existingImageUrl'] && !this.existingImageUrl) || 
        (changes['existingImageUrls'] && (!this.existingImageUrls || this.existingImageUrls.length === 0))) {
      this.imageExplicitlyRemoved.set(false);
    }

    // Manejar múltiples URLs existentes
    if (changes['existingImageUrls'] && this.existingImageUrls && this.existingImageUrls.length > 0 && !this.imageExplicitlyRemoved()) {
      const currentNewFiles = this.filePreviews().filter(p => !p.isExisting);
      const existingPreviews: FilePreview[] = this.existingImageUrls.map(url => {
        const urlLower = url.toLowerCase();
        const isPdf = urlLower.includes('.pdf') || urlLower.includes('/pdf/');
        return {
          file: null,
          previewUrl: url,
          isImage: !isPdf,
          isExisting: true,
          name: 'Comprobante existente',
          size: ''
        };
      });
      this.filePreviews.set([...existingPreviews, ...currentNewFiles]);
    }
    // Manejar URL única existente (compatibilidad)
    else if (changes['existingImageUrl'] && this.existingImageUrl && !this.imageExplicitlyRemoved()) {
      const hasNewFiles = this.filePreviews().some(p => !p.isExisting);
      if (!hasNewFiles) {
        const urlLower = this.existingImageUrl.toLowerCase();
        const isPdf = urlLower.includes('.pdf') || urlLower.includes('/pdf/');
        const existingPreview: FilePreview = {
          file: null,
          previewUrl: this.existingImageUrl,
          isImage: !isPdf,
          isExisting: true,
          name: 'Comprobante actual',
          size: ''
        };
        this.filePreviews.set([existingPreview]);
      }
    } else if (!this.existingImageUrl && !this.existingImageUrls?.length) {
      // Si no hay URLs existentes, solo mantener los archivos nuevos
      const currentNewFiles = this.filePreviews().filter(p => !p.isExisting);
      if (currentNewFiles.length !== this.filePreviews().length) {
        this.filePreviews.set(currentNewFiles);
      }
    }
  }

  onFileSelect(event: any) {
    const files: File[] = event.files;

    if (files && files.length > 0) {
      // Resetear flag de eliminación al seleccionar nuevos archivos
      this.imageExplicitlyRemoved.set(false);

      // Calcular cuántos archivos se pueden agregar según el límite
      let filesToAdd = Array.from(files);
      if (this.maxFiles > 0) {
        const currentCount = this.filePreviews().length;
        const remaining = this.maxFiles - currentCount;
        if (remaining <= 0) {
          this.messageService.add({
            severity: 'warn',
            summary: 'Límite alcanzado',
            detail: `Solo se permiten ${this.maxFiles} archivo${this.maxFiles > 1 ? 's' : ''}`
          });
          if (this.fileUploadComponent) {
            this.fileUploadComponent.clear();
          }
          return;
        }
        if (filesToAdd.length > remaining) {
          filesToAdd = filesToAdd.slice(0, remaining);
          this.messageService.add({
            severity: 'warn',
            summary: 'Límite de archivos',
            detail: `Solo se agregaron ${remaining} archivo${remaining > 1 ? 's' : ''} (máximo ${this.maxFiles})`
          });
        }
      }

      for (const file of filesToAdd) {
        const preview: FilePreview = {
          file: file,
          previewUrl: null,
          isImage: file.type.startsWith('image/'),
          isExisting: false,
          name: file.name,
          size: this.formatFileSize(file.size)
        };

        // Crear preview si es imagen
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            preview.previewUrl = e.target.result;
            // Forzar actualización del signal
            this.filePreviews.update(previews => [...previews]);
          };
          reader.readAsDataURL(file);
        }

        this.filePreviews.update(previews => [...previews, preview]);
      }

      // Emitir solo los archivos nuevos (File objects)
      this.emitFiles();

      // Limpiar el componente PrimeNG para permitir seleccionar más archivos
      if (this.fileUploadComponent) {
        this.fileUploadComponent.clear();
      }
    }
  }

  /**
   * Indica si se alcanzó el límite máximo de archivos
   */
  isMaxFilesReached(): boolean {
    return this.maxFiles > 0 && this.filePreviews().length >= this.maxFiles;
  }

  /**
   * Obtiene los archivos seleccionados actuales (solo File, no existentes)
   */
  getSelectedFiles(): File[] {
    return this.filePreviews()
      .filter(p => p.file !== null)
      .map(p => p.file!);
  }

  /**
   * Obtiene el primer archivo seleccionado (compatibilidad)
   */
  getSelectedFile(): File | null {
    const files = this.getSelectedFiles();
    return files.length > 0 ? files[0] : null;
  }

  onError(event: any) {
    let errorMessage = 'Error al subir el archivo';
    
    if (event.error) {
      const error = event.error.toString().toLowerCase();
      if (error.includes('file size')) {
        errorMessage = 'El archivo es demasiado grande. Tamaño máximo: 5MB';
      } else if (error.includes('file type') || error.includes('invalid file type')) {
        errorMessage = 'Tipo de archivo no válido. Solo se permiten PNG, JPG y PDF';
      } else {
        errorMessage = event.error;
      }
    }
    
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: errorMessage
    });
  }

  /**
   * Elimina un archivo por su índice
   */
  onRemoveAt(index: number) {
    const previews = this.filePreviews();
    if (index >= 0 && index < previews.length) {
      const removed = previews[index];
      this.filePreviews.update(p => p.filter((_, i) => i !== index));
      
      // Si se eliminó una imagen existente, marcar como explícitamente eliminada
      if (removed.isExisting) {
        const hasMoreExisting = this.filePreviews().some(p => p.isExisting);
        if (!hasMoreExisting) {
          this.imageExplicitlyRemoved.set(true);
        }
      }

      this.emitFiles();
    }
  }

  /**
   * Elimina todos los archivos (compatibilidad con el método antiguo)
   */
  onRemove() {
    this.filePreviews.set([]);
    this.imageExplicitlyRemoved.set(true);
    
    if (this.fileUploadComponent) {
      this.fileUploadComponent.clear();
    }
    
    this.fileSelect.emit([]);
  }

  clear() {
    this.filePreviews.set([]);
    this.imageExplicitlyRemoved.set(false);
    
    if (this.fileUploadComponent) {
      this.fileUploadComponent.clear();
    }
    this.fileSelect.emit([]);
  }

  hasFiles(): boolean {
    return this.filePreviews().length > 0;
  }

  hasExistingImages(): boolean {
    return this.filePreviews().some(p => p.isExisting);
  }

  /**
   * Obtiene las URLs de imágenes existentes que el usuario conservó (no eliminó)
   */
  getExistingImageUrls(): string[] {
    return this.filePreviews()
      .filter(p => p.isExisting && p.previewUrl)
      .map(p => p.previewUrl!);
  }

  private emitFiles() {
    const newFiles = this.getSelectedFiles();
    this.fileSelect.emit(newFiles);
  }

  private formatFileSize(bytes: number): string {
    const sizeInMB = bytes / (1024 * 1024);
    return sizeInMB.toFixed(2) + ' MB';
  }

  // Métodos de compatibilidad (para componentes que usan la API antigua)
  getFileName(): string {
    const files = this.getSelectedFiles();
    return files.length > 0 ? files[0].name : '';
  }

  getFileSize(): string {
    const files = this.getSelectedFiles();
    if (files.length === 0) return '';
    return this.formatFileSize(files[0].size);
  }
}
